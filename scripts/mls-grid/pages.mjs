import { validateBrand } from './brand.mjs';

export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export function publicOrigin(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol === 'http:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost')) throw Error('Public URL must be an HTTPS origin (HTTP allowed for loopback only).');
  return url.origin;
}
export const listingPath = listing => `/listing/${encodeURIComponent(listing.source)}/${encodeURIComponent(listing.id)}`;
export const listingAddress = listing => listing.addressWithheld ? 'Address withheld by the listing source' : listing.UnparsedAddress || [listing.StreetNumber || listing.StreetNumberNumeric, listing.StreetDirPrefix, listing.StreetName, listing.StreetSuffix, listing.UnitNumber ? `#${listing.UnitNumber}` : ''].filter(Boolean).join(' ') || 'Address not provided';
const currency = value => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value) : 'Price not provided';
const text = value => Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? value ? 'Yes' : 'No' : String(value);
const attribution = listing => `<div class="attribution"><p>Listed by ${escapeHTML(listing.ListOfficeName || 'brokerage not provided')}${listing.ListAgentFullName ? ` · ${escapeHTML(listing.ListAgentFullName)}` : ''}</p><p>MLS #${escapeHTML(listing.ListingId || 'Not provided')} · ${escapeHTML(listing.source === 'onekey2' ? 'OneKey MLS' : listing.source)} · Status: ${escapeHTML(listing.StandardStatus || 'Not provided')}</p><p>Listing contact: ${escapeHTML(listing.AttributionContact || listing.ListOfficePhone || 'Not provided in the import')}</p></div>`;
const picture = (listing, priority = false) => listing.media?.[0] ? `<img src="${escapeHTML(listing.media[0].url)}?variant=card" alt="${escapeHTML(listingAddress(listing))}" loading="${priority?'eager':'lazy'}"${priority?' fetchpriority="high"':''} decoding="async">` : '<span class="photo-fallback">Photos have not been imported for this listing.</span>';

function listingSummary(listing) {
  const internal = new Set(['id', 'source', 'media', 'obtainedAt', 'addressWithheld']);
  const facts = Object.entries(listing).filter(([field, value]) => !internal.has(field) && field !== 'PublicRemarks' && value !== null && value !== undefined && (typeof value !== 'object' || Array.isArray(value)));
  return `<article class="server-listing"><div class="listing-heading"><div><p class="eyebrow">${escapeHTML(listing.PropertyType)}</p><h1>${escapeHTML(listingAddress(listing))}</h1><p>${escapeHTML([listing.City, listing.StateOrProvince, listing.PostalCode].filter(Boolean).join(', '))}</p></div><div><p class="price">${currency(listing.ListPrice)}</p><p>${escapeHTML(listing.StandardStatus)}</p></div></div>${attribution(listing)}${listing.media?.[0] ? `<div class="hero one-photo">${picture(listing,true)}</div>` : ''}${listing.PublicRemarks ? `<section class="section"><h2>About this property</h2><p class="description">${escapeHTML(listing.PublicRemarks)}</p></section>` : ''}<section class="section"><h2>Listing information</h2><dl class="fact-grid">${facts.map(([field, value]) => `<div><dt>${escapeHTML(field.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))}</dt><dd>${escapeHTML(text(value))}</dd></div>`).join('')}</dl></section><noscript><p>Turn on JavaScript for the photo gallery, estimates, and tour request form.</p></noscript></article>`;
}

export function renderPage(template, { brand: input, origin, listing, unavailable = false, embedded = false, results, embedOrigins = [] }) {
  const brand = validateBrand(input), safe = escapeHTML;
  let title = `Find your next place · ${brand.name} ${brand.descriptor}`;
  let description = `${brand.tagline} Search NYC homes, rentals, investment properties, commercial spaces, and land.`;
  let canonical = origin + '/';
  if (listing) {
    title = `${listingAddress(listing)} · ${currency(listing.ListPrice)} · ${brand.name}`;
    description = `${listing.PropertyType || 'Property'} · ${listing.StandardStatus || 'Status not provided'}. ${listingAddress(listing)}. ${currency(listing.ListPrice)}. Listed by ${listing.ListOfficeName || 'brokerage not provided'}. MLS #${listing.ListingId || 'Not provided'}.`;
    canonical = origin + listingPath(listing);
  } else if (unavailable) { title = `Listing unavailable · ${brand.name}`; description = 'This listing is no longer available. Search for another property.'; }
  const metadata = `<title>${safe(title)}</title><meta name="description" content="${safe(description)}">${unavailable ? '' : `<link rel="canonical" href="${safe(canonical)}">`}<meta property="og:type" content="website"><meta property="og:title" content="${safe(title)}"><meta property="og:description" content="${safe(description)}"><meta property="og:site_name" content="${safe(brand.name)}">${unavailable ? '' : `<meta property="og:url" content="${safe(canonical)}">`}${listing?.media?.[0] ? `<meta property="og:image" content="${safe(origin + listing.media[0].url)}?variant=display"><meta property="og:image:alt" content="Listing photo for ${safe(listingAddress(listing))}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}`;
  template = template.replace(/<title>.*?<\/title>/, metadata)
    .replace('<body>', `<body data-embedded="${embedded}" data-public-origin="${safe(origin)}" data-embed-origins="${safe(embedOrigins.join(' '))}">`)
    .replaceAll('PRIME AMERICA<span>REAL ESTATE</span>', `${safe(brand.name)}<span>${safe(brand.descriptor)}</span>`)
    .replace('New York City. Your next chapter.</span>', `${safe(brand.tagline)}</span>`);
  if (listing || unavailable) {
    template = template.replace('<section id="search-page">', '<section id="search-page" hidden>')
      .replace('<section id="listing-page" hidden>', '<section id="listing-page">')
      .replace('<div id="listing-content"></div>', `<div id="listing-content">${listing ? listingSummary(listing) : '<div class="error-panel"><h1>This listing is unavailable.</h1><p>Return to the results to find another property.</p></div>'}</div>`);
  } else if (results) {
    const cards = results.listings.map((item,index) => `<article class="listing-card"><a class="card-photo" href="${safe(origin + listingPath(item))}"${embedded ? ' target="_blank" rel="noopener"' : ''}>${picture(item,index===0)}</a><div class="card-body"><p class="card-price">${currency(item.ListPrice)}</p><a class="card-address" href="${safe(origin + listingPath(item))}"${embedded ? ' target="_blank" rel="noopener"' : ''}>${safe(listingAddress(item))}</a><p>${safe(item.PropertyType)} · ${safe(item.StandardStatus)}</p>${attribution(item)}</div></article>`).join('');
    template = template.replace('data-view="grid"></section>', `data-view="grid">${cards}<noscript>Turn on JavaScript to update filters and browse all result pages.</noscript></section>`);
  }
  return template;
}

export function embedDemo(brand, origin) {
  const safe = escapeHTML;
  const snippet = `<div data-property-search data-query="borough=NYC&type=Residential&status=Active&photosOnly=1" data-search-title="${escapeHTML(brand.name)} property search"></div>\n<script defer src="${origin}/embed-loader.js"></script>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Website integration preview</title><script defer src="/embed-loader.js"></script><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/theme.css"></head><body><header class="site-header"><a class="brand" href="/">Your brokerage<span>YOUR WEBSITE</span></a><nav><a href="/">Back to search</a></nav></header><main class="integration-demo"><p class="eyebrow">ONE SEARCH SERVICE. YOUR OWN WEBSITE.</p><h1>A search that feels at home.</h1><p>Your website keeps its own header and content. The embedded search uses your saved brand kit. Listing links open a full page with a stable share URL.</p><div data-property-search data-query="borough=NYC&amp;type=Residential&amp;status=Active&amp;photosOnly=1&amp;limit=12" data-search-title="${safe(brand.name)} property search"></div><section class="section"><h2>Add the search to a website</h2><label>Embed code<textarea readonly rows="4">${safe(snippet)}</textarea></label><p>For production, allow the brokerage website’s exact origin in the service’s frame policy. This local example permits only this preview.</p><p>An iframe adds the interactive search. For brokerage-domain listing SEO, use the service’s server-rendered pages through an integration on that domain and choose one canonical public URL per listing. This routing step is still required for production.</p><p class="muted">Local demo only. Sample inventory remains noindex. This is an integration preview, not a deployed service.</p></section></main></body></html>`;
}
