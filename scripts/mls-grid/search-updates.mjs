// Only a tiny local checkpoint is polled. Browsers never poll MLS GRID and do not
// rerun expensive result searches until the consumer chooses to view updates.
export function watchSearchUpdates({getCurrent, onUpdate, onChecked, fetcher = fetch, visible = () => !document.hidden, interval = 30000} = {}) {
  let stopped = false, timer, busy = false, failures = 0, notified = '';
  const controller = new AbortController();
  const poll = async () => {
    if (stopped || busy) return;
    const current = getCurrent();
    if (!visible() || !current?.version) {timer = setTimeout(poll, interval); return;}
    busy = true;
    try {
      const response = await fetcher('/api/search-updates', {cache: 'no-store', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)])});
      if ([401, 403].includes(response.status)) {stop(); return;}
      if (!response.ok) throw Error('Update check unavailable');
      const data = await response.json(), checkpoint = data.checkpoints?.[0];
      if (stopped) return;
      if (!/^[a-f0-9]{64}$/.test(checkpoint?.version || '')) throw Error('Invalid update checkpoint');
      failures = 0;
      const latest = getCurrent();
      if (!visible() || !latest || current.key !== latest.key || current.version !== latest.version) return;
      onChecked?.(checkpoint);
      const notice = JSON.stringify([current.key, checkpoint.version]);
      if (checkpoint.version !== current.version && notice !== notified) {notified = notice; onUpdate(checkpoint);}
    } catch {if (!stopped) failures = Math.min(failures + 1, 4);}
    finally {busy = false; if (!stopped) timer = setTimeout(poll, Math.min(300000, interval * 2 ** failures));}
  };
  const stop = () => {stopped = true; clearTimeout(timer); controller.abort();};
  timer = setTimeout(poll, interval);
  return stop;
}
