import { recentListingDates } from './consumer.mjs';

// Shared parameterized filter contract for local SQLite and Cloudflare D1.
export function searchQuery(params = {}, now = new Date()) {
  const conditions = ['1=1'];
  const values = [];
  const query = String(params.q || '').trim().toLowerCase().slice(0, 200);
  if (params.borough) {
    const boroughs = { Manhattan: ['New York', 'New York County', 'New York (Manhattan)', 'Manhattan'], Brooklyn: ['Kings', 'Kings County', 'Kings (Brooklyn)', 'Brooklyn'], Queens: ['Queens', 'Queens County'], Bronx: ['Bronx', 'Bronx County'], 'Staten Island': ['Richmond', 'Richmond County', 'Richmond (Staten Island)', 'Staten Island'] };
    const county = params.borough === 'NYC' ? Object.values(boroughs).flat() : boroughs[params.borough];
    if (!county) throw new Error('Invalid borough');
    conditions.push(`json_extract(public_json,'$.CountyOrParish') IN (${county.map(() => '?').join(',')}) AND state='NY'`); values.push(...county);
  }
  if (query) { conditions.push("search_text LIKE ? ESCAPE '\\'"); values.push(`%${query.replace(/[\\%_]/g, '\\$&')}%`); }
  if (params.photosOnly === '1') conditions.push('EXISTS (SELECT 1 FROM listing_media m WHERE m.source=listings.source AND m.listing_id=listings.id)');
  for (const [param, column] of [['status', 'status'], ['type', 'property_type'], ['source', 'source']]) {
    if (params[param]) { conditions.push(`${column}=?`); values.push(String(params[param])); }
  }
  for (const [param, column, operator] of [['minPrice', 'price', '>='], ['maxPrice', 'price', '<='], ['beds', 'beds', '>=']]) {
    if (params[param] !== undefined && params[param] !== '') {
      const value = Number(params[param]);
      if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${param}`);
      conditions.push(`${column}${operator}?`); values.push(value);
    }
  }
  if (params.minPrice && params.maxPrice && Number(params.minPrice) > Number(params.maxPrice)) throw new Error('Minimum price exceeds maximum price');
  const mediaCondition = 'EXISTS (SELECT 1 FROM listing_media m WHERE m.source=listings.source AND m.listing_id=listings.id)';
  const belowCondition = "price>0 AND json_type(public_json,'$.OriginalListPrice') IN ('integer','real') AND json_extract(public_json,'$.OriginalListPrice')>price";
  const dates = recentListingDates(now);
  const recentCondition = `substr(json_extract(public_json,'$.OnMarketDate'),1,10) IN (${dates.map(d => `'${d}'`).join(',')})`;
  if (params.belowOriginal === '1') conditions.push(belowCondition);
  if (params.recent === '1') conditions.push(recentCondition);
  if (params.savedOnly === '1') {
    const keys = String(params.saved || '').split(',').filter(Boolean);
    if (keys.length > 100 || keys.some(key => !/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(key) || key.length > 160)) throw new Error('Invalid saved homes');
    conditions.push('EXISTS (SELECT 1 FROM json_each(?) saved WHERE saved.value=listings.source || char(58) || listings.id)');
    values.push(JSON.stringify(keys));
  }
  const limit = Number(params.limit || 24);
  if (![12,24,48,96].includes(limit)) throw new Error('Invalid page size');
  const requestedOffset = Number(params.offset || 0);
  if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0) throw new Error('Invalid offset');
  const sorts = { priceAsc: 'price IS NULL,price ASC', priceDesc: 'price IS NULL,price DESC', newest: "json_extract(public_json,'$.OnMarketDate') IS NULL,json_extract(public_json,'$.OnMarketDate') DESC" };
  const sort = params.sort || 'priceAsc';
  if (!Object.hasOwn(sorts, sort)) throw new Error('Invalid sort');
  const where = conditions.join(' AND ');
  return { where, values, limit, requestedOffset, sort, sortExpression: sorts[sort], mediaCondition, belowCondition, recentCondition };
}

export function mediaQuery(listings) {
  return { sql: `SELECT source,listing_id,file,caption FROM listing_media WHERE EXISTS (SELECT 1 FROM json_each(?) wanted WHERE json_extract(wanted.value,'$[0]')=source AND json_extract(wanted.value,'$[1]')=listing_id) ORDER BY position,media_key`, values: [JSON.stringify(listings.map(listing => [listing.source, listing.id]))] };
}
