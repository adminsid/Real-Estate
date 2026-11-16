import { sourceFetcher } from './source-dispatch.mjs';
import { timestampKey } from './replica.mjs';
const source='onekey2',endpoint='https://api.mlsgrid.com/v2/OpenHouse';
const safeKey=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
function link(value){const url=new URL(value,endpoint);if(url.origin!=='https://api.mlsgrid.com'||url.pathname!=='/v2/OpenHouse'||url.username||url.password||url.hash||!url.searchParams.get('$filter')?.includes("OriginatingSystemName eq 'onekey2'"))throw Error('Unsafe OpenHouse cursor');return url.href;}
function instant(value){return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;}
export function projectOpenHouse(row){
 if(!row||row.OriginatingSystemName!==source||!safeKey(row.OpenHouseKey))throw Error('Invalid OpenHouse identity');const version=timestampKey(row.ModificationTimestamp);
 const start=instant(row.OpenHouseStartTime),end=instant(row.OpenHouseEndTime),type=String(row.OpenHouseType||'').toLowerCase(),status=String(row.OpenHouseStatus||'').toLowerCase(),canUse=Array.isArray(row.MlgCanUse)&&row.MlgCanUse.some(v=>String(v).toLowerCase()==='idx');
 const key=safeKey(row.ListingKey)?row.ListingKey:null,number=typeof row.ListingId==='string'&&row.ListingId.length<=160?row.ListingId.replace(/^KEY/,''):null;
 const visible=row.MlgCanView===true&&canUse&&type==='public'&&['','active'].includes(status)&&start&&end&&end>start&&(key||number);
 return {id:row.OpenHouseKey,modified:row.ModificationTimestamp,version,key:visible?key:null,number:visible?number:null,start:visible?start:null,end:visible?end:null,public:visible?1:0};
}
async function json(response){const reader=response.body?.getReader();if(!reader)throw Error('Empty OpenHouse response');let size=0;const parts=[];try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024)throw Error('Oversized OpenHouse response');parts.push(value);}}finally{await reader.cancel();}const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}return JSON.parse(new TextDecoder().decode(bytes));}
export async function syncOpenHouses(env,{now=()=>Date.now(),fetcher,maxPages=2}={}){
 if(env.LIVE_SYNC_ENABLED!=='true'||!env.LIVE_DB||!env.SOURCE_GATEWAY&&!fetcher)return {status:'disabled'};const db=env.LIVE_DB,at=now(),lease=crypto.randomUUID();
 await db.prepare('INSERT OR IGNORE INTO open_house_state(source,baseline) VALUES (?,?)').bind(source,new Date(at-300000).toISOString()).run();
 const acquired=await db.prepare('UPDATE open_house_state SET lease=?,lease_until=?,last_attempt=? WHERE source=? AND lease_until<=? AND retry_after<=? AND (phase!=\'delta\' OR last_attempt<=?)').bind(lease,at+180000,at,source,at,at,at-300000).run();if(!acquired.meta.changes)return {status:'busy_or_not_due'};
 let stage='state';
 let state=await db.prepare('SELECT * FROM open_house_state WHERE source=? AND lease=?').bind(source,lease).first(),pages=0,examined=0;
 const fence="EXISTS(SELECT 1 FROM open_house_state WHERE source='onekey2' AND lease=? AND lease_until>?)";
 try{
  if(state.phase==='delta'&&state.last_complete<at-6*86400000){await db.batch([db.prepare(`DELETE FROM open_house_records WHERE source=? AND ${fence}`).bind(source,lease,now()),db.prepare("UPDATE open_house_state SET phase='initial',timestamp=NULL,next_url=NULL,baseline=? WHERE source=? AND lease=?").bind(new Date(at-300000).toISOString(),source,lease)]);state={...state,phase:'initial',timestamp:null,next_url:null,baseline:new Date(at-300000).toISOString()};}
  const get=fetcher||sourceFetcher(env,'openhouse');
  while(pages<Math.min(4,maxPages)){
   let url=state.next_url;
   if(!url){const initial=new URL(endpoint);let filter="OriginatingSystemName eq 'onekey2'";if(state.phase==='initial')filter+=' and MlgCanView eq true';else{const timestamp=state.phase==='catchup'?state.baseline:state.timestamp;if(timestamp){timestampKey(timestamp);filter+=' and ModificationTimestamp gt '+timestamp;}}initial.searchParams.set('$filter',filter);initial.searchParams.set('$top','1000');url=initial.href;}
   stage='request';const response=await get(link(url));if(!response.ok){await response.body?.cancel();const status=response.status;await db.prepare('UPDATE open_house_state SET failure=?,retry_after=? WHERE source=? AND lease=?').bind('http_'+status,now()+([401,403].includes(status)?86400000:status===429?900000:300000),source,lease).run();return {status:'source_unavailable',upstreamStatus:status};}
   stage='json';const data=await json(response);stage='projection';if(!Array.isArray(data.value)||data.value.length>1000)throw Error('Invalid OpenHouse page');const rows=data.value.map(projectOpenHouse),diagnostics={records:rows.length,viewable:data.value.filter(r=>r.MlgCanView===true).length,idxEligible:data.value.filter(r=>Array.isArray(r.MlgCanUse)&&r.MlgCanUse.includes('IDX')).length,publicType:data.value.filter(r=>String(r.OpenHouseType).toLowerCase()==='public').length,zonedTimes:data.value.filter(r=>instant(r.OpenHouseStartTime)&&instant(r.OpenHouseEndTime)).length,retainedPublic:rows.filter(r=>r.public).length};let greatest=state.timestamp;
   for(const row of rows)if(!greatest||row.version>timestampKey(greatest))greatest=row.modified;
   stage='cursor';const next=data['@odata.nextLink']?link(data['@odata.nextLink']):null;if(next===url)throw Error('Repeated OpenHouse cursor');
   stage='write';const statements=rows.map(row=>db.prepare(`INSERT INTO open_house_records(source,id,modified,version,listing_key,listing_number,start_at,end_at,public) SELECT ?,?,?,?,?,?,?,?,? WHERE ${fence} ON CONFLICT(source,id) DO UPDATE SET modified=excluded.modified,version=excluded.version,listing_key=excluded.listing_key,listing_number=excluded.listing_number,start_at=excluded.start_at,end_at=excluded.end_at,public=excluded.public WHERE excluded.version>=open_house_records.version`).bind(source,row.id,row.modified,row.version,row.key,row.number,row.start,row.end,row.public,lease,now()));
   // Bounded statement groups respect D1 batch limits. Cursor follows all row commits.
   for(let i=0;i<statements.length;i+=40)await db.batch(statements.slice(i,i+40));
   let phase=next?state.phase:state.phase==='initial'?'catchup':'delta';const complete=!next&&state.phase!=='initial';
   const committed=await db.prepare(`UPDATE open_house_state SET next_url=?,timestamp=?,phase=?,examined=examined+?,last_complete=CASE WHEN ? THEN ? ELSE last_complete END,failure=NULL,retry_after=0,diagnostics=CASE WHEN ? THEN ? ELSE diagnostics END WHERE source=? AND lease=? AND lease_until>?`).bind(next,greatest,phase,rows.length,complete?1:0,now(),rows.length?1:0,JSON.stringify(diagnostics),source,lease,now()).run();if(!committed.meta.changes)return {status:'lease_lost'};
   pages++;examined+=rows.length;state={...state,next_url:next,timestamp:greatest,phase};if(complete)break;
  }
  return {status:state.phase==='delta'?'current':'importing',pages,examined};
 }catch(error){const deferred=error?.sourceFailure===true,reason=deferred?'source_deferred':'connection_or_payload';await db.prepare('UPDATE open_house_state SET failure=?,retry_after=?,diagnostics=? WHERE source=? AND lease=?').bind(reason,Math.max(now()+60000,Number(error?.retryAt)||now()+300000),JSON.stringify({failureStage:stage,failureCode:({'Unsafe OpenHouse cursor':'unsafe_cursor','Invalid OpenHouse identity':'identity','Invalid replication timestamp':'timestamp','Invalid OpenHouse page':'page','Repeated OpenHouse cursor':'repeated_cursor','Invalid source request class':'request_class','Source coordinator unavailable':'coordinator_missing'})[error?.message]||'unexpected'}),source,lease).run();return {status:reason};}
 finally{await db.prepare('UPDATE open_house_state SET lease=NULL,lease_until=0 WHERE source=? AND lease=?').bind(source,lease).run();}
}
export async function openHouseStatus(db){const s=await db.prepare('SELECT phase,last_attempt,last_complete,examined,failure,retry_after,diagnostics FROM open_house_state WHERE source=?').bind(source).first();const count=await db.prepare('SELECT COUNT(*) AS total FROM open_house_records WHERE source=? AND public=1 AND end_at>?').bind(source,new Date().toISOString()).first();return {...s,diagnostics:s?.diagnostics?JSON.parse(s.diagnostics):null,upcomingPublicRecords:count.total};}
