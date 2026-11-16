// Opaque change tokens use the existing atomic page checkpoint. Different pages
// with tied provider timestamps still invalidate the token; empty polls do not.
export async function searchCheckpoints(db) {
  const {results} = await db.prepare("SELECT f.source,f.initial_complete,f.last_complete,f.watermark,f.cycle_watermark,f.replay_watermark,f.next_url,o.timestamp AS event_timestamp,o.phase AS event_phase FROM feed_state f LEFT JOIN open_house_state o ON o.source=f.source WHERE f.source='onekey2'").all();
  return Promise.all(results.map(async row => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([row.watermark, row.cycle_watermark, row.replay_watermark, row.next_url,row.event_timestamp,row.event_phase])));
    const version = Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
    return {source: row.source, complete: row.initial_complete, updated_at: row.last_complete, version};
  }));
}
