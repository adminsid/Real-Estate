import { DatabaseSync } from 'node:sqlite';
import { publicProjection } from './client.mjs';
import { searchQuery, mediaQuery } from './search-query.mjs';
import { discoveryQueries, discoveryResult } from './discovery-data.mjs';

export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS listings (
      source TEXT NOT NULL, id TEXT NOT NULL, status TEXT, city TEXT, state TEXT,
      price REAL, beds REAL, property_type TEXT, search_text TEXT NOT NULL, public_json TEXT NOT NULL,
      PRIMARY KEY(source,id));
    CREATE INDEX IF NOT EXISTS listing_filters ON listings(source,status,price);
    CREATE TABLE IF NOT EXISTS checkpoints (
      source TEXT PRIMARY KEY, next_url TEXT, timestamp TEXT, complete INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS listing_media (
      source TEXT NOT NULL, listing_id TEXT NOT NULL, media_key TEXT NOT NULL, revision TEXT,
      file TEXT NOT NULL, type TEXT NOT NULL, position INTEGER NOT NULL, caption TEXT NOT NULL,
      PRIMARY KEY(source,listing_id,media_key));
    CREATE TABLE IF NOT EXISTS demo_inquiries (
      id TEXT PRIMARY KEY, source TEXT NOT NULL, listing_id TEXT NOT NULL,
      created_at TEXT NOT NULL, request_json TEXT NOT NULL);`);
  return {
    close: () => db.close(),
    discovery(params={},now=new Date()) {
      const queries=discoveryQueries(params,now);
      const results=Object.values(queries).map(query=>db.prepare(query.sql).all(...query.values));
      return discoveryResult(...results);
    },
    checkpoint(source) { return db.prepare('SELECT * FROM checkpoints WHERE source=?').get(source); },
    apply(source, page, { checkpoint = true } = {}) {
      const old = this.checkpoint(source);
      let greatest = old?.timestamp || null;
      let stored = 0;
      let removed = 0;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of page.rows) {
          if (row.OriginatingSystemName !== source) throw new Error('Source mismatch');
          if (!greatest || Date.parse(row.ModificationTimestamp) > Date.parse(greatest)) greatest = row.ModificationTimestamp;
          const record = publicProjection(row);
          if (!record) {
            db.prepare('DELETE FROM listings WHERE source=? AND id=?').run(source, row.ListingKey);
            db.prepare('DELETE FROM listing_media WHERE source=? AND listing_id=?').run(source, row.ListingKey);
            removed++;
            continue;
          }
          record.obtainedAt = new Date().toISOString();
          const searchable = [record.ListingId, record.UnparsedAddress, record.StreetNumber, record.StreetName, record.UnitNumber, record.City, record.PostalCity, record.KEY_ManNYNeighborhood, record.CountyOrParish, record.PostalCode].filter(value => value != null).join(' ').toLowerCase();
          db.prepare(`INSERT OR REPLACE INTO listings VALUES (?,?,?,?,?,?,?,?,?,?)`).run(source, row.ListingKey, record.StandardStatus ?? null, record.City ?? null, record.StateOrProvince ?? null, record.ListPrice ?? null, record.BedroomsTotal ?? null, record.PropertyType ?? null, searchable, JSON.stringify(record));
          if (page.media?.has(row.ListingKey)) {
            db.prepare('DELETE FROM listing_media WHERE source=? AND listing_id=?').run(source, row.ListingKey);
            for (const item of page.media.get(row.ListingKey)) db.prepare('INSERT OR REPLACE INTO listing_media VALUES (?,?,?,?,?,?,?,?)').run(source, row.ListingKey, item.key, item.revision, item.file, item.type, item.order, item.caption);
          }
          stored++;
        }
        if (checkpoint) db.prepare('INSERT OR REPLACE INTO checkpoints VALUES (?,?,?,?,?)').run(source, page.next, greatest, page.next ? 0 : 1, new Date().toISOString());
        db.exec('COMMIT');
        return { received: page.rows.length, stored, removed };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    mediaFile(file) {
      return db.prepare('SELECT m.file,m.type FROM listing_media m JOIN listings l ON l.source=m.source AND l.id=m.listing_id WHERE m.file=? LIMIT 1').get(file);
    },
    mediaFor(source, id) {
      const withheld = db.prepare("SELECT json_extract(public_json,'$.addressWithheld') AS withheld FROM listings WHERE source=? AND id=?").get(source, id)?.withheld;
      return db.prepare('SELECT file,type,caption FROM listing_media WHERE source=? AND listing_id=? ORDER BY position,media_key').all(source, id).map(item => ({ url: `/media/${item.file}`, caption: withheld ? '' : item.caption }));
    },
    listing(source, id) {
      const row = db.prepare('SELECT public_json FROM listings WHERE source=? AND id=?').get(source, id);
      if (!row) return null;
      const listing = JSON.parse(row.public_json);
      if (listing.addressWithheld) { delete listing.PublicRemarks; delete listing.TaxLegalDescription; }
      return { ...listing, media: this.mediaFor(source, id), obtainedAt: listing.obtainedAt ?? null };
    },
    saveInquiry(id, source, listingId, inquiry) {
      if (!this.listing(source, listingId)) throw new Error('Listing unavailable');
      db.prepare('INSERT INTO demo_inquiries VALUES (?,?,?,?,?)').run(id, source, listingId, new Date().toISOString(), JSON.stringify(inquiry));
    },
    search(params = {}, now = new Date()) {
      const { where, values, limit, requestedOffset, sort, sortExpression, mediaCondition, belowCondition, recentCondition } = searchQuery(params, now);
      const insights = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN ${mediaCondition} THEN 1 ELSE 0 END) AS withPhotos, SUM(CASE WHEN ${belowCondition} THEN 1 ELSE 0 END) AS belowOriginal, SUM(CASE WHEN ${recentCondition} THEN 1 ELSE 0 END) AS recentlyListed FROM listings WHERE ${where}`).get(...values);
      const total = insights.total;
      const offset = Math.min(Math.floor(requestedOffset / limit) * limit, Math.max(0, Math.ceil(total / limit) - 1) * limit);
      const records = db.prepare(`SELECT public_json FROM listings WHERE ${where} ORDER BY ${sortExpression},id,source LIMIT ? OFFSET ?`).all(...values, limit, offset);
      const showcaseRows = db.prepare(`SELECT public_json FROM listings WHERE ${where} AND ${mediaCondition} ORDER BY random() LIMIT 2`).all(...values);
      const parsed = [...records, ...showcaseRows].map(row => JSON.parse(row.public_json));
      const keys = new Map(parsed.map(listing => [listing.source + ':' + listing.id, listing]));
      const media = new Map();
      // Fetch one page's photos together; larger pages do not add per-card database queries.
      if (keys.size) {
        const query = mediaQuery([...keys.values()]);
        const photos = db.prepare(query.sql).all(...query.values);
        for (const photo of photos) {
          const key = photo.source + ':' + photo.listing_id;
          if (!media.has(key)) media.set(key, []);
          media.get(key).push({ url: '/media/' + photo.file, caption: keys.get(key).addressWithheld ? '' : photo.caption });
        }
      }
      const projected = parsed.map(listing => {
        if (listing.addressWithheld) { delete listing.PublicRemarks; delete listing.TaxLegalDescription; }
        return { ...listing, media: media.get(listing.source + ':' + listing.id) || [] };
      });
      const showcase = projected.slice(records.length).map(listing => ({ ...listing, featuredPhoto: Math.floor(Math.random() * listing.media.length) }));
      return { environment: 'demo', total, offset, limit, sort, insights: { withPhotos: insights.withPhotos || 0, belowOriginal: insights.belowOriginal || 0, recentlyListed: insights.recentlyListed || 0 }, showcase, listings: projected.slice(0,records.length), checkpoints: db.prepare('SELECT source,complete,updated_at FROM checkpoints').all() };
    },
  };
}
