export const IMAGE_VARIANTS={thumb:{width:160,quality:84},cardSmall:{width:480,quality:86},card:{width:720,quality:86},cardLarge:{width:1080,quality:88},display:{width:1600,quality:92},displayLarge:{width:2560,quality:92}};
import { searchStore } from './store.mjs';
import { insertJob } from './job-store.mjs';
async function boundedBytes(response){
 if(!response.ok||!response.body)throw Error('Image optimization unavailable');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024)throw Error('Image output too large');chunks.push(value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export async function imageObject(env,store,record,variant,{now=Date.now()}={}){
 const bucket=env.SEARCH_MEDIA,key=variant?'optimized/v1/'+record.file+'-'+variant+'.webp':record.file;
 if(variant){const cached=await bucket.get(key);if(cached)return {object:cached,type:'image/webp',representation:variant+'-v1'};}
 if(variant&&env.PREPARED_MEDIA_ONLY==='true'){
  // The read path never invokes Images or substitutes an unbounded original.
  // Fixed profile jobs are deduplicated and published by the durable outbox.
  const parent=await env.SEARCH_DB.prepare("SELECT source,listing_id FROM listing_media WHERE file=? AND state='ready' LIMIT 1").bind(record.file).first();
  if(parent)await insertJob(env.SEARCH_DB,{kind:'variant',source:parent.source,id:parent.listing_id,revision:record.file,profile:variant==='card'?'cardSmall':variant,now}).run();
  for(const profile of ['cardSmall','cardLarge','display']){
   if(profile===variant)continue;
   const ready=await bucket.get('optimized/v1/'+record.file+'-'+profile+'.webp');
   if(ready)return {object:ready,type:'image/webp',representation:profile+'-v1'};
  }
  const smallOriginal=await bucket.get(record.file);
  if(smallOriginal&&smallOriginal.size<=150*1024)return {object:smallOriginal,type:record.type,representation:'original'};
  await smallOriginal?.body?.cancel?.();return null;
 }
 const original=await bucket.get(record.file);if(!original)return null;
 const limit=Math.min(1000,Math.max(0,Number.parseInt(env.IMAGE_TRANSFORM_LIMIT,10)||0));
 if(variant&&env.IMAGES&&limit){
  const month=new Date(now).toISOString().slice(0,7);
  const reserved=await env.SEARCH_DB.prepare('INSERT INTO image_transform_budget VALUES (?,1) ON CONFLICT(month) DO UPDATE SET attempts=attempts+1 WHERE attempts<?').bind(month,limit).run();
  if(reserved.meta.changes){
   try{
    const spec=IMAGE_VARIANTS[variant];
    const output=await env.IMAGES.input(original.body).transform({width:spec.width,fit:'scale-down'}).output({format:'image/webp',quality:spec.quality,anim:false});
    const bytes=await boundedBytes(output.response());
    if(!await store.mediaFile(record.file))return null;
    await bucket.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});
    return {object:{body:bytes,size:bytes.byteLength},type:'image/webp',representation:variant+'-v1'};
   }catch{
    // Original may have been consumed by the transformer. Reopen without losing a photo.
    const fallback=await bucket.get(record.file);return fallback?{object:fallback,type:record.type,representation:'original'}:null;
   }
  }
 }
 return {object:original,type:record.type,representation:'original'};
}

export async function prepareVariant(env,file,profile,{now=Date.now()}={}){
 if(!Object.hasOwn(IMAGE_VARIANTS,profile))throw Error('Invalid image size');
 const store=searchStore(env.SEARCH_DB,{production:true}),record=await store.mediaFile(file);
 if(!record)return 'unavailable';
 const key='optimized/v1/'+file+'-'+profile+'.webp';
 if(await env.SEARCH_MEDIA.head(key))return 'ready';
 const original=await env.SEARCH_MEDIA.get(file);if(!original)return 'unavailable';
 const limit=Math.min(100000,Math.max(0,Number.parseInt(env.IMAGE_TRANSFORM_LIMIT,10)||0)),month=new Date(now).toISOString().slice(0,7);
 if(!limit||!env.IMAGES){await original.body?.cancel?.();return 'budget';}
 const reserved=await env.SEARCH_DB.prepare('INSERT INTO image_transform_budget VALUES (?,1) ON CONFLICT(month) DO UPDATE SET attempts=attempts+1 WHERE attempts<?').bind(month,limit).run();
 if(!reserved.meta.changes){await original.body?.cancel?.();return 'budget';}
 const spec=IMAGE_VARIANTS[profile];
 const output=await env.IMAGES.input(original.body).transform({width:spec.width,fit:'scale-down'}).output({format:'image/webp',quality:spec.quality,anim:false});
 const bytes=await boundedBytes(output.response());
 if(!await store.mediaFile(file))return 'unavailable';
 await env.SEARCH_MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});
 return 'ready';
}
