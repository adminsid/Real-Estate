import {describe, it, expect, vi, afterEach} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
vi.mock('cloudflare:workers', () => ({DurableObject: class {
  ctx; env;
  constructor(ctx: unknown, env: unknown) {this.ctx = ctx; this.env = env;}
}}));
import worker, {MediaProcessor} from '../src/index';
import {ledger} from '../src/ledger';
import {DEADLINE_MS} from '../src/policy.mjs';

async function fixture() {
  const db = new DatabaseSync(':memory:');
  const sql = {exec(query: string, ...values: (string | number | null)[]) {
    const statement = db.prepare(query);
    const rows = statement.columns().length ? statement.all(...values) : (statement.run(...values), []);
    return {toArray: () => rows};
  }};
  const native = vi.fn(async () => new Response('ready'));
  const container = {running: false, destroy: vi.fn(async () => {}), start: vi.fn(), setInactivityTimeout: vi.fn(), getTcpPort: () => ({fetch: native})};
  let initialization: Promise<unknown> = Promise.resolve();
  const storage = {sql, getAlarm: vi.fn(async () => null), setAlarm: vi.fn(async () => {}), deleteAlarm: vi.fn(async () => {})};
  const ctx = {storage, container, blockConcurrencyWhile: (callback: () => Promise<unknown>) => {initialization = callback();}};
  let allowed = true;
  const env = {DB: {prepare: () => ({bind: () => ({first: async () => allowed ? {file: 'a'.repeat(64)} : null})})}, MEDIA: {get: vi.fn(async () => ({size: 4, httpMetadata: {contentType: 'image/jpeg'}, body: new ReadableStream({pull(controller) {allowed = false; controller.enqueue(new Uint8Array(4)); controller.close();}})})), delete: vi.fn(async () => {})}};
  const processor = new MediaProcessor(ctx as DurableObjectState, env as Env);
  await initialization;
  return {processor, jobs: ledger(sql as SqlStorage), container, storage, env, native, async reconstruct() {new MediaProcessor(ctx as DurableObjectState, env as Env); await initialization;}};
}
afterEach(() => vi.useRealTimers());
describe('container lifecycle fencing', () => {
  it('recovers a committed result from a fresh stub after connection loss without replaying processing', async () => {
    const first = {fetch: vi.fn(async () => {throw Error('Network connection lost');})};
    const second = {fetch: vi.fn(async () => Response.json({jobs: [{id: 'synthetic-video-v1', state: 'ready'}]}))};
    const getByName = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const response = await worker.fetch(new Request('https://processor/benchmark/video', {method: 'POST'}), {PROCESSOR: {getByName}} as Env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({recovered: true, job: {id: 'synthetic-video-v1', state: 'ready'}});
    expect(first.fetch).toHaveBeenCalledOnce();
    expect(second.fetch.mock.calls[0][0].method).toBe('GET');
    expect(second.fetch.mock.calls[0][0].url).toBe('https://processor/status');
  });
  it('retries a failed stop after fencing the deadline and cleans persisted partial outputs', async () => {
    vi.useFakeTimers(); vi.setSystemTime(500000);
    const {processor, jobs, container, env, storage, reconstruct} = await fixture();
    jobs.admit({id: 'interrupted', kind: 'image', file: 'a'.repeat(64)}, 1);
    container.destroy.mockRejectedValueOnce(Error('temporary stop failure'));
    await expect(processor.alarm()).rejects.toThrow('stop failure');
    expect(jobs.paused()).toBe(true);
    expect(jobs.admit({id: 'new-job', kind: 'video', file: null}, 600000)).toBe('paused_after_interruption');
    await processor.alarm();
    expect(container.destroy).toHaveBeenCalledTimes(2);
    expect(env.MEDIA.delete).toHaveBeenCalledWith(expect.arrayContaining(['native-benchmark/v1/interrupted/thumb', 'native-benchmark/v1/interrupted/card']));
    expect(jobs.cleanupPending()).toBe(false);
    await reconstruct();
    expect(jobs.paused()).toBe(true);
    expect(container.destroy).toHaveBeenCalledTimes(2);
    expect(storage.setAlarm).not.toHaveBeenCalled();
  });
  it('reschedules an early or stale alarm without stopping the current job', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000);
    const {processor, jobs, container, storage} = await fixture();
    jobs.admit({id: 'current', kind: 'video', file: null}, 1000);
    await processor.alarm();
    expect(container.destroy).not.toHaveBeenCalled();
    expect(storage.setAlarm).toHaveBeenCalledWith(1000 + DEADLINE_MS);
    expect(jobs.get('current').state).toBe('running');
  });
  it('rechecks permission after the original stream is read before native submission', async () => {
    const {processor, native, container} = await fixture();
    const response = await processor.fetch(new Request('https://processor/benchmark/image/' + 'a'.repeat(64), {method: 'POST'}));
    expect(response.status).toBe(503);
    expect(native.mock.calls.map(call => call[0])).toEqual(['http://container/health']);
    expect(container.destroy).toHaveBeenCalledOnce();
  });
});
