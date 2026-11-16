import {describe, it, expect, vi} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import {ledger} from '../src/ledger';
import {jobFromPath, decodeOutputs, boundedBytes, estimatedComputeUSD, DEADLINE_MS, MAX_ATTEMPTS} from '../src/policy.mjs';
import {processJob} from '../src/processing.mjs';
import {handleRequest} from '../../property-search/src/runtime.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');
  const sql = {exec(query: string, ...values: (string | number | null)[]) {
    const statement = db.prepare(query);
    const rows = statement.columns().length ? statement.all(...values) : (statement.run(...values), []);
    return {toArray: () => rows};
  }};
  return ledger(sql as SqlStorage);
}
const file = 'a'.repeat(64);
const job = {id: `image-v1-${file}`, kind: 'image', file};
const webp = btoa('RIFF0000WEBPsmall-output');
const response = () => Response.json({outputs: ['thumb', 'card', 'display'].map(profile => ({profile, data: webp})), timings: {nativeMs: 10}});
function environment() {
  let allowed = true;
  const stored = new Map<string, Uint8Array>();
  const original = new Uint8Array([255, 216, 255, 1]);
  const env = {
    DB: {prepare: vi.fn(() => ({bind: () => ({first: async () => allowed ? {file, type: 'image/jpeg'} : null})}))},
    MEDIA: {
      get: vi.fn(async () => ({body: new Response(original).body, size: original.length, httpMetadata: {contentType: 'image/jpeg'}})),
      put: vi.fn(async (key: string, bytes: Uint8Array) => {stored.set(key, bytes);}),
      delete: vi.fn(async (keys: string[]) => {for (const key of keys) stored.delete(key);}),
    },
  };
  return {env, stored, original, revoke: () => {allowed = false;}};
}
describe('bounded native media processing', () => {
  it('reserves atomically, prevents concurrent work, and spends failed reservations forever', () => {
    const jobs = fixture();
    expect(jobs.admit(job, 1)).toBe('admitted');
    expect(jobs.admit({...job, id: 'other'}, 2)).toBe('busy');
    jobs.finish(job.id, 'failed', 3);
    expect(jobs.admit(job, Date.UTC(2035, 0, 1))).toBe('attempted');
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      expect(jobs.admit({...job, id: `other-${i}`}, i + 5)).toBe('admitted');
      jobs.finish(`other-${i}`, 'failed', i + 6);
    }
    expect(jobs.admit({...job, id: 'over-budget'}, 900)).toBe('limit');
    expect(jobs.snapshot()).toHaveLength(MAX_ATTEMPTS);
  });
  it('does not let a late completion overwrite a deadline failure', () => {
    const jobs = fixture(); jobs.admit(job, 1); jobs.interrupt(2); jobs.finish(job.id, 'ready', 3);
    expect(jobs.get(job.id).state).toBe('failed');
    expect(jobs.admit({...job, id: 'next-job'}, 4)).toBe('paused_after_interruption');
    expect(jobs.paused()).toBe(true);
  });
  it('accepts only opaque retained image hashes and the fixed synthetic video action', () => {
    expect(jobFromPath(`/benchmark/image/${file}`)).toEqual(job);
    expect(jobFromPath('/benchmark/video')?.file).toBeNull();
    for (const path of ['/benchmark/image/https://example.com', '/benchmark/image/../../secret', '/benchmark/video?command=rm', '/benchmark/upload']) expect(jobFromPath(path)).toBeNull();
  });
  it('bounds unknown response streams and rejects missing, duplicate or fake images', async () => {
    await expect(boundedBytes(new Response(new Uint8Array(20)).body, 10)).rejects.toThrow('limit');
    expect(() => decodeOutputs({outputs: [{profile: 'thumb', data: webp}]}, 'image')).toThrow();
    expect(() => decodeOutputs({outputs: ['thumb', 'thumb', 'card'].map(profile => ({profile, data: webp}))}, 'image')).toThrow();
    expect(() => decodeOutputs({outputs: ['thumb', 'card', 'display'].map(profile => ({profile, data: btoa('<html>not an image')}))}, 'image')).toThrow('WebP');
  });
  it('keeps the maximum container compute estimate below one cent for this test allowance', () => {
    expect(estimatedComputeUSD(DEADLINE_MS * MAX_ATTEMPTS)).toBeLessThan(0.01);
  });
  it('saves bounded derivatives separately and preserves the retained original', async () => {
    const {env, stored, original} = environment(), native = vi.fn(async () => response());
    const result = await processJob(env, job, native, () => {});
    expect(result.profiles.map(item => item.profile)).toEqual(['thumb', 'card', 'display']);
    expect(stored.size).toBe(3);
    expect([...stored.keys()].every(key => key.startsWith('native-benchmark/v1/'))).toBe(true);
    expect(original).toEqual(new Uint8Array([255, 216, 255, 1]));
    expect(native).toHaveBeenCalledOnce();
  });
  it('denies revoked listings before reading originals or invoking native tools', async () => {
    const {env, revoke} = environment(); revoke(); const native = vi.fn();
    await expect(processJob(env, job, native, () => {})).rejects.toThrow('unavailable');
    expect(env.MEDIA.get).not.toHaveBeenCalled(); expect(native).not.toHaveBeenCalled();
  });
  it('removes partial outputs when listing permission changes during persistence', async () => {
    const {env, revoke, stored} = environment();
    env.MEDIA.put.mockImplementationOnce(async (key, bytes) => {stored.set(key, bytes); revoke();});
    await expect(processJob(env, job, async () => response(), () => {})).rejects.toThrow('permission');
    expect(stored.size).toBe(0); expect(env.MEDIA.delete).toHaveBeenCalledOnce();
  });
  it('refuses expired job publication', async () => {
    const {env} = environment();
    await expect(processJob(env, job, async () => response(), () => {throw Error('expired');})).rejects.toThrow('expired');
    expect(env.MEDIA.put).not.toHaveBeenCalled();
  });
  it('requires the owner identity and same-origin POST for the benchmark and output routes', async () => {
    const processor = {fetch: vi.fn()}, env = {FEED_OPERATOR_EMAIL: 'owner@example.com', PUBLIC_ORIGIN: 'https://preview.example.com', APP_ENV: 'staging', DATASET: 'live', MEDIA_PROCESSOR: processor};
    const authorize = vi.fn(async () => false);
    const denied = await handleRequest(new Request('https://preview.example.com/ops/media-processing/result/synthetic-video-v1/preview'), env, {authorize});
    expect(denied.status).toBe(403);
    expect(authorize.mock.calls[0][4]).toBe('owner@example.com');
    const csrf = await handleRequest(new Request('https://preview.example.com/ops/media-processing?kind=video', {method: 'POST', headers: {Origin: 'https://attacker.example'}}), env, {authorize: async () => true});
    expect(csrf.status).toBe(403); expect(processor.fetch).not.toHaveBeenCalled();
  });
});
