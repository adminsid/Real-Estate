// Opaque change tokens use the existing atomic page checkpoint. Different pages
// with tied provider timestamps still invalidate the token; empty polls do not.
export async function searchCheckpoints(db) {
  const {results} = await db.prepare("SELECT source,initial_complete,last_complete,watermark,cycle_watermark,replay_watermark,next_url FROM feed_state WHERE source='onekey2'").all();
  return Promise.all(results.map(async row => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([row.watermark, row.cycle_watermark, row.replay_watermark, row.next_url])));
    const version = Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
    return {source: row.source, complete: row.initial_complete, updated_at: row.last_complete, version};
  }));
}
