// Classic script adapter: host styles and application state stay outside the search iframe.
(() => {
  const script = document.currentScript;
  if (!script) return;
  const origin = new URL(script.src).origin;
  for (const container of document.querySelectorAll('[data-property-search]')) {
    if (container.dataset.searchMounted) continue;
    container.dataset.searchMounted = 'true';
    const frame = document.createElement('iframe');
    const params = new URLSearchParams(container.dataset.query || 'borough=NYC&type=Residential&status=Active');
    frame.src = origin + '/embed?' + params;
    frame.title = container.dataset.searchTitle || 'Property search';
    frame.width = '100%'; frame.height = '1100'; frame.loading = 'lazy';
    frame.className = 'search-embed';
    window.addEventListener('message', event => {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      if (event.data?.type === 'property-search:ready') { frame.contentWindow.postMessage({ type: 'property-search:connect' }, origin); return; }
      if (event.data?.type !== 'property-search:resize') return;
      const height = event.data.height;
      if (typeof height !== 'number' || !Number.isFinite(height) || height < 300 || height > 40000) return;
      frame.height = String(Math.ceil(height));
    });
    frame.addEventListener('load', () => frame.contentWindow.postMessage({ type: 'property-search:connect' }, origin));
    container.append(frame);
  }
})();
