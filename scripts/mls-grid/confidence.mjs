// Consumer-owned planning data only. Never persist listing facts, documents or messages.
export const JOURNEY_KEY = 'property-search-journey-v1';
export const STAGES = Object.freeze({ exploring:'Exploring', comparing:'Comparing properties', viewing:'Preparing a viewing', deciding:'Considering an offer or application' });
export const CHECKLIST = Object.freeze({ role:'Ask whom the contact represents', costs:'Ask about costs that have not been reported', condition:'Prepare property and condition questions', documents:'Ask which disclosures apply', access:'Confirm the time and any access needs' });
export const validSavedKey = key => typeof key === 'string' && /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(key) && key.length <= 160;
export function cleanJourney(input) {
 const result={stage:'exploring',entries:{}};
 if(!input||typeof input!=='object')return result;
 if(Object.hasOwn(STAGES,input.stage))result.stage=input.stage;
 if(input.entries&&typeof input.entries==='object')for(const [key,item] of Object.entries(input.entries).slice(0,100)) {
  if(!validSavedKey(key)||!item||typeof item!=='object')continue;
  const entry={reason:typeof item.reason==='string'?item.reason.slice(0,400):'',questions:typeof item.questions==='string'?item.questions.slice(0,800):'',checks:{}};
  for(const check of Object.keys(CHECKLIST))if(item.checks?.[check]===true)entry.checks[check]=true;
  if(item.viewing&&typeof item.viewing==='object'&&/^\d{4}-\d{2}-\d{2}$/.test(item.viewing.date)&&/^\d{2}:\d{2}$/.test(item.viewing.time)&&['preference','email-draft','received'].includes(item.viewing.state))entry.viewing={date:item.viewing.date,time:item.viewing.time,state:item.viewing.state};
  result.entries[key]=entry;
 }
 return result;
}
export function createJourney(storage) {
 let state;try{state=cleanJourney(JSON.parse(storage.getItem(JOURNEY_KEY)||'null'));}catch{state=cleanJourney(null);}
 let memoryOnly=false;
 function refresh(){if(memoryOnly)return;try{state=cleanJourney(JSON.parse(storage.getItem(JOURNEY_KEY)||'null'));}catch{/* Keep usable page memory. */}}
 function persist(){try{storage.setItem(JOURNEY_KEY,JSON.stringify(state));memoryOnly=false;return true;}catch{memoryOnly=true;return false;}}
 return {
  get(){refresh();return structuredClone(state);},
  setStage(stage){if(!Object.hasOwn(STAGES,stage))return false;refresh();state.stage=stage;return persist();},
  update(key,patch){if(!validSavedKey(key))return false;refresh();state=cleanJourney({...state,entries:{...state.entries,[key]:{...state.entries[key],...patch}}});return persist();},
  remove(key){refresh();delete state.entries[key];return persist();},
  clear(){state=cleanJourney(null);try{storage.removeItem(JOURNEY_KEY);memoryOnly=false;return true;}catch{memoryOnly=true;return false;}},
 };
}
export const BOROUGHS = Object.freeze(['Manhattan','Brooklyn','Queens','Bronx','Staten Island']);
export function startSearch({query='',type='Residential',borough='NYC'}={}) {
 const params=new URLSearchParams({borough:BOROUGHS.includes(borough)||borough==='NYS'?borough:'NYC',type:['Residential','Residential Lease','Residential Income','Commercial Sale','Commercial Lease','Land'].includes(type)?type:'Residential',status:'Active',limit:'24',sort:'newest',offset:'0',browse:'1'});
 const text=String(query).trim().slice(0,200),area=BOROUGHS.find(area=>area.toLowerCase()===text.toLowerCase()||area==='Bronx'&&text.toLowerCase()==='the bronx');
 if(area)params.set('borough',area);else if(text)params.set('q',text);
 return '/?'+params;
}
export function experienceRoute(path,query='',embedded=false) {
 if(embedded||path==='/embed')return 'results';
 if(path==='/your-search')return 'journey';
 if(path==='/guide')return 'guide';
 if(path==='/how-it-works')return 'trust';
 return path==='/'&&!new URLSearchParams(query).size?'start':'results';
}
