import { BOROUGHS } from './confidence.mjs';
export const RECENT_SEARCH_KEY='property-search-recent-v1';
const types={'':'All properties',Residential:'Buy','Residential Lease':'Rent','Residential Income':'Invest','Commercial Sale':'Commercial sale','Commercial Lease':'Commercial lease',Land:'Land'};
const money=value=>'$'+Number(value).toLocaleString('en-US');
const amount=value=>{const match=String(value).replace(/million/gi,'m').replace(/thousand/gi,'k').replace(/[$,\s]/g,'').match(/^(\d+(?:\.\d+)?)([km])?$/i);if(!match)return null;const number=Number(match[1])*({k:1000,m:1000000}[match[2]?.toLowerCase()]||1);return number>=0&&number<=1e10?Math.round(number*100)/100:null;};
export function interpretSearch(input,{type='Residential',borough='NYC',areas=[]}={}) {
 let text=String(input||'').trim().slice(0,200),rest=text.replace(/\b(?:not over|no more than|at most)\b/gi,'up to');
 const params={type:Object.hasOwn(types,type)?type:'Residential',borough:[...BOROUGHS,'NYS','NYC'].includes(borough)?borough:'NYC',status:'Active'},warnings=[];
 if(/\b(?:not|without|except)\s+(?:exactly\s+)?\d+\s*(?:bed|bath)/i.test(text)||/\b(?:under|below|up to|at most|no more than)\s+\d+\s*(?:bed|bath)/i.test(text))warnings.push('Use an exact or minimum bedroom/bathroom choice. This wording needs clarification before searching.');
 const price=(key,value)=>{const number=amount(value);if(number===null){warnings.push('Check the price amount; the supported range is zero to ten billion.');return;}if(params[key]!==undefined&&params[key]!==String(number))warnings.push('More than one '+(key==='maxPrice'?'maximum':'minimum')+' price was entered. Use one amount.');params[key]=String(number);};
 const consume=(regex,fn)=>{rest=rest.replace(regex,(...args)=>{fn(...args);return ' ';});};
 if(/\bcommercial\b/i.test(rest)){params.type=/\b(lease|rent)\b/i.test(rest)?'Commercial Lease':'Commercial Sale';rest=rest.replace(/\b(commercial|for\s+lease|for\s+sale|lease|buy|rent)\b/gi,' ');}
 else if(/\bland\b/i.test(rest)){params.type='Land';rest=rest.replace(/\b(land|buy|for sale)\b/gi,' ');}
 else if(/\b(invest|investment|multi[- ]?family)\b/i.test(rest)){params.type='Residential Income';rest=rest.replace(/\b(invest|investment|multi[- ]?family)\b/gi,' ');}
 else if(/\b(for rent|rent|rental|rentals)\b/i.test(rest)){params.type='Residential Lease';rest=rest.replace(/\b(for rent|rent|rentals?)\b/gi,' ');}
 else if(/\b(buy|for sale)\b/i.test(rest)){params.type='Residential';rest=rest.replace(/\b(buy|for sale)\b/gi,' ');}
 consume(/\b(?:at least\s+)?(exactly\s+)?(\d{1,2})\s*\+?\s*(?:bedrooms?|beds?|br)\b/gi,(_all,exact,n)=>{if(Number(n)<=20)params[exact?'bedsExact':'beds']=String(Number(n));else warnings.push('Check the bedroom count.');});
 consume(/\bstudio\b/gi,()=>{params.bedsExact='0';delete params.beds;});
 consume(/\b(\d{1,2})\s*\+?\s*(?:bathrooms?|baths?|ba)\b/gi,(_all,n)=>{if(Number(n)<=100)params.baths=String(Number(n));});
 const numeric='(\\$?\\s*\\d[\\d,]*(?:\\.\\d+)?(?:\\s*(?:million|thousand|k|m)\\b)?)';
 consume(new RegExp('\\bbetween\\s+'+numeric+'\\s+and\\s+'+numeric,'gi'),(_all,a,b)=>{price('minPrice',a);price('maxPrice',b);});
 consume(new RegExp('(?:\\b(?:under|below|up to|maximum|max|budget(?: of)?)|<=)\\s*'+numeric,'gi'),(_all,a)=>price('maxPrice',a));
 consume(new RegExp('(?:\\b(?:over|above|at least|minimum|min)|>=)\\s*'+numeric,'gi'),(_all,a)=>price('minPrice',a));
 const aliases=[...BOROUGHS.map(value=>({value,label:value})),{value:'Bronx',label:'The Bronx'},{value:'NYS',label:'New York State'},{value:'NYC',label:'NYC'}].sort((a,b)=>b.label.length-a.label.length);
 // Match a whole location phrase. "Queens Village" and "Manhattan Beach"
 // must not become the borough plus a leftover keyword.
 const locationPhrase=rest.replace(/\b(?:in|with|for|and)\b/gi,' ').replace(/\s+/g,' ').trim();
 const boroughMatch=aliases.find(area=>area.label.toLowerCase()===locationPhrase.toLowerCase());
 if(boroughMatch){params.borough=boroughMatch.value;rest='';}
 rest=rest.replace(/^\s*(?:show me|find me|find|show|looking for)\s+/i,'').replace(/\b(?:bedroom|homes?|properties|apartments?)\b/gi,' ').replace(/\b(?:in|with|for|and)\b/gi,' ').replace(/\s+/g,' ').trim();
 rest=rest.replace(/^MLS\s*#?\s*/i,'');
 const area=areas.find(area=>String(area.value||area.label).toLowerCase()===rest.toLowerCase());
 if(area&&rest){params.areas=JSON.stringify([area.value||area.label]);if(area.borough&&params.borough==='NYC')params.borough=area.borough;}
 else if(rest)params.q=rest;
 if(params.minPrice&&params.maxPrice&&Number(params.minPrice)>Number(params.maxPrice))warnings.push('Minimum price is higher than maximum price. Edit the amounts before searching.');
 const chips=[{key:'type',label:types[params.type]},...(params.borough!=='NYC'?[{key:'borough',label:params.borough}]:[]),...(params.areas?[{key:'areas',label:JSON.parse(params.areas)[0]+' · reported area'}]:[]),...(params.q?[{key:'q',label:(/^\d{5}(?:-\d{4})?$/.test(params.q)?'ZIP: ':/^(?:MLS\s*#?\s*)?(?:KEY|H|L)\d+$/i.test(params.q)?'MLS: ':'Search: ')+params.q}]:[]),...(params.bedsExact!==undefined?[{key:'bedsExact',label:params.bedsExact==='0'?'Studio':'Exactly '+params.bedsExact+' bedrooms'}]:params.beds?[{key:'beds',label:params.beds+'+ bedrooms'}]:[]),...(params.baths?[{key:'baths',label:params.baths+'+ bathrooms'}]:[]),...(params.minPrice?[{key:'minPrice',label:'From '+money(params.minPrice)}]:[]),...(params.maxPrice?[{key:'maxPrice',label:'Up to '+money(params.maxPrice)}]:[])];
 return {params,chips,warnings};
}
export function searchURL(params) {
 const query=new URLSearchParams({browse:'1',borough:'NYC',type:'Residential',status:'Active',limit:'24',sort:'newest',offset:'0'});
 for(const [key,value]of Object.entries(params))if(value!==undefined&&(value!==''||['type','status'].includes(key)))query.set(key,String(value));
 return '/?'+query;
}
export function cleanRecent(input) {
 if(!Array.isArray(input))return [];
 const allowed=new Set(['browse','borough','type','status','q','areas','places','beds','bedsExact','baths','minPrice','maxPrice','limit','sort','offset','source','subtype','required','preferred','minArea','minBuildingArea','minLot','minUnits','maxTax','maxFee','availableBy','parking','bounds','photosOnly','recent','belowOriginal']);
 return input.filter(item=>typeof item?.label==='string'&&item.label.length<=220&&typeof item?.href==='string'&&item.href.startsWith('/?')&&item.href.length<=2000).filter(item=>{try{const url=new URL(item.href,'https://local.invalid');return url.origin==='https://local.invalid'&&url.pathname==='/'&&[...url.searchParams.keys()].every(key=>allowed.has(key));}catch{return false;}}).slice(0,6).map(({label,href})=>({label,href}));
}
export function rememberSearch(storage,item) {
 try{const normalize=item=>{const url=new URL(item.href,'https://local.invalid');url.searchParams.sort();return {label:item.label,href:'/?'+url.searchParams};},safe=cleanRecent([item])[0];if(!safe)return false;const current=normalize(safe),old=cleanRecent(JSON.parse(storage.getItem(RECENT_SEARCH_KEY)||'[]')).map(normalize),next=cleanRecent([current,...old.filter(previous=>previous.href!==current.href)]);storage.setItem(RECENT_SEARCH_KEY,JSON.stringify(next));return true;}catch{return false;}
}
