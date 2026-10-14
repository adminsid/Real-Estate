import { locationAddress, coordinatesInNY } from '../../../scripts/mls-grid/location-model.mjs';
import { publicProjection, MARKETING_STATUSES } from '../../../scripts/mls-grid/client.mjs';

const counties = {Manhattan:['New York','New York County','New York (Manhattan)','Manhattan'],Brooklyn:['Kings','Kings County','Kings (Brooklyn)','Brooklyn'],Queens:['Queens','Queens County'],Bronx:['Bronx','Bronx County'],'Staten Island':['Richmond','Richmond County','Richmond (Staten Island)','Staten Island']};
export const boroughOf = row => row.StateOrProvince === 'NY' ? Object.entries(counties).find(([,names])=>names.includes(row.CountyOrParish))?.[0] || null : null;
export async function photoManifest(row) {
  const entries=[],seen=new Set();
  for(const media of Array.isArray(row.Media)?row.Media:[]) {
    const permissions=Array.isArray(media?.Permission)?media.Permission:[media?.Permission];
    if(!media || typeof media.MediaKey!=='string' || !media.MediaKey || seen.has(media.MediaKey) || !permissions.some(p=>String(p).toLowerCase()==='public') || permissions.some(p=>String(p).toLowerCase()==='private'))continue;
    seen.add(media.MediaKey);
    const revision=typeof media.MediaModificationTimestamp==='string'?media.MediaModificationTimestamp:null;
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([row.OriginatingSystemName,media.MediaKey,revision])));
    entries.push({key:media.MediaKey,revision,file:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''),position:Number.isFinite(media.Order)?media.Order:entries.length,caption:row.InternetAddressDisplayYN===false?'':String(media.ShortDescription || '').slice(0,2000)});
  }
  return entries;
}
// Keep the provider's sub-millisecond precision. Never derive replication versions from Date milliseconds.
export function timestampKey(value) {
  const match=String(value).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,30}))?Z$/);
  if(!match || !Number.isFinite(Date.parse(value)))throw Error('Invalid replication timestamp');
  return match[1]+'.'+(match[2]||'').padEnd(30,'0')+'Z';
}
export function replica(db) {
  const prepare=(sql,values=[])=>db.prepare(sql).bind(...values);
  const fence=(source,lease,now)=>prepare('SELECT lease_id FROM feed_state WHERE source=? AND lease_id=? AND lease_until>?',[source,lease,now]);
  return {
    state:()=>prepare('SELECT * FROM feed_state WHERE source=?',['onekey2']).first(),
    async acquire(now=Date.now()) {
      const lease=crypto.randomUUID();
      const result=await prepare('UPDATE feed_state SET lease_id=?,lease_until=?,last_attempt=?,bootstrap_started=COALESCE(bootstrap_started,?) WHERE source=? AND lease_until<=? AND retry_after<=?',[lease,now+240000,new Date(now).toISOString(),now,'onekey2',now,now]).run();
      return result.meta.changes?lease:null;
    },
    async release(lease) {await prepare('UPDATE feed_state SET lease_until=0,lease_id=NULL WHERE source=? AND lease_id=?',['onekey2',lease]).run();},
    async request(lease,now=Date.now(),bytes=32*1024*1024) {
      const hour=Math.floor(now/3600000);
      const result=await prepare(`INSERT INTO feed_budget(hour,requests,bytes) SELECT ?,1,? WHERE EXISTS(SELECT 1 FROM feed_state WHERE source=? AND lease_id=? AND lease_until>?) AND COALESCE((SELECT SUM(requests) FROM feed_budget WHERE hour>=?),0)<6000 AND COALESCE((SELECT SUM(requests) FROM feed_budget WHERE hour>=?),0)<35000 AND COALESCE((SELECT SUM(bytes) FROM feed_budget WHERE hour>=?),0)+?<=3000000000 AND COALESCE((SELECT SUM(bytes) FROM feed_budget WHERE hour>=?),0)+?<=50000000000 ON CONFLICT(hour) DO UPDATE SET requests=requests+1,bytes=feed_budget.bytes+excluded.bytes`,[hour,bytes,'onekey2',lease,now,hour-1,hour-24,hour-1,bytes,hour-24,bytes]).run();
      if(!result.meta.changes)throw Error('Provider budget unavailable');
      const state=await this.state(),start=Math.max(now,state.last_request_at+550);
      const paced=await prepare('UPDATE feed_state SET last_request_at=? WHERE source=? AND lease_id=? AND lease_until>?',[start,'onekey2',lease,now]).run();
      if(!paced.meta.changes)throw Error('Replication lease expired');
      return Math.max(0,start-now);
    },
    async settleBytes(lease,requestedAt,reserved,actual,now=Date.now()) {
      if(!Number.isInteger(actual) || actual<0 || actual>reserved)throw Error('Invalid provider byte accounting');
      const result=await prepare('UPDATE feed_budget SET bytes=bytes-? WHERE hour=? AND bytes>=? AND EXISTS(SELECT 1 FROM feed_state WHERE source=? AND lease_id=? AND lease_until>?)',[reserved-actual,Math.floor(requestedAt/3600000),reserved-actual,'onekey2',lease,now]).run();
      if(!result.meta.changes)throw Error('Replication lease expired or byte accounting unavailable');
    },
    async failure(lease,error,now=Date.now()) {
      const status=String(error.message).match(/HTTP (\d{3})/)?.[1];
      const reason=String(error.message).includes('budget')?'budget':status==='401'||status==='403'?'credentials':status==='429'?'rate_limit':'connection_or_payload';
      await prepare('UPDATE feed_state SET failure=?,retry_after=? WHERE source=? AND lease_id=?',[reason,now+(reason==='credentials'?3600000:reason==='rate_limit'?900000:60000),'onekey2',lease]).run();
      return reason;
    },
    async apply(rows,next,lease,now=Date.now(), checkpoint=true,{refreshLocations=false}={}) {
      if(!await fence('onekey2',lease,now).first())throw Error('Replication lease expired');
      const statements=[],state=await this.state();
      // One bounded lookup per page replaces a network round trip per source row.
      const previous=rows.length?await prepare('SELECT v.id,v.modified,COALESCE(l.projection_version,0) AS projection_version FROM listing_versions v LEFT JOIN listings l ON l.source=v.source AND l.id=v.id WHERE v.source=? AND v.id IN (SELECT value FROM json_each(?))',['onekey2',JSON.stringify(rows.map(row=>row.ListingKey))]).all():{results:[]};
      const versions=new Map(previous.results.map(row=>[row.id,row.modified]));
      const projections=new Map(previous.results.map(row=>[row.id,row.projection_version]));
      let max=state.cycle_watermark || state.watermark || null,baseline=state.initial_baseline || null;
      for(const row of rows) {
        if(row.OriginatingSystemName!=='onekey2' || !/^[A-Za-z0-9_-]+$/.test(row.ListingKey || '') || !Number.isFinite(Date.parse(row.ModificationTimestamp)))throw Error('Invalid replication row');
        const modified=timestampKey(row.ModificationTimestamp),iso=row.ModificationTimestamp;
        if(!max || modified>timestampKey(max))max=iso;
        if(state.phase==='initial' && (!baseline || modified<timestampKey(baseline)))baseline=iso;
        const source=row.OriginatingSystemName,id=row.ListingKey;
        const version=versions.get(id);
        const guard='EXISTS (SELECT 1 FROM feed_state WHERE source=? AND lease_id=? AND lease_until>?)';
        const guards=[source,lease,now];
        if(version && (version>modified || (version===modified && !(refreshLocations && (projections.get(id)||0)<1)))) {
          // The same facts can arrive with newly signed media URLs. Record that acquisition
          // for every pending photo, while never letting an older source version change it.
          if(version===modified)statements.push(prepare(`UPDATE listing_media SET state=CASE WHEN state='failed' AND attempted_at<=?-3600000 THEN 'pending' ELSE state END,failure=CASE WHEN state='failed' AND attempted_at<=?-3600000 THEN NULL ELSE failure END,attempted_at=? WHERE source=? AND listing_id=? AND state IN ('pending','failed') AND ${guard} AND EXISTS (SELECT 1 FROM listing_versions WHERE source=? AND id=? AND modified=?)`,[now,now,now,source,id,...guards,source,id,modified]));
          continue;
        }
        versions.set(id,modified);
        const publicRow=publicProjection(row),borough=boroughOf(row);
        // Only currently marketed inventory is in this release. Sold/off-market display awaits source-specific approval.
        const eligible=publicRow && row.StateOrProvince==='NY' && MARKETING_STATUSES.includes(publicRow.StandardStatus);
        statements.push(prepare(`INSERT INTO listing_versions SELECT ?,?,? WHERE ${guard} ON CONFLICT(source,id) DO UPDATE SET modified=excluded.modified WHERE excluded.modified>listing_versions.modified`,[source,id,modified,...guards]));
        const fresh=`${guard} AND EXISTS (SELECT 1 FROM listing_versions WHERE source=? AND id=? AND modified=?)`;
        const freshValues=[...guards,source,id,modified];
        if(!eligible) {
          statements.push(prepare(`DELETE FROM listing_media WHERE source=? AND listing_id=? AND ${fresh}`,[source,id,...freshValues]));
          statements.push(prepare(`DELETE FROM listings WHERE source=? AND id=? AND ${fresh}`,[source,id,...freshValues]));
          continue;
        }
        publicRow.obtainedAt=new Date(now).toISOString();
        const manifest=await photoManifest(row);
        const address=locationAddress(publicRow),hasCoordinates=!publicRow.addressWithheld&&coordinatesInNY(publicRow.Latitude,publicRow.Longitude);
        const search=[publicRow.UnparsedAddress,publicRow.StreetNumber,publicRow.StreetName,publicRow.UnitNumber,publicRow.City,publicRow.PostalCity,publicRow.KEY_ManNYNeighborhood,borough,publicRow.PostalCode,publicRow.ListingId].filter(Boolean).join(' ').toLowerCase();
        const date=/^\d{4}-\d{2}-\d{2}/.test(publicRow.OnMarketDate || '')?publicRow.OnMarketDate.slice(0,10):null;
        const price=typeof publicRow.ListPrice==='number'?publicRow.ListPrice:null;
        const values=[source,id,publicRow.StandardStatus,publicRow.City || null,'NY',price,publicRow.BedroomsTotal ?? null,publicRow.PropertyType || null,search,JSON.stringify(publicRow),borough,price===null?1:0,date,date===null?1:0,price>0 && publicRow.OriginalListPrice>price?1:0,row.ListingId || null,hasCoordinates?publicRow.Latitude:null,hasCoordinates?publicRow.Longitude:null,hasCoordinates?'mls':null,address?.key||null,1];
        statements.push(prepare(`INSERT INTO listings(source,id,status,city,state,price,beds,property_type,search_text,public_json,borough,missing_price,on_market_date,missing_date,below_original,provider_id,latitude,longitude,map_source,address_key,projection_version) SELECT ${values.map(()=>'?').join(',')} WHERE ${fresh} ON CONFLICT(source,id) DO UPDATE SET status=excluded.status,city=excluded.city,price=excluded.price,beds=excluded.beds,property_type=excluded.property_type,search_text=excluded.search_text,public_json=excluded.public_json,borough=excluded.borough,missing_price=excluded.missing_price,on_market_date=excluded.on_market_date,missing_date=excluded.missing_date,below_original=excluded.below_original,provider_id=excluded.provider_id,latitude=CASE WHEN excluded.latitude IS NOT NULL THEN excluded.latitude WHEN listings.address_key=excluded.address_key THEN listings.latitude ELSE NULL END,longitude=CASE WHEN excluded.longitude IS NOT NULL THEN excluded.longitude WHEN listings.address_key=excluded.address_key THEN listings.longitude ELSE NULL END,map_source=CASE WHEN excluded.map_source IS NOT NULL THEN excluded.map_source WHEN listings.address_key=excluded.address_key THEN listings.map_source ELSE NULL END,geocode_after=CASE WHEN listings.address_key=excluded.address_key THEN listings.geocode_after ELSE 0 END,address_key=excluded.address_key,projection_version=excluded.projection_version`,[...values,...freshValues]));
        const encoded=JSON.stringify(manifest);
        statements.push(prepare(`DELETE FROM listing_media WHERE source=? AND listing_id=? AND media_key NOT IN (SELECT json_extract(value,'$.key') FROM json_each(?)) AND ${fresh}`,[source,id,encoded,...freshValues]));
        statements.push(prepare(`INSERT INTO listing_media(source,listing_id,media_key,revision,file,position,caption,attempted_at) SELECT ?,?,json_extract(value,'$.key'),json_extract(value,'$.revision'),json_extract(value,'$.file'),json_extract(value,'$.position'),json_extract(value,'$.caption'),? FROM json_each(?) WHERE ${fresh} ON CONFLICT(source,listing_id,media_key) DO UPDATE SET revision=excluded.revision,file=excluded.file,position=excluded.position,caption=excluded.caption,state=CASE WHEN listing_media.file=excluded.file AND NOT (listing_media.state='failed' AND listing_media.attempted_at<=excluded.attempted_at-3600000) THEN listing_media.state ELSE 'pending' END,attempted_at=excluded.attempted_at,failure=CASE WHEN listing_media.file=excluded.file AND NOT (listing_media.state='failed' AND listing_media.attempted_at<=excluded.attempted_at-3600000) THEN listing_media.failure ELSE NULL END`,[source,id,now,encoded,...freshValues]));
        statements.push(prepare(`UPDATE listings SET has_photos=EXISTS(SELECT 1 FROM listing_media WHERE source=? AND listing_id=? AND state='ready') WHERE source=? AND id=? AND ${fresh}`,[source,id,source,id,...freshValues]));
      }
      if(checkpoint) {
        // Facts, removals, media permissions, and pagination commit together. Photo bytes are independent.
        statements.push(prepare('UPDATE feed_state SET next_url=?,cycle_watermark=?,initial_baseline=?,failure=NULL,retry_after=0 WHERE source=? AND lease_id=? AND lease_until>?',[next,max,baseline,'onekey2',lease,now]));
        if(!next && state.phase==='initial') {
          // A visible-only bootstrap cannot observe removals during its traversal. Catch up unfiltered
          // from the first received version before any public listing becomes eligible for release.
          statements.push(prepare("UPDATE feed_state SET phase='catchup',watermark=? WHERE source=? AND lease_id=? AND lease_until>?",[baseline,'onekey2',lease,now]));
        } else if(!next) {
          statements.push(prepare("UPDATE feed_state SET watermark=COALESCE(cycle_watermark,watermark),cycle_watermark=NULL,initial_complete=1,phase='delta',last_complete=? WHERE source=? AND lease_id=? AND lease_until>?",[new Date(now).toISOString(),'onekey2',lease,now]));
        }
      }
      if(statements.length)await db.batch(statements);
    },
  };
}
