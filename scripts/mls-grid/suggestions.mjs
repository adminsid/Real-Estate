import { searchQuery } from './search-query.mjs';
import { reportedArea } from './location-model.mjs';
import { BOROUGH_COUNTIES } from './search-filters.mjs';
export function suggestionQuery({q='',type='Residential',borough='NYC',status='Active'}={},production=false) {
 const text=String(q).trim().slice(0,100);if(text.length<2)return null;
 const query=searchQuery({q:text,type,borough,status},new Date(),production);
 return {sql:`SELECT public_json FROM listings WHERE ${query.where} LIMIT 80`,values:query.values,text};
}
export function publicSuggestions(records,text) {
 const query=text.toLowerCase(),items=[],seen=new Set();
 const add=item=>{const key=item.kind+':'+item.value;if(!seen.has(key)&&items.length<12){seen.add(key);items.push(item);}};
 for(const record of records){const l=JSON.parse(record.public_json),area=reportedArea(l),borough=Object.entries(BOROUGH_COUNTIES).find(([,counties])=>counties.includes(l.CountyOrParish))?.[0];
  if(area.toLowerCase().includes(query))add({kind:'area',label:area,value:area,...(borough?{borough}:{})});
  const zip=String(l.PostalCode||'');if(zip.startsWith(text))add({kind:'zip',label:zip,value:zip});
 }
 for(const record of records){const l=JSON.parse(record.public_json);
  if(!l.addressWithheld&&typeof l.UnparsedAddress==='string'&&l.UnparsedAddress.toLowerCase().includes(query))add({kind:'address',label:l.UnparsedAddress.slice(0,180),value:l.UnparsedAddress.slice(0,180)});
  if(l.ListingId&&String(l.ListingId).toLowerCase().includes(query))add({kind:'mls',label:'MLS #'+String(l.ListingId).slice(0,80),value:String(l.ListingId).slice(0,80)});
 }
 return items.sort((a,b)=>({area:0,zip:1,address:2,mls:3}[a.kind]-{area:0,zip:1,address:2,mls:3}[b.kind]));
}
