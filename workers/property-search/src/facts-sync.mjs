import { createClient } from '../../../scripts/mls-grid/client.mjs';
import { replica } from './replica.mjs';
import { sourceFetcher } from './source-dispatch.mjs';

export async function syncFacts(env, {fetcher, now = () => Date.now(), maxPages = 6} = {}) {
  const repo = replica(env.LIVE_DB), lease = await repo.acquire(now());
  if (!lease) return {status: 'busy_or_backoff'};
  let pages = 0, records = 0, reason = 'not_due', cursorRecovered = false;
  const start = now(), client = createClient({token: env.MLS_GRID_ACCESS_TOKEN, source: 'onekey2', endpoint: 'https://api.mlsgrid.com/v2',
    fetcher: fetcher || sourceFetcher(env, 'core'), beforeRequest: async () => {}, pageSize: 100, maxResponseBytes: 8 * 1024 * 1024, projection: 'core'});
  try {
    let state = await repo.state();
    if ((!state.initial_complete && state.bootstrap_started && now() - state.bootstrap_started > 6 * 86400000) ||
      (state.reconcile_id && state.bootstrap_started && now() - state.bootstrap_started > 6 * 86400000) ||
      (state.last_complete && now() - Date.parse(state.last_complete) > 6 * 86400000)) {
      await repo.beginReconciliation(lease, now()); state = await repo.state();
    }
    if (state.phase === 'reconcile') {
      reason = 'reconciling';
      return {status: reason, ...await repo.pruneReconciliation(lease, now())};
    }
    const control = await env.LIVE_DB.prepare("SELECT poll_started_at FROM source_control WHERE source='onekey2'").first();
    if (state.next_url || !state.initial_complete || Math.floor(now()/60000)>Math.floor(control.poll_started_at/60000)) {
      await env.LIVE_DB.prepare("UPDATE source_control SET poll_started_at=? WHERE source='onekey2'").bind(start).run();
      reason = 'source_checked';
      let next = state.next_url || client.initial(state.watermark, {viewOnly: state.phase === 'initial', marketOnly: state.phase === 'initial'});
      const seen = new Set();
      while (next && pages < maxPages && now() - start < 90000) {
        // Existing cursors retain their position at cutover; only the expansion is removed.
        const url = new URL(next); url.searchParams.delete('$expand'); next = url.href;
        if (seen.has(next)) throw Error('Repeated feed page'); seen.add(next);
        let page;
        try { page = await client.page(next); }
        catch (error) {
          const current = await repo.state(), progress = current.replay_watermark || current.watermark;
          if (error.providerReason !== 'pagination_offset' || cursorRecovered || !progress || !url.searchParams.has('$skip')) throw error;
          const overlap = new Date(Math.floor(Date.parse(progress) / 1000) * 1000 - 1000).toISOString();
          page = await client.page(client.initial(overlap, {viewOnly: state.phase === 'initial', marketOnly: state.phase === 'initial'})); cursorRecovered = true;
        }
        if (page.rows.length > 100) throw Error('Feed page exceeds production processing bound');
        await repo.apply(page.rows, page.next, lease, now(), true, {projection: 'core'});
        pages++; records += page.rows.length; next = page.next;
      }
    }
    return {status: 'ok', check: reason, pages, records, cursorRecovered, initialComplete: Boolean((await repo.state()).initial_complete)};
  } catch (error) {
    reason = 'failed';
    return {status: await repo.failure(lease, error, now()), check: reason, pages, records};
  } finally {
    await env.LIVE_DB.prepare("UPDATE source_control SET poll_result=? WHERE source='onekey2'").bind(reason).run();
    await env.LIVE_DB.prepare("UPDATE feed_state SET last_result=?,last_result_at=? WHERE source='onekey2' AND lease_id=? AND lease_until>?")
      .bind(JSON.stringify({status: reason === 'failed' ? 'failed' : 'ok', check: reason, pages, records, cursorRecovered}), new Date(now()).toISOString(), lease, now()).run();
    await repo.release(lease);
  }
}
