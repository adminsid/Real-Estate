import {searchStore} from '../../property-search/src/store.mjs';
import {boundedBytes, decodeOutputs, MAX_INPUT, MAX_RESPONSE, outputKey} from './policy.mjs';
export const eligible = (env, file) => file ? searchStore(env.DB, {production: true}).mediaFile(file) : Promise.resolve(true);

export async function processJob(env, job, nativeFetch, assertActive) {
  if (!await eligible(env, job.file)) throw Error('Media unavailable');
  let original = null;
  if (job.file) {
    original = await env.MEDIA.get(job.file);
    if (!original || original.size > MAX_INPUT || !['image/jpeg', 'image/png', 'image/webp'].includes(original.httpMetadata?.contentType)) {
      await original?.body?.cancel(); throw Error('Unsupported or oversized original');
    }
  }
  const response = await nativeFetch(job.kind === 'image' ? '/image' : '/video', original);
  if (!response.ok) { await response.body?.cancel(); throw Error('Native processor failed'); }
  const result = JSON.parse(new TextDecoder().decode(await boundedBytes(response.body, MAX_RESPONSE)));
  const outputs = decodeOutputs(result, job.kind), written = [];
  try {
    for (const output of outputs) {
      assertActive();
      if (!await eligible(env, job.file)) throw Error('Media permission changed');
      const key = outputKey(job.id, output.profile);
      await env.MEDIA.put(key, output.bytes, {httpMetadata: {contentType: output.type}, customMetadata: {processor: 'imgproxy-ffmpeg-v1', sourceFile: job.file || 'synthetic'}});
      written.push(key);
    }
    assertActive();
    if (!await eligible(env, job.file)) throw Error('Media permission changed');
    return {input: original?.size || 0, output: outputs.reduce((sum, item) => sum + item.bytes.length, 0), profiles: outputs.map(item => ({profile: item.profile, bytes: item.bytes.length})), timings: result.timings};
  } catch (error) { if (written.length) await env.MEDIA.delete(written); throw error; }
}
