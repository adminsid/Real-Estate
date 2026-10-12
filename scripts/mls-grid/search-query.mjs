import { recentListingDates } from './consumer.mjs';
import { advancedConditions, featureList, featureSQL } from './search-filters.mjs';

// Shared parameterized filter contract for local SQLite and Cloudflare D1.
export function searchQuery(params = {}, now = new Date(), indexed = false) {
  const conditions = ['1=1'];
  const values = [];
  const query = String(params.q || '').trim().toLowerCase().slice(0, 200);
  if (params.borough) {
    const boroughs = { Manhattan: ['New York', 'New York County', 'New York (Manhattan)', 'Manhattan'], Brooklyn: ['Kings', 'Kings County', 'Kings (Brooklyn)', 'Brooklyn'], Queens: ['Queens', 'Queens County'], Bronx: ['Bronx', 'Bronx County'], 'Staten Island': ['Richmond', 'Richmond County', 'Richmond (Staten Island)', 'Staten Island'] };
    const county = params.borough === 'NYC' ? Object.values(boroughs).flat() : boroughs[params.borough];
    if (!county) throw new Error('Invalid borough');
    if (indexed) { conditions.push(params.borough === 'NYC' ? "borough IS NOT NULL AND state='NY'" : "borough=? AND state='NY'"); if(params.borough !== 'NYC') values.push(params.borough); }
    else { conditions.push(`json_extract(public_json,'$.CountyOrParish') IN (${county.map(() => '?').join(',')}) AND state='NY'`); values.push(...county); }
  }
  if (query && indexed) {
    const tokens = query.match(/[\p{L}\p{N}]+/gu)?.slice(0,20) || [];
    if (tokens.length) { conditions.push('rowid IN (SELECT rowid FROM listing_search WHERE listing_search MATCH ?)'); values.push(tokens.map(token => `"${token}"*`).join(' AND ')); }
    else conditions.push('0=1');
  }
  if (query && !indexed) { conditions.push("search_text LIKE ? ESCAPE '\\'"); values.push(`%${query.replace(/[\\%_]/g, '\\$&')}%`); }
  advancedConditions(params,conditions,values);
  if (params.photosOnly === '1') conditions.push(indexed ? 'has_photos=1' : 'EXISTS (SELECT 1 FROM listing_media m WHERE m.source=listings.source AND m.listing_id=listings.id)');
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
  const mediaCondition = indexed ? 'has_photos=1' : 'EXISTS (SELECT 1 FROM listing_media m WHERE m.source=listings.source AND m.listing_id=listings.id)';
  const belowCondition = indexed ? "below_original=1" : "price>0 AND json_type(public_json,'$.OriginalListPrice') IN ('integer','real') AND json_extract(public_json,'$.OriginalListPrice')>price";
  const dates = recentListingDates(now);
  const recentCondition = `${indexed ? 'on_market_date' : "substr(json_extract(public_json,'$.OnMarketDate'),1,10)"} IN (${dates.map(d => `'${d}'`).join(',')})`;
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
  if(indexed) { sorts.priceAsc='missing_price,price ASC'; sorts.priceDesc='missing_price,price DESC'; sorts.newest='missing_date,on_market_date DESC'; }
  const preferred=featureList(params.preferred);
  sorts.best=preferred.length ? `(${preferred.map(key=>`CASE WHEN ${featureSQL(key)} THEN 1 ELSE 0 END`).join('+')}) DESC,${sorts.newest}` : sorts.newest;
  const sort = params.sort || 'priceAsc';
  if (!Object.hasOwn(sorts, sort)) throw new Error('Invalid sort');
  const where = conditions.join(' AND ');
  return { where, values, limit, requestedOffset, sort, sortExpression: sorts[sort], mediaCondition, belowCondition, recentCondition };
}

export function mediaQuery(listings, indexed = false) {
  const wanted = [...new Map(listings.map(listing => [JSON.stringify([listing.source,listing.id]),[listing.source,listing.id]])).values()];
  return { sql: `SELECT m.source,m.listing_id,m.file,m.caption FROM json_each(?) wanted JOIN listing_media m ON m.source=json_extract(wanted.value,'$[0]') AND m.listing_id=json_extract(wanted.value,'$[1]') ${indexed ? "WHERE m.state='ready'" : ''} ORDER BY m.position,m.media_key`, values: [JSON.stringify(wanted)] };
}
