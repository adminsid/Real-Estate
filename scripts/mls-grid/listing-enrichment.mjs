// Only an explicit listing/gallery visit requests enrichment. Search crawls never do.
export function followListing(listing,{onUpdate,onStatus,onUnavailable,fetcher=fetch,visible=()=>!document.hidden}={}) {
 const base=`/api/listing/${encodeURIComponent(listing.source)}/${encodeURIComponent(listing.id)}`;
 let stopped=false,timer,attempts=0;
 const controller=new AbortController();
 const stop=()=>{stopped=true;clearTimeout(timer);controller.abort();};
 const poll=async()=>{
  if(stopped)return;
  if(!visible()){timer=setTimeout(poll,5000);return;}
  try{
   const response=await fetcher(base,{cache:'no-store',redirect:'error',signal:controller.signal});
   if(stopped)return;
   if(response.status===404){onUnavailable?.();stop();return;}
   if(!response.ok)throw Error('Listing update unavailable');
   const data=await response.json();if(stopped)return;
   onUpdate?.(data.listing);onStatus?.(data.enrichment);
   if(!data.enrichment||data.enrichment.state==='available'||data.enrichment.state==='waiting'){stop();return;}
   if(++attempts>=36){onStatus?.({state:'paused'});stop();return;}
   timer=setTimeout(poll,5000);
  }catch{if(!stopped)onStatus?.({state:'paused'});stop();}
 };
 void (async()=>{
  try{
   const response=await fetcher(base+'/enrich',{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:controller.signal});
   if(!response.ok)throw Error('Listing refresh unavailable');
   await poll();
  }catch{if(!stopped)onStatus?.({state:'paused'});stop();}
 })();
 return stop;
}

export function enrichmentMessage(status) {
 if(!status)return '';
 const count=Number.isInteger(status.knownPhotos)?`${status.readyPhotos} of ${status.knownPhotos} photos ready. `:'';
 if(status.state==='queued')return count+'More photos requested. They will appear here as they arrive.';
 if(status.state==='loading')return count+'More photos are arriving now.';
 if(status.state==='waiting')return count+'More photos are waiting for the next permitted source refresh.';
 if(status.state==='paused')return 'Updates paused. Refresh this page to try again. Your saved listing details are still available.';
 return status.readyPhotos<status.knownPhotos?count+'More photos are not available yet.':count;
}
