import {DurableObject} from 'cloudflare:workers';
import {ledger} from './ledger';
import {jobFromPath, MAX_ATTEMPTS, DEADLINE_MS, MAX_INPUT, boundedBytes, estimatedComputeUSD, outputKey, PROFILES} from './policy.mjs';
import {processJob, eligible} from './processing.mjs';

export class MediaProcessor extends DurableObject<Env> {
  private jobs;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.jobs = ledger(ctx.storage.sql);
    // Interrupted jobs never silently acquire another compute reservation.
    ctx.blockConcurrencyWhile(async () => {
      if (this.jobs.snapshot().some(job => job.state === 'running')) {
        this.jobs.interrupt(Date.now());
      }
      if (this.jobs.cleanupPending()) {
        if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + 10000);
        await this.stopInterrupted();
        await this.ctx.storage.deleteAlarm();
      }
    });
  }
  private async stopInterrupted(): Promise<void> {
    await this.ctx.container?.destroy();
    for (const job of this.jobs.snapshot().filter(job => job.failure === 'interrupted_or_deadline')) {
      await this.env.MEDIA.delete(Object.keys(PROFILES).map(profile => outputKey(job.id, profile)));
    }
    this.jobs.cleanupDone();
  }
  async alarm(): Promise<void> {
    // Retried stop attempts still work after the running row has been fenced.
    if (this.jobs.paused()) { if (this.jobs.cleanupPending()) await this.stopInterrupted(); return; }
    const active = this.jobs.snapshot().find(job => job.state === 'running');
    if (!active) return;
    const deadline = active.started + DEADLINE_MS;
    if (Date.now() < deadline) { await this.ctx.storage.setAlarm(deadline); return; }
    this.jobs.interrupt(Date.now());
    await this.stopInterrupted();
  }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/status') return Response.json({mode: 'bounded-benchmark', paused: this.jobs.paused(), maximumAttempts: MAX_ATTEMPTS, deadlineSeconds: DEADLINE_MS / 1000, running: this.ctx.container?.running || false, jobs: this.jobs.snapshot(), computeUpperEstimateUSD: estimatedComputeUSD(MAX_ATTEMPTS * DEADLINE_MS)});
    const result = path.match(/^\/result\/([a-z0-9-]+)\/(thumb|card|display|poster|preview|playlist|segment)$/);
    if (request.method === 'GET' && result) {
      const job = this.jobs.get(result[1]);
      if (!job || job.state !== 'ready' || !await eligible(this.env, job.file)) return new Response('Unavailable', {status: 404});
      const object = await this.env.MEDIA.get(outputKey(result[1], result[2]));
      if (!object || !await eligible(this.env, job.file)) { await object?.body.cancel(); return new Response('Unavailable', {status: 404}); }
      const profile = result[2] as keyof typeof PROFILES;
      return new Response(object.body, {headers: {'Content-Type': PROFILES[profile], 'Cache-Control': 'private, no-store'}});
    }
    const job = jobFromPath(path);
    if (request.method !== 'POST' || !job) return new Response('Not found', {status: 404});
    if (!await eligible(this.env, job.file)) return new Response('Media unavailable', {status: 404});
    const existing = this.jobs.get(job.id);
    if (existing?.state === 'ready') return Response.json({reused: true, job: existing});
    const started = Date.now(), admitted = this.jobs.admit(job, started);
    if (admitted !== 'admitted') return Response.json({error: admitted}, {status: admitted === 'busy' ? 409 : 429});
    const container = this.ctx.container;
    let output: Awaited<ReturnType<typeof processJob>> | null = null;
    let failed = false;
    try {
      if (!container) throw Error('Container unavailable');
      await this.ctx.storage.setAlarm(started + DEADLINE_MS);
      container.start({enableInternet: false});
      await container.setInactivityTimeout(1000);
      const port = container.getTcpPort(8080);
      const assertActive = () => {
        if (Date.now() >= started + DEADLINE_MS || this.jobs.get(job.id)?.state !== 'running') throw Error('Job expired');
      };
      // Startup failures are expected while a newly deployed image is being placed.
      let ready = false;
      while (Date.now() - started < 45000) {
        try { const response = await port.fetch('http://container/health', {signal: AbortSignal.timeout(2000)}); if (response.ok) { await response.body?.cancel(); ready = true; break; } await response.body?.cancel(); } catch { /* bounded startup retry */ }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (!ready) throw Error('Container startup timed out');
      output = await processJob(this.env, job, async (route: string, original: R2ObjectBody | null) => {
        assertActive();
        // A bounded byte buffer gives workerd a known length; a hand-set length on
        // an arbitrary stream is ignored and would make the adapter reject framing.
        const body = original ? await boundedBytes(original.body, MAX_INPUT) : undefined;
        if (original && body?.length !== original.size) throw Error('Original size changed');
        assertActive();
        if (!await eligible(this.env, job.file)) throw Error('Media permission changed');
        assertActive();
        return port.fetch('http://container' + route, {method: 'POST', body, signal: AbortSignal.timeout(Math.max(1, started + DEADLINE_MS - Date.now()))});
      }, assertActive);
      assertActive();
    } catch {
      failed = true;
    } finally {
      // Keep the persisted alarm if shutdown fails; it will retry the stop.
      await container?.destroy();
      await this.ctx.storage.deleteAlarm();
    }
    // Hold admission until shutdown has completed; a prior job cannot stop the next one.
    failed ||= !output || this.jobs.get(job.id)?.state !== 'running';
    this.jobs.finish(job.id, failed ? 'failed' : 'ready', Date.now(), {...(output || {}), elapsed: Date.now() - started, failure: failed ? 'processing_failed_or_deadline' : null});
    return Response.json({job: this.jobs.get(job.id), output, estimatedComputeUSD: estimatedComputeUSD(Date.now() - started)}, {status: failed ? 503 : 200});
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Private service binding only: no routes, workers.dev or preview URL.
    try { return await env.PROCESSOR.getByName('owner-benchmark-v1').fetch(request); }
    catch {
      // The platform can close a connection after the result was committed.
      // Read its ledger with a fresh stub; never replay an expensive action.
      const job = request.method === 'POST' ? jobFromPath(new URL(request.url).pathname) : null;
      if (job) {
        try {
          const response = await env.PROCESSOR.getByName('owner-benchmark-v1').fetch(new Request('https://processor/status'));
          const snapshot = await response.json<{jobs: {id: string; state: string}[]}>();
          const saved = snapshot.jobs.find(item => item.id === job.id && item.state === 'ready');
          if (saved) return Response.json({recovered: true, job: saved});
        } catch { /* The owner can still check persisted status separately. */ }
      }
      return Response.json({error: 'Connection interrupted. Check saved status before another action.'}, {status: 503});
    }
  },
} satisfies ExportedHandler<Env>;
