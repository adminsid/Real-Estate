import { searchQuery, mediaQuery } from '../../../scripts/mls-grid/search-query.mjs';
import { discoveryQueries, discoveryResult } from '../../../scripts/mls-grid/discovery-data.mjs';
import { searchCheckpoints } from './search-checkpoints.mjs';

const safeListing = listing => {
  if (listing.addressWithheld) {
    for (const field of ['PublicRemarks','TaxLegalDescription','Latitude','Longitude','UnparsedAddress','StreetNumber','StreetNumberNumeric','StreetDirPrefix','StreetName','StreetSuffix','StreetDirSuffix','UnitNumber']) delete listing[field];
  }
  return listing;
};
const CARD_FIELDS=new Set(['id','source','addressWithheld','obtainedAt','ModificationTimestamp','ListingId','StandardStatus','ListPrice','OriginalListPrice','PhotosCount',
 'PropertyType','PropertySubType','OwnershipType','BedroomsTotal','BathroomsFull','BathroomsHalf','BathroomsTotalInteger','LivingArea','LivingAreaUnits',
 'BuildingAreaTotal','BuildingAreaUnits','LotSizeAcres','LotSizeSquareFeet','City','PostalCity','KEY_ManNYNeighborhood','KEY_Hamlet','KEY_Village','SubdivisionName',
 'StateOrProvince','CountyOrParish','PostalCode','UnparsedAddress','StreetNumber','StreetNumberNumeric','StreetDirPrefix','StreetName','StreetSuffix','StreetDirSuffix','UnitNumber',
 'ListOfficeName','ListOfficePhone','ListAgentFullName','AttributionContact','OnMarketDate','NumberOfUnitsTotal','YearBuilt','TaxAnnualAmount','NetOperatingIncome',
 'BusinessType','Zoning','Utilities','LeaseAmountFrequency','PetsAllowed','LeaseTerm','RentIncludes','AssociationFee','AssociationFeeFrequency',
 'LaundryFeatures','AssociationAmenities','InteriorFeatures','AccessibilityFeatures','ExteriorFeatures']);

export function searchStore(db, {production = false} = {}) {
  const rows = async (sql, values = []) => (await db.prepare(sql).bind(...values).all()).results;
  const first = (sql, values = []) => db.prepare(sql).bind(...values).first();
  async function attach(records,{cards=false}={}) {
    const listings = records.map(row => {let listing=safeListing(JSON.parse(row.public_json));if(production&&cards)listing=Object.fromEntries(Object.entries(listing).filter(([key])=>CARD_FIELDS.has(key)));if(production&&!listing.addressWithheld&&typeof row.latitude==='number'&&typeof row.longitude==='number')listing.mapLocation={latitude:row.latitude,longitude:row.longitude,source:row.map_source};return listing;});
    if (!listings.length) return [];
    const query = mediaQuery(listings,production);
    if(production&&cards)query.sql=`SELECT * FROM (SELECT scoped.*,ROW_NUMBER() OVER(PARTITION BY source,listing_id) AS ordinal FROM (${query.sql}) scoped) WHERE ordinal=1`;
    // A current manifest includes all public photos, even pending/failed downloads.
    // Aggregate only this page's listing IDs using the existing parent index.
    const [photos, counts] = await Promise.all([
      rows(query.sql, query.values),
      production ? rows(`SELECT c.source,c.listing_id,COUNT(m.media_key) AS photo_count
        FROM json_each(?) wanted JOIN listing_components c
        ON c.source=json_extract(wanted.value,'$[0]') AND c.listing_id=json_extract(wanted.value,'$[1]')
        LEFT JOIN listing_media m ON m.source=c.source AND m.listing_id=c.listing_id
        WHERE c.manifest_version=c.core_version GROUP BY c.source,c.listing_id`, [JSON.stringify(listings.map(listing=>[listing.source,listing.id]))]) : Promise.resolve([]),
    ]);
    const totals = new Map(counts.map(row=>[`${row.source}:${row.listing_id}`,row.photo_count]));
    const byListing = new Map();
    for (const photo of photos) {
      const key = `${photo.source}:${photo.listing_id}`;
      if (!byListing.has(key)) byListing.set(key, []);
      byListing.get(key).push(photo);
    }
    return listings.map(listing => {
      const key=`${listing.source}:${listing.id}`,media=byListing.get(key)||[];
      const reported=Number.isSafeInteger(listing.PhotosCount)&&listing.PhotosCount>=0?listing.PhotosCount:null;
      const photoCount=totals.has(key)?totals.get(key):production?reported:reported??media.length;
      const publicListing={...listing};delete publicListing.PhotosCount;
      return {...publicListing,photoCount,...(production&&cards?{summary:true}:{}),media:media.map(photo=>({url:`/media/${photo.file}`,caption:listing.addressWithheld?'':photo.caption,...(production?{previewReady:Boolean(photo.preview_ready)}:{})}))};
    });
  }
  return {
    async discovery(params={},now=new Date()) {
      const queries=discoveryQueries(params,now,production);
      const results=await Promise.all(Object.values(queries).map(query=>rows(query.sql,query.values)));
      return discoveryResult(...results);
    },
    async listing(source, id) {
      const record = await first('SELECT * FROM listings WHERE source=? AND id=?', [source, id]);
      return record ? (await attach([record]))[0] : null;
    },
    mediaFile(file) {
      return first(`SELECT m.file,m.type FROM listing_media m JOIN listings l ON l.source=m.source AND l.id=m.listing_id WHERE m.file=? ${production ? "AND m.state='ready' AND EXISTS(SELECT 1 FROM listing_components c WHERE c.source=m.source AND c.listing_id=m.listing_id AND c.manifest_version=c.core_version)" : ''} LIMIT 1`, [file]);
    },
    async search(params = {}, now = new Date()) {
      const { where, values, limit, requestedOffset, sort, sortExpression, mediaCondition, belowCondition, recentCondition } = searchQuery(params, now,production);
      // Capture before reading results. Tagging old results with a later commit
      // would conceal that change from open-page update detection indefinitely.
      const checkpoints=production?await searchCheckpoints(db):await rows('SELECT source,complete,updated_at FROM checkpoints');
      const stats = await first(`SELECT COUNT(*) AS total, SUM(CASE WHEN ${mediaCondition} THEN 1 ELSE 0 END) AS withPhotos, SUM(CASE WHEN ${belowCondition} THEN 1 ELSE 0 END) AS belowOriginal, SUM(CASE WHEN ${recentCondition} THEN 1 ELSE 0 END) AS recentlyListed FROM listings WHERE ${where}`, values);
      const total = production ? Math.min(stats.total,2500) : stats.total, offset = Math.min(Math.floor(requestedOffset / limit) * limit, Math.max(0, Math.ceil(total / limit) - 1) * limit);
      const records=await rows(`SELECT * FROM listings WHERE ${where} ORDER BY ${sortExpression},id,source LIMIT ? OFFSET ?`, [...values,Math.min(limit,total-offset),offset]);
      const listings = await attach(records,{cards:true});
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
