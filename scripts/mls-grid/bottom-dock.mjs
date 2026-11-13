const $ = selector => document.querySelector(selector);

// Reuse the existing controls and their event handlers; no duplicate search state.
export function initializeBottomDock() {
  const dock = $('#search-dock'), searchDialog = $('#dock-search-panel'), viewDialog = $('#dock-view-panel');
  const placements = new Map(), panelTriggers = new Map();
  function filtersAreValid(){ const fields = form.elements; return form.checkValidity() && !(fields.minPrice.value && fields.maxPrice.value && Number(fields.minPrice.value) > Number(fields.maxPrice.value)); }
  function move(element, destination) {
    if (!placements.has(element)) {
      const marker = document.createComment('Original control position');
      element.before(marker); placements.set(element, marker);
    }
    destination.append(element);
  }
  const form = $('#search'), actions = $('.result-actions'), browse = $('.browse-layout');
  const layout = $('.map-view-switch'), save = $('#save-search'), pagination = $('.pagination');
  const previous = $('#previous'), next = $('#next'), comparison = $('#comparison-tray');
  const mapControls = $('#map-controls'), mapAreas = $('#map-areas'), mapSearch = $('#map-search-area');
  const position = $('#controls-position');
  const originalPopovers = [...document.querySelectorAll('#search [data-popover],.browse-layout [data-popover]')];
  let selected = new URLSearchParams(location.search).get('controls');
  if (!['top','bottom'].includes(selected)) {
    try { selected = localStorage.getItem('property-search-controls'); } catch { /* Optional preference. */ }
  }
  if (!['top','bottom'].includes(selected)) selected = 'bottom';
  // Auto-height embeds cannot pin child controls to the host's viewport.
  const embedded = document.body.dataset.embedded === 'true';
  if (embedded) selected = 'top';
  position.closest('label').hidden = embedded;

  const summary = $('#dock-query-summary');
  function updateSummary() {
    const fields = form.elements, parts = [];
    if (fields.borough.value !== 'NYC') parts.push(fields.borough.selectedOptions[0].textContent);
    if (fields.q.value.trim()) parts.push(fields.q.value.trim());
    if (fields.beds.value) parts.push(fields.beds.value === 'studio' ? 'Studio' : fields.beds.value + (fields.bedMatch.value === 'exact' ? ' beds' : '+ beds'));
    if (fields.baths.value) parts.push(fields.baths.value + '+ baths');
    if (fields.maxPrice.value) parts.push('Up to $' + Number(fields.maxPrice.value).toLocaleString());
    const extras = $('#filter-count').textContent.trim();
    if (extras) parts.push(extras.replace(/[()]/g,'') + ' detailed choices');
    summary.textContent = parts.join(' · '); summary.hidden = !parts.length || selected === 'top';
    const error = $('#filter-error');
    $('#dock-input-error').hidden = selected !== 'bottom' || searchDialog.open || error.hidden;
    $('#dock-input-error').textContent = error.textContent;
    const count = $('#active-filters').children.length;
    $('#dock-search-open').textContent = count ? `Search & filters (${Math.max(0,count - 1)})` : 'Search & filters';
    const isMap = $('#discovery-layout').dataset.layout === 'map';
    $('#dock-map-toggle').textContent = isMap ? 'Homes' : 'Map';
    $('#dock-map-toggle').setAttribute('aria-label',isMap ? 'Show homes' : 'Show map');
    $('#dock-map-tools').hidden = $('#discovery-layout').dataset.layout === 'homes';
  }

  function applyPosition() {
    searchDialog.close(); viewDialog.close();
    for (const menu of originalPopovers) menu.open = false;
    document.body.dataset.controls = selected; position.value = selected;
    dock.hidden = selected !== 'bottom';
    $('#skip-controls').hidden = selected !== 'bottom' || location.pathname.startsWith('/listing/');
    for (const anchor of document.querySelectorAll('#search-page a[href]')) { const url = new URL(anchor.href,location.href); if (url.pathname.startsWith('/listing/')) { url.searchParams.set('controls',selected); anchor.href = url.href; } }
    if (selected === 'bottom') {
      move(form,$('#dock-search-body'));
      move(actions,$('#dock-view-body')); move(browse,$('#dock-view-body'));
      move(layout,$('#dock-layout')); move(save,$('#dock-actions'));
      move(pagination,$('#dock-pages')); move(previous,$('#dock-desktop-pages')); move(next,$('#dock-desktop-pages'));
      move(comparison,$('#dock-comparison'));
      move(mapControls,$('#dock-map-tools')); move(mapAreas,$('#dock-map-tools')); move(mapSearch,$('#dock-map-tools'));
      for (const menu of originalPopovers) menu.removeAttribute('data-popover');
      $('#dock-top-position').hidden = true;
    } else {
      // Restore nested children before restoring their containers.
      for (const [element,marker] of [...placements].reverse()) marker.after(element);
      for (const menu of originalPopovers) menu.setAttribute('data-popover','');
      $('#dock-top-position').hidden = embedded;
      $('#dock-top-position').append(position.closest('label'));
    }
    if (selected === 'bottom') $('#dock-position-setting').append(position.closest('label'));
    updateSummary(); measureDock();
  }
  position.addEventListener('change',() => {
    selected = position.value; applyPosition();
    try { localStorage.setItem('property-search-controls',selected); } catch { /* Optional preference. */ }
    const url = new URL(location.href); url.searchParams.set('controls',selected); history.replaceState(null,'',url); $('#open-full-search').href = document.body.dataset.publicOrigin + '/?' + url.searchParams;
    (selected === 'bottom' ? $('#dock-view-open') : position).focus();
  });

  function panel(dialog, trigger) {
    trigger.addEventListener('click',() => {
      panelTriggers.set(dialog,trigger); dialog.showModal(); trigger.setAttribute('aria-expanded','true');
    });
    dialog.querySelector('[data-close-dock]').addEventListener('click',() => {
      if (dialog === searchDialog) {
        if (!form.reportValidity()) return;
        const fields = form.elements;
        if (fields.minPrice.value && fields.maxPrice.value && Number(fields.minPrice.value) > Number(fields.maxPrice.value)) { $('.price-filter').open = true; fields.minPrice.focus(); return; }
      }
      dialog.close();
    });
    dialog.addEventListener('close',() => { trigger.setAttribute('aria-expanded','false'); if (selected === 'bottom') (panelTriggers.get(dialog) || trigger).focus(); updateSummary(); });
    dialog.addEventListener('keydown',event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialog.close(); }
      if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex]')].filter(control => !control.disabled && control.tabIndex >= 0 && control.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    },true);
    dialog.addEventListener('click',event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  }
  panel(searchDialog,$('#dock-search-open')); panel(viewDialog,$('#dock-view-open'));
  form.addEventListener('submit',() => { if (filtersAreValid()) searchDialog.close(); });
  save.addEventListener('click',() => { if (selected !== 'bottom') return; panelTriggers.set(viewDialog,save); $('.view-preferences').open = true; $('#saved-search-panel').open = true; viewDialog.showModal(); $('#dock-view-open').setAttribute('aria-expanded','true'); $('#preference-status').tabIndex = -1; $('#preference-status').focus(); });
  pagination.addEventListener('click',event => { if (selected === 'bottom' && event.target.closest('button')) viewDialog.close(); });
  $('#dock-map-toggle').addEventListener('click',() => {
    const mode = $('#discovery-layout').dataset.layout === 'map' ? 'homes' : 'map';
    document.querySelector(`[data-layout="${mode}"]`).click();
  });
  // Pagination is available inside View on phones, and directly in the desktop dock.
  for (const [id,target] of [['dock-page-previous',previous],['dock-page-next',next]]) {
    const control = $('#' + id); control.addEventListener('click',() => { target.click(); viewDialog.close(); });
    new MutationObserver(() => { control.disabled = target.disabled; }).observe(target,{attributes:true,attributeFilter:['disabled']});
    control.disabled = target.disabled;
  }
  function measureDock() {
    const height = selected === 'bottom' ? dock.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--search-dock-height',Math.ceil(height) + 'px');
  }
  document.addEventListener('focusin',event => {
    if (selected !== 'bottom' || dock.hidden || $('#search-page').hidden || dock.contains(event.target) || event.target.closest('dialog')) return;
    if (event.target.getBoundingClientRect().bottom > dock.getBoundingClientRect().top) event.target.scrollIntoView({block:'center',behavior:'instant'});
  });
  new ResizeObserver(measureDock).observe(dock);
  new MutationObserver(updateSummary).observe($('#active-filters'),{childList:true,subtree:true});
  new MutationObserver(updateSummary).observe($('#filter-count'),{childList:true,subtree:true});
  new MutationObserver(updateSummary).observe($('#discovery-layout'),{attributes:true,attributeFilter:['data-layout']});
  new MutationObserver(updateSummary).observe($('#filter-error'),{childList:true,attributes:true,attributeFilter:['hidden']});
  applyPosition();
  return {params(params){params.set('controls',selected);}};
}
