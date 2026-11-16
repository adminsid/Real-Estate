import { CHECKLIST, STAGES, createJourney } from './confidence.mjs';
import { relevantGuidance } from './guidance.mjs';
const $=selector=>document.querySelector(selector);
const node=(tag,text='',className='')=>{const element=document.createElement(tag);element.textContent=text;if(className)element.className=className;return element;};
const action=(text,callback,className='secondary')=>{const button=node('button',text,className);button.type='button';button.addEventListener('click',callback);return button;};
const anchor=(text,href)=>{const link=node('a',text);link.href=href;return link;};
export function heartIcon(saved) {
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('width','22');svg.setAttribute('height','22');
 const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z');path.setAttribute('fill',saved?'currentColor':'none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
}
export function guidancePanel(listing) {
 const box=node('details','','context-guide');box.append(node('summary','Understand your next step'));
 for(const item of relevantGuidance(listing)) {const details=node('details','','context-topic');details.append(node('summary',item.title),node('p',item.summary),anchor('Read the explanation','/guide#'+item.id));box.append(details);}
 box.append(anchor('All rights and process guides','/guide'));return box;
}
export function initializeConfidence({getSaved,toggleSaved,renderCard,address,publicEmail,openContact}) {
 let storage;try{storage=localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw Error();},removeItem:()=>{throw Error();}};}
 const journey=createJourney(storage),status=$('#journey-status');
 function announce(text){status.textContent=text;}
 let pendingUndo;function saveNotice(text,undo){const toast=$('#save-feedback');$('#save-feedback-text').textContent=text;pendingUndo=undo;$('#save-feedback-undo').hidden=typeof undo!=='function';toast.hidden=false;}
 $('#save-feedback-undo').addEventListener('click',()=>{const undo=pendingUndo;pendingUndo=null;$('#save-feedback-undo').hidden=true;undo?.();});
 $('#save-feedback-close').addEventListener('click',()=>{$('#save-feedback').hidden=true;});
 const stage=$('#journey-stage');for(const [key,title]of Object.entries(STAGES))stage.append(new Option(title,key));stage.value=journey.get().stage;
 function nextStep(){const stage=journey.get().stage,copy={exploring:'Save a few possibilities and note what matters to you.',comparing:'Compare reported facts and write down costs or details to confirm.',viewing:'Prepare your questions, identify the contact and confirm a viewing time.',deciding:'Ask your professional which documents and due-diligence steps apply before you commit.'};$('#journey-next').textContent=copy[stage];}
 stage.addEventListener('change',()=>{announce(journey.setStage(stage.value)?'Your chosen stage is saved in this browser.':'Browser storage is unavailable. This stage lasts for this page only.');nextStep();});nextStep();
 function editor(listing) {
  const key=listing.source+':'+listing.id,entry=journey.get().entries[key]||{},details=node('details','','planning-editor');details.append(node('summary','My notes & viewing plan'));
  const labelReason=node('label','What caught your eye?'),reason=node('textarea');reason.rows=2;reason.maxLength=400;reason.value=entry.reason||'';reason.placeholder='For example: the layout or outdoor space';labelReason.append(reason);
  const labelQuestions=node('label','Questions to ask'),questions=node('textarea');questions.rows=3;questions.maxLength=800;questions.value=entry.questions||'';questions.placeholder='For example: What costs are not included?';labelQuestions.append(questions);
  details.append(labelReason,labelQuestions,node('p','Private planning notes on this browser. Do not enter financial, medical, identity or other sensitive information.','muted'));
  const saved=node('p','','note-status');saved.setAttribute('role','status');
  const save=action('Save my notes',()=>{saved.textContent=journey.update(key,{reason:reason.value,questions:questions.value})?'Notes saved in this browser.':'Browser storage is unavailable. Your notes last for this page only.';});details.append(save,saved);
  const checklist=node('fieldset','','planning-checklist');checklist.append(node('legend','Prepare at your own pace'),node('p','These are your reminders, not proof that a legal requirement was completed.','muted'));
  for(const [id,title] of Object.entries(CHECKLIST)) {const label=node('label'),check=node('input');check.type='checkbox';check.checked=entry.checks?.[id]===true;check.addEventListener('change',()=>{const current=journey.get().entries[key]||{};announce(journey.update(key,{checks:{...current.checks,[id]:check.checked}})?'Your reminder was updated.':'Browser storage is unavailable. This reminder lasts for this page only.');});label.append(check,node('span',title));checklist.append(label);}details.append(checklist);
  const viewing=node('div','','viewing-plan');viewing.append(node('h4','My preferred viewing time'));
  const fields=node('div','','two-columns'),dateLabel=node('label','Date'),date=node('input'),timeLabel=node('label','Time (New York)'),time=node('input');date.type='date';time.type='time';date.value=entry.viewing?.date||'';time.value=entry.viewing?.time||'';dateLabel.append(date);timeLabel.append(time);fields.append(dateLabel,timeLabel);
  const state=node('p',entry.viewing?entry.viewing.state==='email-draft'?'Email draft opened. Delivery and appointment are unconfirmed.':'Preference saved. No request has been sent.':'Choose a preference; ask the contact to confirm it.','muted');state.setAttribute('role','status');
  viewing.append(fields,action('Save preferred time',()=>{if(!date.value||!time.value||!date.checkValidity()||!time.checkValidity()){state.textContent='Choose a valid date and time.';return;}state.textContent=journey.update(key,{viewing:{date:date.value,time:time.value,state:'preference'}})?'Preference saved in this browser. No request has been sent.':'Browser storage is unavailable. No request has been sent.';}),state);
  if(publicEmail(listing)){const request=action('Prepare viewing request',()=>openContact(listing,'tour',request), '');viewing.append(request);}
  details.append(viewing);return details;
 }
 let loadingVersion=0;
 async function loadSaved() {
  const version=++loadingVersion,keys=getSaved(),results=$('#journey-properties');results.setAttribute('aria-busy','true');results.replaceChildren();$('#journey-saved-count').textContent=String(keys.length);
  if(!keys.length){const empty=node('div','','journey-empty');empty.append(node('h2','A little space for your possibilities.'),node('p','Save a property with the heart. Return here to compare it, keep questions and prepare a viewing.'),anchor('Explore properties','/?browse=1'));results.append(empty);results.setAttribute('aria-busy','false');return;}
  announce('Checking your saved properties against the current listing source…');
  try {
   const params=new URLSearchParams({borough:'NYS',type:'',status:'',savedOnly:'1',saved:keys.join(','),limit:'96',offset:'0',sort:'newest'});
   const response=await fetch('/api/search?'+params);if(!response.ok)throw Error();const first=await response.json();let listings=first.listings;
   if(first.total>96){params.set('offset','96');const next=await fetch('/api/search?'+params);if(!next.ok)throw Error();listings=[...listings,...(await next.json()).listings];}
   if(version!==loadingVersion)return;
   results.replaceChildren(...listings.map((listing,i)=>{const card=renderCard(listing,i);card.classList.add('journey-card');card.querySelector('.card-body').append(editor(listing));return card;}));
   const visible=new Set(listings.map(l=>l.source+':'+l.id)),unavailable=keys.filter(key=>!visible.has(key));
   if(unavailable.length){const notice=node('details','','unavailable-saves');notice.append(node('summary',`${unavailable.length} saved ${unavailable.length===1?'property is':'properties are'} unavailable`),node('p','A listing may have changed status, been removed or become unavailable for display. Private notes are kept until you remove the save.'));
    for(const key of unavailable)notice.append(action('Remove unavailable save '+key,()=>{toggleSaved(key);}));results.append(notice);}
   announce(`${listings.length} current saved ${listings.length===1?'property':'properties'}. Compare up to four using the Compare buttons.`);
  }catch{if(version===loadingVersion){announce('Your saved properties could not load. Your saves and notes are still here.');results.append(action('Try again',loadSaved));}}
  finally{if(version===loadingVersion)results.setAttribute('aria-busy','false');}
 }
 $('#journey-refresh').addEventListener('click',loadSaved);
 $('#journey-clear').addEventListener('click',()=>{$('#journey-clear-confirm').hidden=false;});
 $('#journey-clear-cancel').addEventListener('click',()=>{$('#journey-clear-confirm').hidden=true;});
 $('#journey-clear-do').addEventListener('click',()=>{const cleared=journey.clear();stage.value='exploring';nextStep();$('#journey-clear-confirm').hidden=true;announce(cleared?'Planning notes and reminders cleared. Your saved-property list is unchanged.':'Notes cleared for this page. Browser storage could not be updated.');loadSaved();});
 window.addEventListener('storage',event=>{if(event.key==='prime-america-search-v1')announce('Saved properties changed in another tab. Refresh to see the current list.');});
 function viewingDraft(listing,date,time){const key=listing.source+':'+listing.id;if(!getSaved().includes(key))return;journey.update(key,{viewing:{date,time,state:'email-draft'}});}
 function removed(key){journey.remove(key);}
 return {loadSaved,saveNotice,removed,entry:key=>journey.get().entries[key],restore:(key,entry)=>journey.update(key,entry),viewingDraft,preferredTime:key=>journey.get().entries[key]?.viewing};
}
export { initializeSearchStart as initializeStart } from './search-start.mjs';
