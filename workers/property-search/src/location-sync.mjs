import { coordinatesInNY, locationAddress } from '../../../scripts/mls-grid/location-model.mjs';
const GEOCODER='https://nysgeohub.ny.gov/arcgis/rest/services/Geocoder/NYS_Geocoder/GeocodeServer/findAddressCandidates';
const leaseGuard="EXISTS(SELECT 1 FROM feed_state WHERE source='onekey2' AND lease_id=? AND lease_until>?)";

export async function refreshLocationInventory(env,repo,client,lease,{now=()=>Date.now(),maxPages=1}={}){
 const db=env.LIVE_DB,state=await db.prepare('SELECT * FROM location_refresh WHERE id=1').first();
 if(!state||state.complete)return;
 let next=state.next_url||client.locationInitial();
 for(let i=0;i<maxPages&&next;i++){
  const page=await client.page(next);if(page.rows.length>100||page.next===next)throw Error('Invalid location refresh page');
  await repo.apply(page.rows,page.next,lease,now(),false,{refreshLocations:true});
  await db.prepare(`UPDATE location_refresh SET next_url=?,complete=?,processed=processed+?,last_attempt=?,failure=NULL WHERE id=1 AND ${leaseGuard}`).bind(page.next,page.next?0:1,page.rows.length,new Date(now()).toISOString(),lease,now()).run();next=page.next;
 }
}
// Restore NYC location labels first while the statewide replay continues independently.
export async function refreshNYCLocations(env,repo,client,lease,{now=()=>Date.now()}={}){
 const rows=(await env.LIVE_DB.prepare('SELECT provider_id FROM listings WHERE borough IS NOT NULL AND projection_version=0 AND provider_id IS NOT NULL ORDER BY id LIMIT 50').all()).results;
 const ids=rows.map(row=>row.provider_id).filter(id=>/^[A-Za-z0-9_-]+$/.test(id));
 if(!ids.length)return;
 const page=await client.page(client.properties(ids));
 if(page.rows.length>100)throw Error('Invalid location refresh page');
 await repo.apply(page.rows,null,lease,now(),false,{refreshLocations:true});
}
export function acceptedCandidate(data,zip){
 const candidates=(Array.isArray(data?.candidates)?data.candidates:[]).filter(candidate=>candidate.score>=98&&['PointAddress','Subaddress'].includes(candidate.attributes?.Addr_type)&&String(candidate.attributes?.Postal||'').slice(0,5)===zip&&coordinatesInNY(candidate.location?.y,candidate.location?.x)).sort((a,b)=>b.score-a.score);
 if(!candidates.length)return null;
 const first=candidates[0];
 if(candidates.slice(1).some(other=>first.score-other.score<2&&(Math.abs(first.location.x-other.location.x)>0.00001||Math.abs(first.location.y-other.location.y)>0.00001)))return null;
 return {latitude:first.location.y,longitude:first.location.x};
}
async function boundedJSON(response){
 if(!response.ok)throw Error('Geocoder HTTP '+response.status);if(!response.body)throw Error('Geocoder empty payload');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128*1024)throw Error('Geocoder response too large');chunks.push(value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function geocodeListings(env,lease,{fetcher=fetch,now=()=>Date.now(),maxRequests=3}={}){
 const db=env.LIVE_DB,day=new Date(now()).toISOString().slice(0,10),result={attempted:0,matched:0,reused:0,unmatched:0,unavailable:0,failures:{}};
 const rows=(await db.prepare('SELECT source,id,public_json,address_key FROM listings WHERE latitude IS NULL AND address_key IS NOT NULL AND geocode_after<=? ORDER BY geocode_after,CASE WHEN borough IS NOT NULL THEN 0 ELSE 1 END,id LIMIT ?').bind(now(),maxRequests).all()).results;
 for(const row of rows){
  const listing=JSON.parse(row.public_json),address=locationAddress(listing);if(!address||address.key!==row.address_key)continue;
  const cached=await db.prepare("SELECT latitude,longitude FROM listings WHERE address_key=? AND map_source='nys-address-point' AND latitude IS NOT NULL LIMIT 1").bind(address.key).first();
  if(cached){await db.prepare(`UPDATE listings SET latitude=?,longitude=?,map_source='nys-address-point' WHERE source=? AND id=? AND address_key=? AND latitude IS NULL AND ${leaseGuard}`).bind(cached.latitude,cached.longitude,row.source,row.id,address.key,lease,now()).run();result.reused++;continue;}
  const budget=await db.prepare(`INSERT INTO geocode_budget SELECT ?,1 WHERE ${leaseGuard} ON CONFLICT(day) DO UPDATE SET requests=requests+1 WHERE requests<1000`).bind(day,lease,now()).run();if(!budget.meta.changes)return result;
  // Only eligible public address fields leave the Worker. No contacts or private remarks.
  const claimed=await db.prepare(`UPDATE listings SET geocode_after=? WHERE source=? AND id=? AND address_key=? AND latitude IS NULL AND ${leaseGuard}`).bind(now()+86400000,row.source,row.id,address.key,lease,now()).run();if(!claimed.meta.changes)continue;
  result.attempted++;
  const body=new URLSearchParams({f:'json',Address:address.street,City:address.city,Region:'NY',Postal:address.zip,outSR:'4326',outFields:'Addr_type,Postal',maxLocations:'3'});
  try{
   const data=await boundedJSON(await fetcher(GEOCODER,{method:'POST',body,redirect:'manual',signal:AbortSignal.timeout(5000)})),point=acceptedCandidate(data,address.zip);
   if(!point){result.unmatched++;continue;}
   await db.prepare(`UPDATE listings SET latitude=?,longitude=?,map_source='nys-address-point',geocode_after=? WHERE source=? AND id=? AND address_key=? AND latitude IS NULL AND COALESCE(json_extract(public_json,'$.addressWithheld'),0)=0 AND ${leaseGuard}`).bind(point.latitude,point.longitude,now()+30*86400000,row.source,row.id,address.key,lease,now()).run();result.matched++;
  }catch(error){result.unavailable++;const reason=/^Geocoder HTTP [0-9]{3}$/.test(error.message)?error.message.replace('Geocoder ',''):['TimeoutError','AbortError'].includes(error.name)?'timeout':error.name==='SyntaxError'?'payload':String(error.message).toLowerCase().includes('redirect')?'redirect':'connection';result.failures[reason]=(result.failures[reason]||0)+1;/* Preserve results without guessing a location; retry is bounded to another day. */}
 }
 return result;
}
