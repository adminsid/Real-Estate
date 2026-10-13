import { FEATURE_FILTERS, featureList, parsePlaces, reportedFeatures, locationCoordinates } from './search-filters.mjs';
import { createSearchMap } from './search-map.mjs';
const $=selector=>document.querySelector(selector);
const node=(tag,text='',className='')=>{const element=document.createElement(tag);element.textContent=text;if(className)element.className=className;return element;};
const action=(text,callback)=>{const button=node('button',text,'secondary');button.type='button';button.addEventListener('click',callback);return button;};
const safeList=value=>{try{return featureList(value);}catch{return [];}};
const safePlaces=value=>{try{return parsePlaces(value);}catch{return [];}};

export function initializeDiscovery({form,search,renderCard}) {
  let layout,controller,version=0,selectionController,mapData,comparisonTrigger,returnRestored=false;
  const comparison=new Map(),layoutRoot=$('#discovery-layout');
  const urlLayout=new URLSearchParams(location.search).get('layout');
  try{layout=urlLayout||localStorage.getItem('property-search-layout');}catch{layout=urlLayout;}
  if(!['homes','split','map'].includes(layout))layout=matchMedia('(min-width: 1000px)').matches?'split':'homes';
  const map=createSearchMap({
    selectBorough(borough){form.elements.borough.value=borough;form.elements.bounds.value='';form.elements.areas.value='';form.elements.places.value='';search();},
    selectListing:selectMapListing,
    searchBounds(bounds){form.elements.bounds.value=bounds;search();},
    clearBounds(){if(form.elements.bounds.value){form.elements.bounds.value='';search();}},
  });
  function applyLayout(){
    const effective=layout==='split'&&matchMedia('(max-width: 560px)').matches?'homes':layout;
    layoutRoot.dataset.layout=effective;
    for(const anchor of document.querySelectorAll('#search-page a[href]')){const url=new URL(anchor.href,location.href);if(url.pathname.startsWith('/listing/')){url.searchParams.set('layout',layout);anchor.href=url.href;}}
    for(const button of document.querySelectorAll('[data-layout]'))button.setAttribute('aria-pressed',String(button.dataset.layout===effective));
    if(effective!=='homes')map.load().catch(()=>{$('#map-status').textContent='The map could not load. Your property results remain available.';});
  }
  window.addEventListener('resize',applyLayout);
  for(const button of document.querySelectorAll('[data-layout]'))button.addEventListener('click',()=>{layout=button.dataset.layout;applyLayout();try{localStorage.setItem('property-search-layout',layout);}catch{/* Optional preference. */}const url=new URL(location.href);url.searchParams.set('layout',layout);history.replaceState(null,'',url);});
  const filterSheet=$('.more-filters'),filterContent=filterSheet.querySelector('.popover-content');
  filterSheet.addEventListener('toggle',()=>{const modal=filterSheet.open&&!filterSheet.closest('dialog')&&matchMedia('(max-width:560px)').matches;filterContent.setAttribute('role',modal?'dialog':'group');filterContent.setAttribute('aria-label','More filters');if(modal){filterContent.setAttribute('aria-modal','true');$('#close-filters').focus();}else filterContent.removeAttribute('aria-modal');});
  filterContent.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();filterSheet.open=false;filterSheet.querySelector('summary').focus();}if(event.key==='Tab'&&filterContent.getAttribute('aria-modal')==='true'){const controls=[...filterContent.querySelectorAll('button,input,select,summary,a[href]')].filter(control=>!control.disabled&&control.getClientRects().length);const first=controls[0],last=controls.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
  $('#close-filters').addEventListener('click',()=>{$('.more-filters').open=false;$('.more-filters summary').focus();});
  const amenityControls=new Map();
  for(const [key,feature]of Object.entries(FEATURE_FILTERS)){
    const label=node('label',feature.label,'amenity-option'),select=node('select');select.setAttribute('aria-label',feature.label);
    select.append(new Option('No preference',''),new Option('Required','required'),new Option('Preferred','preferred'));label.append(select);$('#amenity-filters').append(label);amenityControls.set(key,select);
    select.addEventListener('change',()=>{for(const kind of ['required','preferred'])form.elements[kind].value=[...amenityControls].filter(([,control])=>control.value===kind).map(([feature])=>feature).join(',');if(form.elements.preferred.value)$('#sort').value='best';search();});
  }
  $('#place-picker').addEventListener('change',()=>{const control=$('#place-picker'),places=safePlaces(form.elements.areas.value);if(control.value&&!places.includes(control.value)&&places.length<8){form.elements.areas.value=JSON.stringify([...places,control.value]);search();}control.value='';});
  function sync(){
    const type=form.elements.type.value;
    for(const label of document.querySelectorAll('label[data-intents]')){const applies=!type||label.dataset.intents.split(',').includes(type);label.hidden=!applies;for(const control of label.querySelectorAll('input,select')){control.disabled=!applies;if(!applies)control.value=control.name==='bedMatch'?'minimum':'';}}
    for(const option of form.elements.subtype.options){option.hidden=Boolean(option.dataset.intents&&type&&!option.dataset.intents.split(',').includes(type));option.disabled=option.hidden;}
    if(form.elements.subtype.selectedOptions[0]?.disabled)form.elements.subtype.value='';
    $('#bathroom-filter').hidden=['Land','Commercial Sale','Commercial Lease'].includes(type);form.elements.baths.disabled=$('#bathroom-filter').hidden;if(form.elements.baths.disabled)form.elements.baths.value='';
    const required=safeList(form.elements.required.value),preferred=safeList(form.elements.preferred.value);
    for(const[key,control]of amenityControls)control.value=required.includes(key)?'required':preferred.includes(key)?'preferred':'';
    const places=safePlaces(form.elements.areas.value);$('#selected-places').replaceChildren(...places.map(place=>action(place+' ×',()=>{const remaining=places.filter(value=>value!==place);form.elements.areas.value=remaining.length?JSON.stringify(remaining):'';search();})));
    const count=['subtype','baths','minArea','minBuildingArea','minLot','minUnits','availableBy','maxTax','maxFee','parking'].filter(key=>form.elements[key].value).length+required.length+preferred.length+places.length;
    $('#filter-count').textContent=count?`(${count})`:'';
  }
  function chips(){const chips=[];for(const place of safePlaces(form.elements.places.value))chips.push(action('City: '+place+' ×',()=>{const remaining=safePlaces(form.elements.places.value).filter(value=>value!==place);form.elements.places.value=remaining.length?JSON.stringify(remaining):'';search();}));for(const place of safePlaces(form.elements.areas.value))chips.push(action(place+' ×',()=>{const remaining=safePlaces(form.elements.areas.value).filter(value=>value!==place);form.elements.areas.value=remaining.length?JSON.stringify(remaining):'';search();}));for(const kind of ['required','preferred'])for(const key of safeList(form.elements[kind].value)){const chip=action(`${FEATURE_FILTERS[key].label} · ${kind==='required'?'required':'preferred'} ×`,()=>{form.elements[kind].value=safeList(form.elements[kind].value).filter(value=>value!==key).join(',');search();});chips.push(chip);}if(form.elements.bounds.value)chips.push(action('Map area ×',()=>{form.elements.bounds.value='';search();}));return chips;}
  function restore(params){const exact=params.get('bedsExact');if(exact!==null){form.elements.beds.value=exact==='0'?'studio':exact;form.elements.bedMatch.value='exact';}}
  function invalidate(){
    controller?.abort();selectionController?.abort();version++;mapData=null;
    $('#map-selected').replaceChildren();$('#mapped-picker-label').hidden=true;
    $('#place-picker').disabled=true;$('#place-picker').replaceChildren(new Option('Updating areas…',''));
    map.update({areas:[],points:[],mapped:0,unmapped:0},form.elements.borough.value);
    $('#map-areas').inert=true;$('#search-map').inert=true;$('#map-status').textContent='Updating locations…';
  }
  async function refresh(params){
    controller?.abort();selectionController?.abort();$('#map-selected').replaceChildren();const current=++version;controller=new AbortController();
    $('#map-status').textContent='Updating locations…';
    const query=new URLSearchParams(params);query.delete('offset');
    try{const response=await fetch('/api/discovery?'+query,{signal:controller.signal});if(!response.ok)throw Error();const data=await response.json();if(current!==version)return;mapData=data;$('#map-areas').inert=false;$('#search-map').inert=false;map.update(data,form.elements.borough.value);
      const selected=safePlaces(form.elements.areas.value);$('#place-picker').replaceChildren(new Option('Choose an area',''),...data.places.filter(place=>!selected.includes(place.city)).map(place=>new Option(`${place.city} (${place.total.toLocaleString()})`,place.city)));$('#place-picker').disabled=selected.length>=8;
      $('#mapped-picker-label').hidden=!data.points.length;$('#mapped-picker').replaceChildren(new Option('Select a property',''),...data.points.map(point=>new Option(`${typeof point.price==='number'?'$'+point.price.toLocaleString():'Price not reported'} · ${point.id}`,`${point.source}:${point.id}`)));
    }catch(error){if(error.name!=='AbortError'&&current===version){mapData=null;map.update({areas:[],points:[],mapped:0,unmapped:0},form.elements.borough.value);$('#map-status').textContent='Location results could not update. Retry your search; property results remain available.';}}
  }
  async function selectMapListing(point){
    selectionController?.abort();selectionController=new AbortController();const signal=selectionController.signal;$('#map-selected').textContent='Loading property…';
    try{const response=await fetch(`/api/listing/${encodeURIComponent(point.source)}/${encodeURIComponent(point.id)}`,{signal});if(!response.ok)throw Error();const {listing}=await response.json();if(signal.aborted)return;if(!locationCoordinates(listing)){throw Error();}map.highlight(`${point.source}:${point.id}`);const card=renderCard(listing,0);$('#map-selected').replaceChildren(card);card.querySelector('h3')?.focus({preventScroll:true});}
    catch(error){if(error.name!=='AbortError')$('#map-selected').textContent='This property or its map location is no longer available. Refresh your search.';}
  }
  $('#mapped-picker').addEventListener('change',()=>{const point=mapData?.points.find(point=>`${point.source}:${point.id}`===$('#mapped-picker').value);if(point)selectMapListing(point);});
  function updateComparison(){
    $('#comparison-tray').hidden=!comparison.size;$('#comparison-count').textContent=`${comparison.size} of 4 properties selected`;$('#compare-open').disabled=comparison.size<2;
    for(const control of document.querySelectorAll('[data-compare-key]')){const chosen=comparison.has(control.dataset.compareKey);control.setAttribute('aria-pressed',String(chosen));control.textContent=chosen?'Selected for comparison':'Compare';}
  }
  function decorateCard(card,listing){
    const key=`${listing.source}:${listing.id}`,amenities=reportedFeatures(listing),wanted=safeList(form.elements.preferred.value),highlights=amenities.filter(key=>wanted.includes(key)).slice(0,2);
    if(highlights.length){const facts=node('p',highlights.map(key=>FEATURE_FILTERS[key].label).join(' · '),'preferred-facts');card.querySelector('.card-location').after(facts);}
    const compare=action('Compare',()=>{if(comparison.has(key))comparison.delete(key);else if(comparison.size<4)comparison.set(key,listing);else{$('#preference-status').textContent='Compare up to 4 properties. Remove one to add another.';return;}updateComparison();});compare.dataset.compareKey=key;compare.setAttribute('aria-label',`Compare ${listing.UnparsedAddress||'MLS '+listing.ListingId}`);card.querySelector('.card-actions').append(compare);
    if(comparison.has(key)){compare.setAttribute('aria-pressed','true');compare.textContent='Selected for comparison';}else compare.setAttribute('aria-pressed','false');
    card.addEventListener('focusin',()=>map.highlight(key));card.addEventListener('pointerenter',()=>map.highlight(key));
  }
  $('#compare-clear').addEventListener('click',()=>{comparison.clear();updateComparison();});
  $('#compare-close').addEventListener('click',()=>$('#comparison').close());$('#comparison').addEventListener('close',()=>comparisonTrigger?.focus());
  $('#compare-open').addEventListener('click',async()=>{
    comparisonTrigger=$('#compare-open');$('#comparison-content').textContent='Checking current property details…';$('#comparison').showModal();
    const listings=await Promise.all([...comparison.values()].map(async listing=>{try{const response=await fetch(`/api/listing/${encodeURIComponent(listing.source)}/${encodeURIComponent(listing.id)}`);if(!response.ok)return null;return (await response.json()).listing;}catch{return null;}}));
    const table=node('table','','comparison-table'),head=node('thead'),row=node('tr');row.append(node('th','Property'));for(const listing of listings){const cell=node('th');if(listing){const link=node('a',listing.UnparsedAddress||'Address withheld');link.href=`/listing/${encodeURIComponent(listing.source)}/${encodeURIComponent(listing.id)}`;cell.append(link);}else cell.textContent='Unavailable';row.append(cell);}head.append(row);table.append(head);
    const body=node('tbody'),fields=[['ListPrice','Asking price'],['PropertySubType','Property style'],['BedroomsTotal','Bedrooms'],['BathroomsTotalInteger','Bathrooms'],['LivingArea','Interior size'],['LivingAreaUnits','Size units'],['AssociationFee','Reported building fee'],['AssociationFeeFrequency','Fee frequency'],['TaxAnnualAmount','Annual taxes'],['AvailabilityDate','Available from'],['PetsAllowed','Pet policy'],['LaundryFeatures','Laundry'],['ListAgentFullName','Listing agent'],['ListOfficeName','Listing brokerage']];
    for(const[field,label]of fields){const row=node('tr');row.append(node('th',label));for(const listing of listings){const value=listing?.[field];row.append(node('td',value===undefined||value===null||value===''||(Array.isArray(value)&&!value.length)?'Not reported':Array.isArray(value)?value.join(', '):['ListPrice','AssociationFee','TaxAnnualAmount'].includes(field)&&typeof value==='number'?'$'+value.toLocaleString():String(value)));}body.append(row);}table.append(body);const wrap=node('div','','comparison-scroll');wrap.append(table);$('#comparison-content').replaceChildren(wrap,node('p','Figures are supplied by the listing source. Unreported costs and features require confirmation.','filter-hint'));
  });
  document.addEventListener('click',event=>{const anchor=event.target.closest('a[href]');if(anchor&&new URL(anchor.href,location.href).pathname.startsWith('/listing/')&&!$('#search-page').hidden){try{sessionStorage.setItem('property-search-return',JSON.stringify({query:location.search,scrollY:window.scrollY}));}catch{/* Optional return position. */}}});
  function restorePosition(){if(returnRestored)return;returnRestored=true;try{const saved=JSON.parse(sessionStorage.getItem('property-search-return')||'null');if(saved?.query===location.search&&Number.isFinite(saved.scrollY))requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,saved.scrollY)));}catch{/* Optional return position. */}}
  restore(new URLSearchParams(location.search));applyLayout();sync();
  return {sync,chips,refresh,invalidate,decorateCard,restorePosition,restore,params(params){params.set('layout',layout);if(params.get('beds')==='studio'){params.delete('beds');params.set('bedsExact','0');}else if(params.get('bedMatch')==='exact'&&params.has('beds')){params.set('bedsExact',params.get('beds'));params.delete('beds');}params.delete('bedMatch');}};
}
