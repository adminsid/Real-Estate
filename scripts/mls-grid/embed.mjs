export function connectEmbed() {
  if (document.body.dataset.embedded !== 'true' || window.parent === window) return;
  const allowed = document.body.dataset.embedOrigins.split(' ');
  let parentOrigin, timer;
  const report = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!parentOrigin) return;
      // Content height, not viewport height: permits both growing and shrinking after filters change.
      const height = Math.ceil(document.querySelector('#main').getBoundingClientRect().bottom + window.scrollY + 24);
      window.parent.postMessage({ type: 'property-search:resize', height: Math.max(300, Math.min(40000, height)) }, parentOrigin);
    }, 80);
  };
  window.addEventListener('message', event => {
    if (event.source !== window.parent || !allowed.includes(event.origin) || event.data?.type !== 'property-search:connect') return;
    parentOrigin = event.origin; report();
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(report).observe(document.querySelector('#main'));
  window.addEventListener('resize', report);
  // Some browsers fire the iframe load event before asynchronous brand initialization finishes.
  // A second, origin-checked handshake covers that ordering without wildcard messages or polling.
  try {
    const referrerOrigin = new URL(document.referrer).origin;
    if (allowed.includes(referrerOrigin)) window.parent.postMessage({ type: 'property-search:ready' }, referrerOrigin);
  } catch { /* No referrer: the host loader's load handshake still applies. */ }
}
