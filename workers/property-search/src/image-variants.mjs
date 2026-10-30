export const IMAGE_VARIANTS={thumb:{width:160,quality:84},cardSmall:{width:480,quality:86},card:{width:720,quality:86},cardLarge:{width:1080,quality:88},display:{width:1600,quality:92},displayLarge:{width:2560,quality:92}};
async function boundedBytes(response){
 if(!response.ok||!response.body)throw Error('Image optimization unavailable');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024)throw Error('Image output too large');chunks.push(value);}}finally{await reader.cancel();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export async function imageObject(env,store,record,variant,{now=Date.now()}={}){
 const bucket=env.SEARCH_MEDIA,key=variant?'optimized/v1/'+record.file+'-'+variant+'.webp':record.file;
 if(variant){const cached=await bucket.get(key);if(cached)return {object:cached,type:'image/webp',representation:variant+'-v1'};}
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
