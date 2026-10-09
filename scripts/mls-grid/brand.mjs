// Shared configuration for the standalone search, embed, and brand editor.
// Only these presentation settings are portable; MLS identity and permissions are not branding.
export const DEFAULT_BRAND = Object.freeze({
  name: 'Prime America', descriptor: 'Property Search', tagline: 'New York City. Your next chapter.',
  accent: '#315c49', background: '#fafaf7', font: 'editorial', corners: 'soft',
  photos: 'generous', colorMode: 'adaptive',
});
export const BRAND_PRESETS = Object.freeze({
  garden: { accent: '#315c49', background: '#fafaf7', font: 'editorial', corners: 'soft' },
  coast: { accent: '#365979', background: '#f5f8fa', font: 'modern', corners: 'soft' },
  city: { accent: '#303d50', background: '#f7f7f7', font: 'modern', corners: 'crisp' },
  studio: { accent: '#794b59', background: '#fcf7f5', font: 'editorial', corners: 'round' },
});
export function contrast(a, b) {
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
      .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function validateBrand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Choose a valid brand kit.');
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULT_BRAND, key)) throw Error('This brand kit contains unsupported settings.');
  const brand = { ...DEFAULT_BRAND, ...input };
  for (const [field, maximum] of [['name', 40], ['descriptor', 45], ['tagline', 100]]) {
    if (typeof brand[field] !== 'string' || !brand[field].trim() || brand[field].length > maximum || /[\u0000-\u001f\u007f]/.test(brand[field])) throw Error(`Check your ${field} (${maximum} characters maximum).`);
    brand[field] = brand[field].trim();
  }
  for (const field of ['accent', 'background']) {
    if (typeof brand[field] !== 'string' || !/^#[a-f0-9]{6}$/i.test(brand[field])) throw Error('Choose a six-digit hex color.');
    brand[field] = brand[field].toLowerCase();
  }
  for (const [field, values] of Object.entries({ font: ['editorial', 'modern'], corners: ['crisp', 'soft', 'round'], photos: ['generous', 'compact'], colorMode: ['adaptive', 'signature'] })) {
    if (!values.includes(brand[field])) throw Error(`Choose a supported ${field} setting.`);
  }
  if (contrast(brand.background, '#26352f') < 4.5 || contrast(brand.background, '#60675f') < 4.5) throw Error('Choose a lighter page color so text stays easy to read.');
  if (contrast(brand.accent, '#ffffff') < 4.5 || contrast(brand.accent, brand.background) < 4.5) throw Error('Choose a darker accent so buttons and links stay easy to read.');
  return brand;
}
export function brandCSS(input) {
  const brand = validateBrand(input), radius = { crisp: '3px', soft: '12px', round: '22px' }[brand.corners];
  const font = brand.font === 'editorial' ? 'Georgia,serif' : 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';
  // Generated stylesheet is served as a same-origin asset: no inline styles or arbitrary CSS.
  const palette = (selector, accent) => `${selector}{--accent:${accent};--wash:color-mix(in srgb,${accent} 7%,white);}`;
  return `:root{--brand-background:${brand.background};--brand-radius:${radius};--heading-font:${font};--navy:${brand.accent};}
${palette('body', brand.accent)}
${['rental', 'commercial', 'investment', 'land'].map((key, i) => palette(`body[data-experience="${key}"]`, brand.colorMode === 'signature' ? brand.accent : ['#365979', '#304f63', '#704842', '#516840'][i])).join('\n')}
body{background:var(--brand-background)}
.search-welcome h1,.listing-heading h1,.section h2,.contact-card h2,.results-toolbar h2,.disclosures h2,.photo-inspiration>summary{font-family:var(--heading-font)}
.discovery-search,.listing-card,.hero,.contact-card,.disclosures,.calculator,.showcase-card{border-radius:var(--brand-radius)}
footer{background:${brand.accent}}
${brand.photos === 'compact' ? '.results[data-density] .card-photo{height:185px}.results[data-view="list"] .card-photo{height:100%;min-height:220px}@media(max-width:680px){.results[data-view="list"] .card-photo{height:185px;min-height:0}}' : ''}`;
}
