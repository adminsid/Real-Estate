import { DEFAULT_BRAND, BRAND_PRESETS, validateBrand, contrast } from './brand.mjs';

export async function initializeBrand() {
  const panel = document.querySelector('#brand-panel'), form = document.querySelector('#brand-form');
  const opener = document.querySelector('#brand-open'), status = document.querySelector('#brand-status');
  const stylesheet = document.querySelector('#brand-theme');
  const compact = window.matchMedia('(max-width: 719px)');
  function syncPanelAccess() {
    const modal = !panel.hidden && compact.matches;
    for (const node of document.querySelectorAll('#main,.site-header,footer,.skip')) node.inert = modal;
    if (modal) { panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); }
    else { panel.removeAttribute('role'); panel.removeAttribute('aria-modal'); }
  }
  compact.addEventListener('change', syncPanelAccess);
  let saved = { ...DEFAULT_BRAND }, draft = saved, timer, saving = false, invalid = false;
  const tell = message => { status.textContent = message; };
  try {
    const response = await fetch('/api/brand');
    if (!response.ok) throw Error();
    const data = await response.json();
    saved = validateBrand(data.brand); draft = saved;
    if (data.readOnly) { opener.hidden = true; }
  } catch { tell('Settings could not load. You can preview changes, then try saving again.'); }
  function populate() { for (const [name, value] of Object.entries(draft)) form.elements[name].value = value; }
  function apply() {
    const brand = validateBrand(draft);
    for (const node of document.querySelectorAll('.brand')) {
      const name = document.createTextNode(brand.name), descriptor = document.createElement('span'); descriptor.textContent = brand.descriptor;
      node.replaceChildren(name, descriptor);
    }
    document.querySelector('.header-note').textContent = brand.tagline;
    document.querySelector('.embed-brand').textContent = `${brand.name} · ${brand.descriptor}`;
    document.querySelector('#brand-contrast').textContent = `Readable colors · buttons ${contrast(brand.accent, '#ffffff').toFixed(1)}:1 · links ${contrast(brand.accent, brand.background).toFixed(1)}:1`;
    stylesheet.href = '/theme.css?' + new URLSearchParams(brand);
    invalid = false; document.querySelector('#brand-save').disabled = saving;
  }
  function read() {
    clearTimeout(timer);
    try { draft = validateBrand(Object.fromEntries(new FormData(form))); apply(); tell('Preview updated. Save to use this look across the service.'); }
    catch (error) { invalid = true; document.querySelector('#brand-save').disabled = true; tell(error.message + ' The last readable preview is still shown.'); }
  }
  populate(); apply();
  opener.addEventListener('click', () => { panel.hidden = false; document.body.classList.add('brand-editing'); opener.setAttribute('aria-expanded', 'true'); syncPanelAccess(); document.querySelector('#brand-title').focus(); });
  function close() { panel.hidden = true; document.body.classList.remove('brand-editing'); opener.setAttribute('aria-expanded', 'false'); syncPanelAccess(); opener.focus(); }
  document.querySelector('#brand-close').addEventListener('click', close);
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
  form.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(read, 120); });
  form.addEventListener('change', read);
  for (const button of panel.querySelectorAll('[data-preset]')) button.addEventListener('click', () => {
    clearTimeout(timer); draft = { ...draft, ...BRAND_PRESETS[button.dataset.preset] }; populate(); apply(); tell(`${button.textContent} preview. Save when it feels right.`);
  });
  document.querySelector('#brand-discard').addEventListener('click', () => { clearTimeout(timer); draft = { ...saved }; populate(); apply(); tell('Your saved look is back.'); });
  document.querySelector('#brand-reset').addEventListener('click', () => { clearTimeout(timer); draft = { ...DEFAULT_BRAND }; populate(); apply(); tell('Original look previewed. Save to keep it.'); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); read(); if (invalid || saving) return;
    const next = { ...draft }; saving = true; document.querySelector('#brand-save').disabled = true; tell('Saving your brand kit…');
    try {
      const response = await fetch('/api/brand', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'Could not save this kit.');
      saved = validateBrand(data.brand);
      tell(JSON.stringify(draft) === JSON.stringify(next) ? 'Brand kit saved. Reloaded pages and embeds will use this look.' : 'Brand kit saved. Your newer preview changes are not saved yet.');
    } catch (error) { tell(error.message); }
    finally { saving = false; document.querySelector('#brand-save').disabled = invalid; }
  });
  document.querySelector('#brand-export').addEventListener('click', () => {
    read(); if (invalid) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'property-search-brand.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); tell('Brand kit downloaded.');
  });
  document.querySelector('#brand-import').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    clearTimeout(timer);
    try {
      if (file.size > 4096) throw Error('Choose a brand kit smaller than 4 KB.');
      draft = validateBrand(JSON.parse(await file.text())); populate(); apply(); tell('Brand kit loaded for preview. Save to use it.');
    } catch (error) { tell(error.message); }
    finally { event.target.value = ''; }
  });
}
