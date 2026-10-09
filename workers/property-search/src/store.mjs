import { searchQuery, mediaQuery } from '../../../scripts/mls-grid/search-query.mjs';

const safeListing = listing => {
  if (listing.addressWithheld) {
    for (const field of ['PublicRemarks','TaxLegalDescription','Latitude','Longitude','UnparsedAddress','StreetNumber','StreetNumberNumeric','StreetDirPrefix','StreetName','StreetSuffix','StreetDirSuffix','UnitNumber']) delete listing[field];
  }
  return listing;
};

export function searchStore(db, {production = false} = {}) {
  const rows = async (sql, values = []) => (await db.prepare(sql).bind(...values).all()).results;
  const first = (sql, values = []) => db.prepare(sql).bind(...values).first();
  async function attach(records) {
    const listings = records.map(row => safeListing(JSON.parse(row.public_json)));
    if (!listings.length) return [];
    const query = mediaQuery(listings,production), photos = await rows(query.sql, query.values);
    const byListing = new Map();
    for (const photo of photos) {
      const key = `${photo.source}:${photo.listing_id}`;
      if (!byListing.has(key)) byListing.set(key, []);
      byListing.get(key).push(photo);
    }
    return listings.map(listing => ({ ...listing, media: (byListing.get(`${listing.source}:${listing.id}`) || []).map(photo => ({ url: `/media/${photo.file}`, caption: listing.addressWithheld ? '' : photo.caption })) }));
  }
  return {
    async listing(source, id) {
      const record = await first('SELECT public_json FROM listings WHERE source=? AND id=?', [source, id]);
      return record ? (await attach([record]))[0] : null;
    },
    mediaFile(file) {
      return first(`SELECT m.file,m.type FROM listing_media m JOIN listings l ON l.source=m.source AND l.id=m.listing_id WHERE m.file=? ${production ? "AND m.state='ready'" : ''} LIMIT 1`, [file]);
    },
    async search(params = {}, now = new Date()) {
      const { where, values, limit, requestedOffset, sort, sortExpression, mediaCondition, belowCondition, recentCondition } = searchQuery(params, now,production);
      const stats = await first(`SELECT COUNT(*) AS total, SUM(CASE WHEN ${mediaCondition} THEN 1 ELSE 0 END) AS withPhotos, SUM(CASE WHEN ${belowCondition} THEN 1 ELSE 0 END) AS belowOriginal, SUM(CASE WHEN ${recentCondition} THEN 1 ELSE 0 END) AS recentlyListed FROM listings WHERE ${where}`, values);
      const total = production ? Math.min(stats.total,2500) : stats.total, offset = Math.min(Math.floor(requestedOffset / limit) * limit, Math.max(0, Math.ceil(total / limit) - 1) * limit);
      const [records, checkpoints] = await Promise.all([
        rows(`SELECT public_json FROM listings WHERE ${where} ORDER BY ${sortExpression},id,source LIMIT ? OFFSET ?`, [...values,Math.min(limit,total-offset),offset]),
        rows(production ? 'SELECT source,initial_complete AS complete,last_complete AS updated_at FROM feed_state' : 'SELECT source,complete,updated_at FROM checkpoints'),
      ]);
      const listings = await attach(records);
      const candidates = listings.filter(listing => listing.media.length), showcase = [];
      while(candidates.length && showcase.length < 2) {
        const listing = candidates.splice(Math.floor(Math.random()*candidates.length),1)[0];
        showcase.push({...listing,featuredPhoto:Math.floor(Math.random()*listing.media.length)});
      }
      return { environment:production?'production':'demo', total, capped:production && stats.total>2500, offset, limit, sort, insights:{withPhotos:stats.withPhotos||0,belowOriginal:stats.belowOriginal||0,recentlyListed:stats.recentlyListed||0}, listings, showcase, checkpoints };
    },
    saveInquiry(id, listing, inquiry) {
      // The INSERT itself rechecks listing eligibility; an unavailable listing cannot accept a request.
      return db.prepare('INSERT INTO demo_inquiries SELECT ?,source,id,?,? FROM listings WHERE source=? AND id=?').bind(id,new Date().toISOString(),JSON.stringify(inquiry),listing.source,listing.id).run();
    },
  };
}
