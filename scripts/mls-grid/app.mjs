import { followListing,enrichmentMessage } from './listing-enrichment.mjs';
import { initializeBrand } from './brand-editor.mjs';
import { initializeBottomDock } from './bottom-dock.mjs';
import { initializeDiscovery } from './discovery.mjs';
import { connectEmbed } from './embed.mjs';
connectEmbed();
await initializeBrand();
import { mortgagePayment, monthlyFee, consumerProfile, publicEmail, publicMapURL, nyDate, listingSignals, previewFields } from './consumer.mjs';
const production=document.body.dataset.environment==='production';
const $ = selector => document.querySelector(selector);
const el = (tag, text = '', className = '') => { const node = document.createElement(tag); node.textContent = text; if(className)node.className=className; return node; };
const money = value => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:0,maximumFractionDigits:2}).format(value);
const number = value => new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
const provided = value => value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0);
const sourceName = source => source === 'onekey2' ? 'OneKey MLS' : source;
function areaFact(l) { if(l.LivingAreaUnits)return ['LivingArea',`living area (${l.LivingAreaUnits})`];if(provided(l.BuildingAreaTotal)&&l.BuildingAreaUnits)return ['BuildingAreaTotal',`building area (${l.BuildingAreaUnits==='Square Feet'?'sq ft':l.BuildingAreaUnits})`];return ['LivingArea','area (units not provided)']; }
const labels = { PostalCity:'Postal town', KEY_ManNYNeighborhood:'Reported neighborhood', KEY_Hamlet:'Hamlet', KEY_Village:'Village', SubdivisionName:'Subdivision / development', WaterfrontYN:'Waterfront', CountyOrParish:'County / borough', TaxLegalDescription:'Legal property description', ListPriceFrequency:'Price frequency', ListPrice:'Listed price', StandardStatus:'MLS listing status', PropertyType:'Property type', PropertySubType:'Property subtype', BedroomsTotal:'Bedrooms', BathroomsTotalInteger:'Total bathrooms (source count)', BathroomsFull:'Full bathrooms', BathroomsHalf:'Half bathrooms', LivingArea:'Living area', LivingAreaUnits:'Living area units', LivingAreaSource:'Area measurement source', AssociationFee:'Association / building charge', AssociationFeeFrequency:'Charge frequency', AssociationFeeIncludes:'What the charge includes', AssociationFee2:'Additional association charge', AssociationFee2Frequency:'Additional charge frequency', TaxAnnualAmount:'Annual property taxes', TaxYear:'Tax year', ListOfficeName:'Listing brokerage', ListOfficePhone:'Listing brokerage phone', ListAgentFullName:'Listing agent', AttributionContact:'Public listing contact', ModificationTimestamp:'Listing updated', ListingId:'MLS number', NumberOfUnitsTotal:'Reported unit count', GrossIncome:'Reported gross income', NetOperatingIncome:'Reported net operating income', OperatingExpense:'Reported operating expenses', AvailabilityDate:'Available from', SecurityDeposit:'Reported security deposit', RentIncludes:'Included in rent', TenantPays:'Renter pays', PetsAllowed:'Pet policy', OwnershipType:'Ownership type', LotSizeSquareFeet:'Lot area (sq ft)', LotSizeAcres:'Lot area (acres)', DaysOnMarket:'Days on market', BuildingAreaTotal:'Building area', BuildingAreaUnits:'Building area units', HighSchoolDistrict:'School district', ClosePrice:'Reported closing price', CloseDate:'Closing date' };
const label = field => labels[field] || (field.replace(/([a-z0-9])([A-Z])/g,'$1 $2').charAt(0)+field.replace(/([a-z0-9])([A-Z])/g,'$1 $2').slice(1).toLowerCase());
const valueText = value => !provided(value) ? 'Not provided in the imported listing' : Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? value ? 'Yes' : 'No' : typeof value === 'number' ? number(value) : String(value);
const fieldText = (l,f) => provided(l[f]) && ['ListPrice','OriginalListPrice','ClosePrice','AssociationFee','AssociationFee2','TaxAnnualAmount','SecurityDeposit','GrossIncome','OperatingExpense','NetOperatingIncome'].includes(f) && typeof l[f] === 'number' ? money(l[f]) : (['YearBuilt','TaxYear','StreetNumberNumeric'].includes(f) && provided(l[f]) ? String(l[f]) : valueText(l[f]));
const address = l => l.addressWithheld ? 'Address withheld by the listing source' : l.UnparsedAddress || [l.StreetNumber || l.StreetNumberNumeric,l.StreetDirPrefix,l.StreetName,l.StreetSuffix,l.UnitNumber ? `#${l.UnitNumber}` : ''].filter(Boolean).join(' ') || 'Address not provided';
const locationText = l => { const area=l.KEY_ManNYNeighborhood||l.PostalCity; if(area)return [area,l.StateOrProvince,l.PostalCode].filter(Boolean).join(', '); const borough=l.StateOrProvince==='NY' ? ({'New York (Manhattan)':'Manhattan','New York County':'Manhattan','Kings (Brooklyn)':'Brooklyn','Kings County':'Brooklyn',Queens:'Queens','Queens County':'Queens','Bronx County':'The Bronx',Bronx:'The Bronx','Richmond (Staten Island)':'Staten Island','Richmond County':'Staten Island'})[l.CountyOrParish] : null;return [borough || l.City,l.StateOrProvince,l.PostalCode].filter(Boolean).join(', '); };
function statusText(l) { return ({Active:l.PropertyType?.includes('Lease')?'For rent':'For sale','Coming Soon':'Coming soon','Active Under Contract':'Under contract',Pending:'Pending',Closed:l.PropertyType?.includes('Lease')?'Rented':'Sold'})[l.StandardStatus] || l.StandardStatus || 'Status not provided'; }
function priceText(l) { return typeof l.ListPrice==='number'?money(l.ListPrice):'Price not provided'; }
function facts(l) { return [[l.BedroomsTotal,'bedrooms'],[l.BathroomsFull,'full bathrooms'],[l.BathroomsHalf,'half bathrooms'],[l[areaFact(l)[0]],areaFact(l)[1]]].filter(([v,k])=>provided(v)&&!(k==='half bathrooms'&&v===0)).map(([v,k])=>`${number(v)} ${v===1?k.replace('bedrooms','bedroom').replace('bathrooms','bathroom'):k}`).join(' · ') || 'See property details'; }
function stamp(value) { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/New_York'}).format(date)+' ET' : 'Not provided'; }
function img(photo, alt, eager=false, variant='card') { const image=el('img'); image.src=photo.url+'?variant='+variant;if(variant==='card'){image.srcset=['cardSmall 480w','card 720w','cardLarge 1080w'].map(spec=>{const [key,width]=spec.split(' ');return photo.url+'?variant='+key+' '+width;}).join(',');image.sizes='(max-width: 560px) 100vw, (max-width: 1000px) 50vw, 33vw';} image.alt=photo.caption || alt; image.decoding='async'; image.loading=eager?'eager':'lazy'; if(eager)image.fetchPriority='high'; image.addEventListener('error',()=>{const note=el('div','Photo unavailable','photo-fallback');image.replaceWith(note);}); return image; }
function link(text,href,className='') { const node=el('a',text,className);node.href=href;if(document.body.dataset.embedded==='true'&&new URL(href,location.href).pathname.startsWith('/listing/')){node.target='_blank';node.rel='noopener';}return node; }
function action(text,fn,className='') { const node=el('button',text,className);node.type='button';node.addEventListener('click',fn);return node; }
function grid(l,fields,raw=false) { const node=el('dl','','fact-grid'); for(const f of fields){const item=el('div'),name=el('dt',label(f));if(raw)name.append(el('span',f,'raw-label'));item.append(name,el('dd',raw && typeof l[f]==='number' ? String(l[f]) : fieldText(l,f)));node.append(item);}return node; }
function section(title,id) { const node=el('section','','section');node.id=id;node.append(el('h2',title));return node; }

let stopGalleryRefresh, galleryListing;
let galleryPhotos=[],galleryIndex=0,galleryAddress='',galleryTrigger,photoVersion=0,galleryOriginal=false,galleryFullscreen=false;
async function showPhoto(index) {
  if(index<0||index>=galleryPhotos.length)return;
  galleryIndex=index;const version=++photoVersion,photo=galleryPhotos[index];$('#gallery-error').hidden=true;$('#gallery-image').classList.add('loading');$('#gallery-image').setAttribute('aria-busy','true');
  $('#gallery-count').textContent=`Photo ${index+1} of ${galleryPhotos.length}`;$('#gallery-caption').textContent=photo.caption || 'Photo supplied by the listing brokerage. Any staging disclosures remain visible in the image.';
  $('#gallery-previous').disabled=index===0;$('#gallery-next').disabled=index===galleryPhotos.length-1;
  [...$('#gallery-thumbs').children].forEach((b,i)=>b.setAttribute('aria-current',String(i===index)));
  $('#gallery-original').href=photo.url;const decoded=new Image();decoded.src=galleryOriginal?photo.url:photo.url+(Math.max(innerWidth,innerHeight)*Math.min(devicePixelRatio||1,2)>2560?'':'?variant='+(Math.max(innerWidth,innerHeight)*Math.min(devicePixelRatio||1,2)>1600?'displayLarge':'display'));
  try { await decoded.decode(); if(version!==photoVersion)return;$('#gallery-image').src=decoded.src;$('#gallery-image').alt=photo.caption || `Listing photo ${index+1} for ${galleryAddress}`; }
  catch { if(version===photoVersion)$('#gallery-error').hidden=false; }
  finally { if(version===photoVersion){$('#gallery-image').classList.remove('loading');$('#gallery-image').setAttribute('aria-busy','false');} }
  for(const i of [index+1,index-1])if(galleryPhotos[i]){const next=new Image();next.src=galleryPhotos[i].url+'?variant='+(Math.max(innerWidth,innerHeight)*Math.min(devicePixelRatio||1,2)>1600?'displayLarge':'display');}
}
function openGallery(l,trigger,index=0) { galleryListing=l;stopGalleryRefresh?.();if(production&&l!==activeListing)stopGalleryRefresh=watchListing(l); galleryOriginal=false;$('#gallery-quality').setAttribute('aria-pressed','false');galleryPhotos=l.media;galleryAddress=address(l);galleryTrigger=trigger;$('#gallery-title').textContent=galleryAddress;$('#gallery-thumbs').replaceChildren(...l.media.map((photo,i)=>{const b=action('',()=>showPhoto(i));b.setAttribute('aria-label',`Show photo ${i+1}`);b.append(img(photo,'',false,'thumb'));return b;}));$('#gallery-image').removeAttribute('src');showPhoto(index);document.body.classList.add('photo-viewing');$('#gallery').showModal(); }
$('#gallery-close').addEventListener('click',()=>$('#gallery').close());$('#gallery').addEventListener('close',()=>{photoVersion++;stopGalleryRefresh?.();document.body.classList.remove('photo-viewing');if(galleryFullscreen&&document.fullscreenElement)void document.exitFullscreen().catch(()=>{});galleryFullscreen=false;if(!galleryTrigger?.isConnected&&galleryListing===activeListing)galleryTrigger=$('[data-listing-photos] .all-photos')||$('#back-results');galleryTrigger?.focus();});$('#gallery-previous').addEventListener('click',()=>showPhoto(galleryIndex-1));$('#gallery-next').addEventListener('click',()=>showPhoto(galleryIndex+1));$('#gallery').addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();showPhoto(galleryIndex+1);}if(event.key==='ArrowLeft'){event.preventDefault();showPhoto(galleryIndex-1);}if(event.key==='Home'){event.preventDefault();showPhoto(0);}if(event.key==='End'){event.preventDefault();showPhoto(galleryPhotos.length-1);}});

$('#gallery-quality').addEventListener('click',()=>{galleryOriginal=!galleryOriginal;$('#gallery-quality').setAttribute('aria-pressed',String(galleryOriginal));showPhoto(galleryIndex);});
$('#gallery-fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen();galleryFullscreen=true;}}catch{$('#gallery-caption').textContent+=' · Full-screen mode is unavailable here; the viewer fills this window.';}});
$('#gallery-fullscreen').hidden=!document.fullscreenEnabled||!document.documentElement.requestFullscreen;
let touchStart;
$('.photo-stage').addEventListener('touchstart',event=>{if(event.touches.length===1)touchStart={x:event.touches[0].clientX,y:event.touches[0].clientY};else touchStart=null;},{passive:true});
$('.photo-stage').addEventListener('touchend',event=>{if(!touchStart||event.changedTouches.length!==1)return;const dx=event.changedTouches[0].clientX-touchStart.x,dy=event.changedTouches[0].clientY-touchStart.y;touchStart=null;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5)showPhoto(galleryIndex+(dx<0?1:-1));},{passive:true});

const form = $('#search');
let discovery,bottomDock;
let offset = 0, controller, requestVersion = 0, debounce, pageData;
let focusIndex = Math.max(0,Math.min(95,Number.parseInt(new URLSearchParams(location.search).get('focus'),10)||0));
const storageKey = 'prime-america-search-v1';
let preferences = { density:'3', view:'grid', textSize:'standard', limit:'24', sort:'priceAsc', saved:[], searches:[] };
try {
 const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
 for (const [key,allowed] of Object.entries({ density:['2','3','4','5'], view:['grid','list','focus'], textSize:['standard','large'], detailsMode:['overview','expanded'], limit:['12','24','48','96'], sort:['priceAsc','priceDesc','newest'] })) if (allowed.includes(stored[key])) preferences[key] = stored[key];
 if (Array.isArray(stored.saved)) preferences.saved = [...new Set(stored.saved.filter(key => typeof key === 'string' && /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(key) && key.length <= 160))].slice(0,100);
 if (Array.isArray(stored.searches)) preferences.searches = stored.searches.filter(item => typeof item?.query === 'string' && item.query.length <= 2000 && typeof item.label === 'string' && item.label.length <= 160).slice(0,10);
} catch { /* Browsing still works when storage is unavailable. */ }
function persist(message='Viewing preferences saved in this browser.') {
 try { localStorage.setItem(storageKey,JSON.stringify(preferences));$('#preference-status').textContent=message; }
 catch { $('#preference-status').textContent='Browser storage is unavailable. These choices will last for this page only.'; }
}
function listingHref(l) { return `${document.body.dataset.publicOrigin}/listing/${encodeURIComponent(l.source)}/${encodeURIComponent(l.id)}${location.search}`; }
function savedKey(l) { return `${l.source}:${l.id}`; }
function updateSavedButtons() {
 $('#saved-count').textContent=preferences.saved.length;
 for(const button of document.querySelectorAll('[data-save-key]')) {
  const saved=preferences.saved.includes(button.dataset.saveKey);
  button.textContent=saved?'♥':'♡';button.setAttribute('aria-pressed',String(saved));
  button.setAttribute('aria-label',`${saved?'Unsave':'Save'} ${button.dataset.saveAddress}`);
 }
}
function previewPanel(l) {
 const fields=previewFields(l);if(!fields.length)return null;
 const panel=grid(l,fields);panel.className='preview-facts';
 if(fields.includes('BuildingAreaTotal')&&!provided(l.BuildingAreaUnits)) panel.append(el('p','Building area units not supplied','muted'));
 if(fields.includes('NetOperatingIncome')) panel.append(el('p','Reported income · period not supplied','muted'));
 return panel;
}
function compactAttribution(l) {
 const block=el('div','','attribution');
 block.append(el('p',`Listed by ${l.ListOfficeName || 'brokerage not provided'}${l.ListAgentFullName?' · '+l.ListAgentFullName:''}`),el('p',`MLS #${l.ListingId || 'Not provided'} · ${sourceName(l.source)}`));
 if(l.AttributionContact || l.ListOfficePhone)block.append(el('p',`Listing contact: ${l.AttributionContact || l.ListOfficePhone}`));return block;
}
function card(l,i) {
 const profile=consumerProfile(l),node=el('article','',`listing-card card-${profile.key}`),href=listingHref(l),media=el('div','','card-media');let coverIndex=0;const cover=action('',()=>openGallery(l,cover,coverIndex),'card-photo');
 cover.setAttribute('aria-label',`Open photos for ${address(l)}`);cover.setAttribute('aria-haspopup','dialog');cover.disabled=!l.media.length;
 if(l.media.length) {
  const photo=img(l.media[0],`Listing photo for ${address(l)}`,i<3),count=el('span',`1 / ${l.media.length} photos`,'photo-tag');
  cover.append(photo,count);
  if(l.media.length>1) {
   let index=0,version=0;
   const previous=action('‹',()=>changePhoto(index-1),'photo-step previous'),next=action('›',()=>changePhoto(index+1),'photo-step next');
   previous.setAttribute('aria-label',`Previous photo for ${address(l)}`);next.setAttribute('aria-label',`Next photo for ${address(l)}`);previous.disabled=true;
   count.setAttribute('aria-live','polite');count.setAttribute('aria-atomic','true');
   async function changePhoto(target) {
    if(target<0||target>=l.media.length)return;const current=++version,selected=l.media[target],decoded=new Image();decoded.src=selected.url+'?variant=card';photo.classList.add('loading');
    try {await decoded.decode();if(current!==version||!node.isConnected)return;index=target;coverIndex=index;if(!cover.contains(photo)){cover.querySelector('.photo-fallback')?.remove();cover.prepend(photo);}photo.srcset=['cardSmall 480w','card 720w','cardLarge 1080w'].map(spec=>{const [key,width]=spec.split(' ');return selected.url+'?variant='+key+' '+width;}).join(',');photo.src=decoded.src;photo.alt=selected.caption||`Listing photo ${index+1} for ${address(l)}`;count.textContent=`${index+1} / ${l.media.length} photos`;previous.disabled=index===0;next.disabled=index===l.media.length-1;}
    catch {if(current===version)count.textContent='Photo unavailable — try again';}
    finally {if(current===version)photo.classList.remove('loading');}
   }
   media.append(previous,next);
  }
 } else {cover.append(el('div','Photo not available','photo-fallback'));}
 const save=action('',()=>{
  const key=savedKey(l),already=preferences.saved.includes(key);
  if(!already&&preferences.saved.length>=100){$('#preference-status').textContent='You have saved 100 homes. Unsave one to make room.';return;}
  preferences.saved=already?preferences.saved.filter(item=>item!==key):[...preferences.saved,key];
  persist(already?'Home removed from your browser saves.':'Home saved in this browser.');updateSavedButtons();
  if(form.elements.savedOnly.value==='1')scheduleSearch(0);
 },'save-home');
 save.dataset.saveKey=savedKey(l);save.dataset.saveAddress=address(l);
 media.prepend(cover);media.append(save);
 const body=el('div','','card-body'),heading=el('div','','card-heading');heading.append(el('span',statusText(l),'pill'),el('span',profile.label,'card-type'));body.append(heading,el('div',priceText(l),'card-price'));
 const residential=['house','condo','coop','rental'].includes(profile.key);
 if(residential)body.append(el('p',facts(l).replace(/bedrooms/g,'beds').replace(/bedroom/g,'bed').replace(/full bathrooms/g,'full baths').replace(/full bathroom/g,'full bath').replace(/half bathrooms/g,'half baths').replace(/half bathroom/g,'half bath').replace(/building area \(sq ft\)|living area \(Square Feet\)/g,'sq ft'),'card-facts'));
 if(l.PropertyType?.includes('Lease'))body.append(el('p',provided(l.LeaseAmountFrequency)?`Price period: ${valueText(l.LeaseAmountFrequency)}`:'Price period not supplied','muted'));
 const title=el('h3','','card-title');title.tabIndex=-1;title.append(link(address(l),href,'card-address'));
 body.append(title,el('p',locationText(l),'card-location'));
 const panel=previewPanel(l);if(panel)body.append(panel);
 const signals=listingSignals(l);if(signals.recentlyListed)body.append(el('p',`Listed ${signals.listedDate}`,'listing-signal'));
 if(signals.belowOriginal!==null)body.append(el('p',`${money(signals.belowOriginal)} below original price`,'listing-signal'));
 body.append(compactAttribution(l));
 const actions=el('div','','card-actions');actions.append(link('View details →',href,'details-link'));
 if((!production || publicEmail(l)) && ['Active','Coming Soon','Active Under Contract'].includes(l.StandardStatus)){const tour=action('Request a showing',()=>{activeListing=l;openContact('tour',tour);},'secondary');actions.append(tour);}
 body.append(actions);node.append(media,body);discovery?.decorateCard(node,l);return node;
}
function syncExperience() {
 const type=form.elements.type.value;
 const experiences={
  Residential:{key:'home',title:'Homes for sale',budget:'Price'},
  'Residential Lease':{key:'rental',title:'Homes for rent',budget:'Rent'},
  'Residential Income':{key:'investment',title:'Investment properties',budget:'Price'},
  'Commercial Sale':{key:'commercial',title:'Commercial properties for sale',budget:'Price'},
  'Commercial Lease':{key:'commercial',title:'Commercial spaces for lease',budget:'Quoted price'},
  Land:{key:'land',title:'Land for sale',budget:'Price'}
 };
 const experience=experiences[type]||{key:'home',title:'Properties',budget:'Price'};
 document.body.dataset.experience=experience.key;$('#search-title').textContent=experience.title+(form.elements.borough.value==='NYS'?' in New York State':' in NYC');$('#matches-heading').textContent=experience.title;
 $('#minimum-price-label').textContent='Minimum '+experience.budget.toLowerCase();$('#maximum-price-label').textContent='Maximum '+experience.budget.toLowerCase();
 const bedrooms=!['Commercial Sale','Commercial Lease','Land'].includes(type);$('#bedroom-filter').hidden=!bedrooms;form.elements.beds.disabled=!bedrooms;if(!bedrooms)form.elements.beds.value='';
 form.dataset.experience=experience.key;
}

function renderShowcase(data) {
 const cards=data.showcase.map(l=>{
  const node=el('article','','showcase-card'),photo=link('',listingHref(l),'showcase-photo');
  photo.setAttribute('aria-label',`Explore ${address(l)}`);
  photo.append(img(l.media[l.featuredPhoto],`Listing photo for ${address(l)}`,true),el('span',priceText(l),'showcase-price'));
  const body=el('div','','showcase-body');body.append(link(address(l),listingHref(l)),compactAttribution(l));node.append(photo,body);return node;
 });
 if(!cards.length) {const empty=el('div','','showcase-empty');empty.append(el('strong',data.total?'Your next place starts here.':'Let’s open up the possibilities.'),el('p',data.total?'No photos have been imported for these matches yet. Your results below still match your choices.':'Try another borough or widen your filters to explore more properties.'));cards.push(empty);}
 $('#showcase').replaceChildren(...cards);
 $('#showcase-note').textContent=data.showcase.length?'Listing photos from your current results.':'Photo highlights appear when matching listings have imported photos.';
 $('#mix-photos').disabled=!data.showcase.length;
}
function syncFilters() {
 syncExperience();
 discovery?.sync();
 for(const b of document.querySelectorAll('[data-location]')) b.setAttribute('aria-pressed',String(b.dataset.location===form.elements.borough.value));
 for(const b of document.querySelectorAll('[data-type]')) b.setAttribute('aria-pressed',String(b.dataset.type===form.elements.type.value));
 for(const b of document.querySelectorAll('[data-filter]')) b.setAttribute('aria-pressed',String(form.elements[b.dataset.filter].value==='1'));
 const chips=[];
 for(const [key,title]of [['borough','Area'],['q','Place'],['type','Type'],['status','Status'],['minPrice','From'],['maxPrice','To'],['beds','Bedrooms'],['source','Source'],['baths','Bathrooms'],['subtype','Style'],['minArea','Minimum sq ft'],['minBuildingArea','Minimum building sq ft'],['minLot','Minimum lot sq ft'],['minUnits','Minimum units'],['maxTax','Annual taxes up to'],['maxFee','Monthly fee up to'],['availableBy','Available by'],['parking','Parking']]) {
  const control=form.elements[key],value=control.value;if(!value||(key==='borough'&&value==='NYC')||key==='type'||(key==='status'&&value==='Active'))continue;
  const text=key==='minPrice'||key==='maxPrice'?money(Number(value)):control.tagName==='SELECT'?control.selectedOptions[0]?.textContent:value;
  const chip=action(`${title}: ${String(text).slice(0,80)} ×`,()=>{control.value=key==='borough'?'NYC':'';scheduleSearch(0);});
  chip.setAttribute('aria-label',`Remove ${title.toLowerCase()} filter`);chips.push(chip);
 }
 for(const [key,title]of [['photosOnly','With photos'],['recent','Last 7 days'],['belowOriginal','Below original price'],['savedOnly','Saved properties']])if(form.elements[key].value==='1'){const chip=action(title+' ×',()=>{form.elements[key].value='';scheduleSearch(0);});chip.setAttribute('aria-label',`Remove ${title.toLowerCase()} filter`);chips.push(chip);}
 chips.push(...(discovery?.chips()||[]));
 if(chips.length)chips.push(action('Clear filters',()=>{resetSearchForm();scheduleSearch(0);}));
 $('#active-filters').hidden=!chips.length;$('#active-filters').replaceChildren(...chips);updateSavedButtons();
}
function queryParams() {
 const params=new URLSearchParams();for(const [k,v]of new FormData(form))if(v||['type','status'].includes(k))params.set(k,String(v).slice(0,['places','areas'].includes(k)?600:200));
 params.set('limit',$('#page-size').value);params.set('sort',$('#sort').value);params.set('offset',String(offset));
 params.set('density',$('#density').value);params.set('view',$('#view').value);params.set('textSize',$('#text-size').value);
 if($('#view').value==='focus')params.set('focus',String(focusIndex));discovery?.params(params);bottomDock?.params(params);return params;
}
function updateViewURL() {
 const params=queryParams();history.replaceState(null,'','?'+params);$('#open-full-search').href=document.body.dataset.publicOrigin+'/?'+params;
 for(const a of document.querySelectorAll('#results a,#showcase a')){const url=new URL(a.href);a.href=url.origin+url.pathname+location.search;}
}
function renderResults(moveFocus=false) {
 if(!pageData?.total)return;
 focusIndex=Math.min(focusIndex,Math.max(0,pageData.listings.length-1));
 const focused=$('#view').value==='focus';
 const listings=focused?[pageData.listings[focusIndex]]:pageData.listings;
 $('#summary').textContent=`${number(pageData.total)} ${production?'':'sample '}${pageData.total===1?'property':'properties'} · ${focused?'Property '+(pageData.offset+focusIndex+1):(pageData.offset+1)+'–'+(pageData.offset+pageData.listings.length)}${pageData.checkpoints.some(c=>!c.complete)?' · Partial import':pageData.capped?' · First 2,500 matches; narrow your filters':''}`;
 $('#results').replaceChildren(...listings.map(card));
 $('#focus-navigation').hidden=!focused;
 $('#focus-position').textContent=focused?`Property ${pageData.offset+focusIndex+1} of ${number(pageData.total)} · ${address(listings[0])}`:'';
 $('#focus-previous').disabled=pageData.offset+focusIndex===0;
 $('#focus-next').disabled=pageData.offset+focusIndex+1>=pageData.total;
 updateSavedButtons();
 if(moveFocus){const heading=$('#results .card-title');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'nearest',behavior:'instant'});}
}
function stepProperty(direction) {
 if(!pageData||$('#results').getAttribute('aria-busy')==='true')return;
 const target=focusIndex+direction;
 if(target>=0&&target<pageData.listings.length){focusIndex=target;updateViewURL();renderResults(true);return;}
 const nextOffset=pageData.offset+direction*pageData.limit;
 if(nextOffset<0||nextOffset>=pageData.total)return;
 offset=nextOffset;focusIndex=direction>0?0:pageData.limit-1;search(true);
}
$('#focus-previous').addEventListener('click',()=>stepProperty(-1));
$('#focus-next').addEventListener('click',()=>stepProperty(1));
function resetSearchForm() {
 form.reset();
 for(const control of form.querySelectorAll('input[type=hidden]'))control.value='';
}
function setBusy() {
 discovery?.invalidate();
 controller?.abort();requestVersion++;$('#summary').textContent='Updating your matches…';
 $('#results').setAttribute('aria-busy','true');$('#results').inert=true;
 $('#previous').disabled=$('#next').disabled=$('#mix-photos').disabled=true;
 $('#focus-previous').disabled=$('#focus-next').disabled=true;
 for(const button of $('#page-numbers').querySelectorAll('button'))button.disabled=true;
 const loading=el('div','','showcase-empty');loading.append(el('strong','Finding your possibilities…'),el('p','Matching listings and real photos are updating.'));$('#showcase').replaceChildren(loading);
 $('#match-insights').replaceChildren();$('#showcase-note').textContent='Updating photos to match your filters…';
}
function scheduleSearch(delay=250) {clearTimeout(debounce);offset=0;focusIndex=0;syncFilters();setBusy();debounce=setTimeout(search,delay);}
function renderPages(data) {
 const count=Math.ceil(data.total/data.limit),current=Math.floor(data.offset/data.limit)+1,items=[];
 const pages=new Set([1,count,current-2,current-1,current,current+1,current+2]);let last=0;
 for(const page of [...pages].filter(n=>n>=1&&n<=count).sort((a,b)=>a-b)) {
  if(last&&page>last+1)items.push(el('span','…'));
  const button=action(String(page),()=>{offset=(page-1)*data.limit;focusIndex=0;search(true);});button.setAttribute('aria-label',`Page ${page}`);
  if(page===current)button.setAttribute('aria-current','page');items.push(button);last=page;
 }
 $('#page-numbers').replaceChildren(...items);$('#previous').disabled=data.offset===0;$('#next').disabled=data.offset+data.limit>=data.total;
 $('#page-summary').textContent=data.total?`Page ${current} of ${count} · ${data.limit} properties per page`:'No pages to show';
}
async function search(pageNavigation=false) {
 clearTimeout(debounce);syncFilters();setBusy();const version=requestVersion;
 const reversedPrice=form.elements.minPrice.value&&form.elements.maxPrice.value&&Number(form.elements.minPrice.value)>Number(form.elements.maxPrice.value);
 for(const name of ['minPrice','maxPrice','beds'])form.elements[name].setAttribute('aria-invalid',String(!form.elements[name].validity.valid||(name!=='beds'&&!!reversedPrice)));
 $('#filter-error').hidden=true;$('#filter-error').textContent='';
 if(!form.checkValidity()||reversedPrice) {
  $('.price-filter').open=true;
  const message=reversedPrice?'Minimum price must not exceed maximum price.':'Use nonnegative prices and a whole number of bedrooms.';
  $('#filter-error').textContent=message;$('#filter-error').hidden=false;$('#summary').textContent='Check the highlighted filters.';pageData=undefined;$('#focus-navigation').hidden=true;
  $('#results').replaceChildren();$('#results').inert=false;$('#results').setAttribute('aria-busy','false');const help=el('div','','showcase-empty');help.append(el('strong','A quick check before we search.'),el('p','Use a valid price range and bedroom count.'));$('#showcase').replaceChildren(help);$('#showcase-note').textContent='Your filters will update as soon as the range is valid.';$('#page-numbers').replaceChildren();$('#page-summary').textContent='';return;
 }
 controller=new AbortController();const signal=controller.signal,params=queryParams();
 history.replaceState(null,'','?'+params);$('#open-full-search').href=document.body.dataset.publicOrigin+'/?'+params;const apiParams=new URLSearchParams(params);
 if(form.elements.savedOnly.value==='1')apiParams.set('saved',preferences.saved.join(','));
 try {
  const response=await fetch('/api/search?'+apiParams,{signal});if(!response.ok)throw Error();const data=await response.json();
  if(signal.aborted||version!==requestVersion)return;offset=data.offset;params.set('offset',offset);params.set('density',$('#density').value);params.set('view',$('#view').value);history.replaceState(null,'','?'+params);$('#open-full-search').href=document.body.dataset.publicOrigin+'/?'+params;
  pageData=data;renderResults();if(!data.total){$('#focus-navigation').hidden=true;$('#results').replaceChildren();}
  if(!data.total){const empty=el('div','','empty-results');empty.append(el('h3',form.elements.savedOnly.value==='1'?'Your saved homes will appear here.':'A little more room to explore.'),el('p',form.elements.savedOnly.value==='1'?'Save a home with the heart button. Saved homes also need to match your other filters.':(production?'No properties':'No demo properties')+' match all these choices. Broaden an area, price range, or property type.'),action('Reset filters',()=>{resetSearchForm();scheduleSearch(0);}));if(form.elements.photosOnly.value==='1')empty.append(action('Include listings without imported photos',()=>{form.elements.photosOnly.value='';scheduleSearch(0);},'secondary'));$('#results').append(empty);}
  if(!data.total)$('#summary').textContent=production?'No matching properties':'No matching demo properties';
  renderShowcase(data);renderPages(data);updateSavedButtons();updateViewURL();
  discovery?.refresh(apiParams);discovery?.restorePosition();
  if(pageNavigation===true){$('#matches-heading').focus({preventScroll:true});$('#matches-heading').scrollIntoView({block:'start',behavior:'instant'});}
  const insights=[['withPhotos','with imported photos'],['recentlyListed','listed in the last 7 days'],['belowOriginal','below original asking price']];
  $('#match-insights').replaceChildren(...insights.filter(([key])=>data.insights[key]>0).map(([key,title])=>{const item=el('div','','insight');item.append(el('strong',number(data.insights[key])),document.createTextNode(title));return item;}));
  $('#freshness').textContent=(production?'Last MLS feed check: ':'Source import checkpoint: ')+data.checkpoints.map(c=>`${sourceName(c.source)} · ${stamp(c.updated_at)}`).join('; ');
 } catch(error) {
  if(error.name!=='AbortError'&&version===requestVersion){pageData=undefined;$('#focus-navigation').hidden=true;$('#summary').textContent="We couldn't load your matches. Try again.";$('#showcase').replaceChildren();$('#results').replaceChildren(action('Try again',()=>search()));$('#page-numbers').replaceChildren();$('#page-summary').textContent='';}
 } finally { if(version===requestVersion){$('#results').inert=false;$('#results').setAttribute('aria-busy','false');} }
}
form.addEventListener('submit',event=>{event.preventDefault();offset=0;$('.more-filters').open=false;search();});
form.addEventListener('input',event=>{if(event.target.tagName==='INPUT')scheduleSearch();});
form.addEventListener('change',event=>{if(event.target.tagName==='SELECT')scheduleSearch(0);});
$('#previous').addEventListener('click',()=>{offset=Math.max(0,offset-Number($('#page-size').value));focusIndex=0;search(true);});
$('#next').addEventListener('click',()=>{offset+=Number($('#page-size').value);focusIndex=0;search(true);});
$('#mix-photos').addEventListener('click',search);
for(const b of document.querySelectorAll('[data-location]'))b.addEventListener('click',()=>{form.elements.borough.value=b.dataset.location;scheduleSearch(0);});
for(const b of document.querySelectorAll('[data-type]'))b.addEventListener('click',()=>{form.elements.type.value=b.dataset.type;scheduleSearch(0);});
for(const b of document.querySelectorAll('[data-filter]'))b.addEventListener('click',()=>{const control=form.elements[b.dataset.filter];control.value=control.value==='1'?'':'1';scheduleSearch(0);});
// Native disclosures retain keyboard behavior; dismiss only menus outside the interaction.
document.addEventListener('pointerdown',event=>{for(const menu of document.querySelectorAll('[data-popover][open]'))if(!menu.contains(event.target))menu.open=false;});
document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;for(const menu of document.querySelectorAll('[data-popover][open]'))if(menu.contains(document.activeElement)){menu.open=false;menu.querySelector('summary').focus();event.preventDefault();break;}});
function applyView() {
 $('#results').dataset.density=$('#density').value;$('#results').dataset.view=$('#view').value;$('#density').disabled=$('#view').value!=='grid';
 $('#search-page').dataset.textSize=$('#text-size').value;
 $('#view-help').textContent=({grid:'Scan several properties together. Choose how many cards fit your screen in View settings.',list:'See each property in a wide row, with its supplied facts and listing contact.',focus:'Explore one property at a time. Use Previous property and Next property to move through all your matches.'})[$('#view').value];
 preferences.density=$('#density').value;preferences.view=$('#view').value;preferences.textSize=$('#text-size').value;
}
for(const id of ['density','view','text-size'])$('#'+id).addEventListener('change',()=>{applyView();persist();if(id==='view'&&$('#results').getAttribute('aria-busy')!=='true'){renderResults();if(pageData)renderPages(pageData);}updateViewURL();});
for(const [id,key]of [['page-size','limit'],['sort','sort']])$('#'+id).addEventListener('change',()=>{preferences[key]=$('#'+id).value;persist();scheduleSearch(0);});
function populateSavedSearches() {
 const placeholder=el('option','Choose a search');placeholder.value='';
 $('#saved-searches').replaceChildren(placeholder,...preferences.searches.map((item,i)=>{const option=el('option',item.label);option.value=String(i);return option;}));$('#remove-search').disabled=true;
}
$('#save-search').addEventListener('click',()=>{
 const params=queryParams();for(const key of ['offset','density','view','limit','sort','textSize','focus'])params.delete(key);params.sort();const query=params.toString();
 if(preferences.searches.some(item=>item.query===query)){persist('This search is already saved in this browser.');return;}
 if(preferences.searches.length>=10){$('#preference-status').textContent='You have 10 saved searches. Remove one to save another.';return;}
 const label=[form.elements.q.value||form.elements.borough.value,form.elements.type.selectedOptions[0].textContent,form.elements.maxPrice.value?'up to '+money(Number(form.elements.maxPrice.value)):'',form.elements.photosOnly.value?'with photos':'',form.elements.belowOriginal.value?'below original price':'',form.elements.recent.value?'last 7 days':''].filter(Boolean).join(' · ').slice(0,160);
 preferences.searches.push({query,label});populateSavedSearches();$('.view-preferences').open=true;$('#saved-search-panel').open=true;persist('Search saved in this browser. Reopen it whenever you like.');
});
$('#saved-searches').addEventListener('change',()=>{
 const value=$('#saved-searches').value;$('#remove-search').disabled=value==='';if(value==='')return;
 const item=preferences.searches[Number(value)];if(!item)return;resetSearchForm();const params=new URLSearchParams(item.query);
 for(const control of form.elements)if(control.name)control.value=params.get(control.name)||'';
 discovery?.restore(params);
 if(!form.elements.borough.value)form.elements.borough.value='NYC';scheduleSearch(0);
});
$('#remove-search').addEventListener('click',()=>{const value=$('#saved-searches').value;if(value==='')return;preferences.searches.splice(Number(value),1);populateSavedSearches();persist('Saved search removed.');});
for(const [id,key]of [['density','density'],['view','view'],['text-size','textSize'],['page-size','limit'],['sort','sort']]) {
 const control=$('#'+id),urlValue=new URLSearchParams(location.search).get(key);
 control.value=[...control.options].some(option=>option.value===urlValue)?urlValue:preferences[key];
}
applyView();populateSavedSearches();updateSavedButtons();

let activeListing,stopListingRefresh,contactKind='tour',contactTrigger,contactSaved=false,contactVersion=0;
function openContact(kind,trigger) {
 contactVersion++;contactSaved=false;contactKind=kind;contactTrigger=trigger;
 $('#contact-title').textContent=kind==='tour'?'Request a showing':'Ask a question';$('#contact-property').textContent=address(activeListing);
 $('#contact-recipient').textContent=`Listing contact: ${activeListing.ListAgentFullName || 'Agent name not provided'} · ${activeListing.ListOfficeName || 'Brokerage not provided'}. ${production?'This opens an email draft to the published listing contact.':'This preview does not deliver requests to this contact.'}`;
 $('#message-title').textContent=kind==='tour'?'Anything you would like to ask? (optional)':'Your question';$('#contact-submit').textContent=production?'Open email draft':kind==='tour'?'Save demo showing request':'Save demo question';
 $('#tour-fields').hidden=$('#tour-help').hidden=kind!=='tour';for(const name of ['date','time'])$('#contact-form').elements[name].required=kind==='tour';$('#contact-form').elements.message.required=kind==='message';
 $('#contact-status').textContent='';$('#contact-status').className='';$('#contact-submit').disabled=false;$('#contact-form').inert=false;$('#contact-form').setAttribute('aria-busy','false');
 $('#contact-form').elements.date.min=nyDate();$('#contact-form').elements.date.max=nyDate(new Date(Date.now()+89*86400000));$('#contact').showModal();
}
$('#contact-close').addEventListener('click',()=>$('#contact').close());$('#contact').addEventListener('close',()=>contactTrigger?.focus());
for(let h=9;h<=18;h++)for(const m of ['00','30']){const option=el('option',`${h>12?h-12:h}:${m} ${h>=12?'PM':'AM'} ET`);option.value=`${String(h).padStart(2,'0')}:${m}`;$('#contact-form').elements.time.append(option);}
$('#contact-form').addEventListener('submit',async e=>{
 e.preventDefault();const version=contactVersion,data={...Object.fromEntries(new FormData(e.target)),kind:contactKind,source:activeListing.source,id:activeListing.id};
 if(production) {
  const email=publicEmail(activeListing);
  if(!email){$('#contact-status').textContent='No public email was supplied. Use the listing brokerage phone shown on the property page.';return;}
  const subject=`${contactKind==='tour'?'Showing request':'Question'} · MLS #${activeListing.ListingId || activeListing.id}`;
  const body=[`Hello,`,`I am interested in ${address(activeListing)}.`,contactKind==='tour'?`Preferred showing: ${data.date} at ${data.time} New York time (ET). Please confirm availability.`:'',data.message,`Name: ${data.name}`,`Email: ${data.email}`,data.phone?`Phone: ${data.phone}`:'',`Listing: ${document.body.dataset.publicOrigin}/listing/${activeListing.source}/${activeListing.id}`].filter(Boolean).join('\n\n');
  location.href=`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  $('#contact-status').textContent='Email draft opened. Send it in your email app to contact the listing brokerage. No appointment has been confirmed.';return;
 }
 $('#contact-submit').disabled=true;$('#contact-form').inert=true;$('#contact-form').setAttribute('aria-busy','true');$('#contact-status').textContent='Saving your demo request…';
 try{const response=await fetch('/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),result=await response.json();if(version!==contactVersion)return;if(!response.ok)throw Error(result.error);contactSaved=true;$('#contact-status').className='success';$('#contact-status').textContent=result.message;}
 catch(error){if(version===contactVersion){$('#contact-status').className='error';$('#contact-status').textContent=error.message||"Your request wasn't saved. Try again.";}}
 finally{if(version===contactVersion){$('#contact-form').inert=false;$('#contact-form').setAttribute('aria-busy','false');$('#contact-submit').disabled=contactSaved;if($('#contact').open)$('#contact-status').focus();}}
});
$('#contact-form').addEventListener('input',()=>{if(contactSaved){contactSaved=false;$('#contact-submit').disabled=false;$('#contact-status').textContent='Your previous demo request was saved. You can save these changes as a new request.';}});

function calculator(l,profile) {
 const node=section('Explore your monthly costs','costs'),box=el('div','','calculator');node.append(box);box.append(el('p','Estimate based on your inputs. The 6.5% starting rate is an illustration, not a current rate quote.','muted'));const inputs=el('form');inputs.addEventListener('submit',e=>e.preventDefault());
 const building=monthlyFee(l.AssociationFee,l.AssociationFeeFrequency),extra=monthlyFee(l.AssociationFee2,l.AssociationFee2Frequency),tax=typeof l.TaxAnnualAmount==='number'?l.TaxAnnualAmount/12:null;
 const specs=[['price','Purchase price',l.ListPrice,'1','10000000000'],['down','Down payment (%)',20,'0','100'],['rate','Annual interest rate (%)',6.5,'0','100'],['years','Loan term (years)',30,'1','50'],['tax','Monthly property taxes',profile.key==='coop'?'':tax,'0',''],['building','Monthly building charge',building,'0',''],['extra','Additional monthly association charge',extra,'0',''],['insurance','Monthly home insurance',null,'0',''],['pmi','Monthly mortgage insurance (PMI)',null,'0',''],['assessment','Monthly assessment',null,'0','']];
 for(const[name,title,val,min,max]of specs){const lab=el('label',title),input=el('input');input.type='number';input.name=name;input.min=min;if(max)input.max=max;input.step=name==='years'?'1':'any';input.value=typeof val==='number' && !['price','down','rate','years'].includes(name)?Math.round(val*100)/100:val??'';input.placeholder='Not provided';if(['price','down','rate','years'].includes(name))input.required=true;lab.append(input);inputs.append(lab);}box.append(inputs);const total=el('p','','estimate-total'),help=el('p','','muted'),rows=el('table','','estimate-table'),note=el('p','','muted');total.setAttribute('aria-live','polite');box.append(total,help,rows,note);
 function update(){try{if(!inputs.checkValidity())throw Error('Enter valid loan assumptions.');const n=key=>inputs.elements[key].value===''?null:Number(inputs.elements[key].value);const m=mortgagePayment(n('price'),n('down'),n('rate'),n('years'));let included=m.payment,missing=[];rows.replaceChildren();const add=(name,value)=>{const tr=el('tr');tr.append(el('td',name),el('td',value));rows.append(tr);};add('Principal & interest',money(m.payment)+'/month');for(const[key,title]of specs.slice(4)){const value=n(key);if(value==null)missing.push(title);else included+=value;add(title,value==null?'Not provided — excluded':money(value)+'/month');}total.textContent=money(included)+'/month';help.textContent=missing.length?'Partial estimate · '+missing.length+' cost categories not provided':'Estimate for entered cost categories';note.textContent=`Loan amount: ${money(m.principal)} · Down payment: ${money(m.downPayment)} · Total loan interest: ${money(m.interest)}. ${profile.key==='coop'?'Co-op maintenance may include property taxes; verify the breakdown before adding separate taxes. ':''}Excludes closing costs, utilities, repairs, reserves, and costs not entered. Building rules, financing eligibility, and actual lender terms vary. Interest rate is not APR. Inputs are calculated on this device.`;}
 catch(error){total.textContent='Check your inputs';help.textContent=error.message;rows.replaceChildren();note.textContent='';}}
 inputs.addEventListener('input',update);update();return node;
}
function allDetails(l) {
 const node=section('All listing details','all-details');node.classList.add('all-facts');
 node.append(el('p',production?'Public listing details supplied by the MLS.':'All supplied public fields in this sample import. Private MLS fields are excluded.','muted'));
 const searchLabel=el('label','Find a detail'),input=el('input');input.type='search';input.placeholder='Try taxes, heating, parking…';searchLabel.append(input);
 const count=el('p','','detail-count');count.setAttribute('role','status');count.setAttribute('aria-atomic','true');input.setAttribute('aria-describedby','detail-count');count.id='detail-count';node.append(searchLabel,count);
 const groups={};for(const key of Object.keys(l)){
  if(['id','source','addressWithheld','mapLocation','media','obtainedAt','PublicRemarks'].includes(key)||!provided(l[key]))continue;
  const group=/^ListAgent|^ListOffice|Attribution|ListingId|Status|Timestamp|Market|Close/.test(key)?'Listing & source':/^(AssociationFee|Tax|GrossIncome|NetOperatingIncome|OperatingExpense|SecurityDeposit|RentIncludes|TenantPays)/.test(key)?'Costs & finances':/Street|Address|City|County|StateOrProvince|PostalCode|Latitude|Longitude|School/.test(key)?'Location & schools':/Lease|Pets|Amenities|Ownership|Availability/.test(key)?'Building & rental terms':'Property & features';
  (groups[group]??=[]).push(key);
 }
 const views=Object.entries(groups).map(([title,fields])=>{const details=el('details','','field-group');details.open=preferences.detailsMode==='expanded';details.append(el('summary',`${title} · ${fields.length} ${fields.length===1?'field':'fields'}`),grid(l,fields,true));node.append(details);return{details,title,fields};});
 function filter(){const q=input.value.trim().toLowerCase();let found=0;for(const{details,title,fields}of views){const matches=fields.filter(f=>`${f} ${label(f)} ${fieldText(l,f)}`.toLowerCase().includes(q));found+=matches.length;details.hidden=matches.length===0;details.replaceChildren(el('summary',`${title} · ${matches.length} ${matches.length===1?'field':'fields'}`),grid(l,matches,true));details.open=Boolean(q)||preferences.detailsMode==='expanded';}count.textContent=q?`${found} matching ${found===1?'field':'fields'}.`:`${found} imported fields. Choose a group to explore.`;}
 input.addEventListener('input',filter);filter();return node;
}
function contactCard(l) {
 const node=el('aside','','contact-card');node.id='listing-contact';node.setAttribute('aria-label','Listing contact and next steps');
 const person=el('div','','contact-person'),initials=(l.ListAgentFullName||'').trim().split(/\s+/).filter(Boolean).map(part=>part[0]).slice(0,2).join('');
 const avatar=el('span',initials||'—','contact-avatar');avatar.setAttribute('aria-hidden','true');
 const identity=el('div');identity.append(el('p','Listing agent','contact-label'),el('h2',l.ListAgentFullName||'Listing brokerage'));
 person.append(avatar,identity);node.append(person,el('p',l.ListOfficeName||'Brokerage not supplied','contact-company'));
 const source=el('div','','attribution');source.append(el('p',`MLS #${l.ListingId||'Not provided'} · ${sourceName(l.source)}`),el('p',`Status: ${l.StandardStatus||'Not provided'}`));
 if(l.AttributionContact)source.append(el('p',`Listing contact: ${l.AttributionContact}`));node.append(source);
 const actions=el('div','','contact-actions');
 if((!production || publicEmail(l)) && ['Active','Coming Soon','Active Under Contract'].includes(l.StandardStatus)){const button=action('Request a showing',()=>openContact('tour',button));actions.append(button);}
 const question=action(production?'Email listing contact':'Message listing agent',()=>openContact('message',question),'secondary');if(!production || publicEmail(l))actions.append(question);node.append(actions);
 const direct=el('div','','contact-direct'),email=publicEmail(l);
 if(email)direct.append(link('Email',`mailto:${email}?subject=${encodeURIComponent('Question about MLS #'+l.ListingId)}&body=${encodeURIComponent('Hello,\nI would like to know more about '+address(l)+'.\n\n')}`));
 if(l.ListOfficePhone){const phone=String(l.ListOfficePhone).replace(/[^0-9+]/g,'');if(/^[+]?\d{7,15}$/.test(phone))direct.append(link('Call brokerage',`tel:${phone}`));}
 if(direct.childNodes.length)node.append(direct);
 if(!production)node.append(el('p','Demo requests stay here and are not delivered.','local-notice'));else if(!direct.childNodes.length)node.append(el('p','A public email or phone was not provided by the listing source.','local-notice'));
 const role=el('details','','contact-role');role.append(el('summary','About this contact'),el('p','The agent and brokerage are supplied by the MLS. Confirm whom they represent before sharing confidential information. An inquiry does not establish buyer representation.','muted'));node.append(role);return node;
}

function listingDescription(l) {
 const node=el('div'),text=l.PublicRemarks || (l.addressWithheld?'Description withheld to protect the source’s address restriction.':'A listing description was not provided in this import.');
 node.append(el('p','From the listing brokerage','muted'));
 const description=el('p','','description');description.id='listing-description';
 if(text.length<=650){description.textContent=text;node.append(description);return node;}
 const paragraphEnd=text.lastIndexOf('\n\n',600),wordEnd=text.lastIndexOf(' ',600),end=paragraphEnd>200?paragraphEnd:wordEnd>0?wordEnd:600,rest=el('span',text.slice(end),'description-rest');rest.hidden=true;
 description.append(document.createTextNode(text.slice(0,end)),rest);const toggle=action('Read full description',()=>{rest.hidden=!rest.hidden;toggle.setAttribute('aria-expanded',String(!rest.hidden));toggle.textContent=rest.hidden?'Read full description':'Show shorter description';},'secondary description-toggle');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls',description.id);node.append(description,toggle);return node;
}
function readingSection(node) {
 const details=el('details','','reading-section'),heading=node.firstElementChild,summary=el('summary'),body=el('div','','reading-body');summary.append(heading);body.append(...node.childNodes);details.append(summary,body);node.append(details);return node;
}
function listingReadingControls(root) {
 const toolbar=el('details','','listing-reading'),controls=el('div','','reading-options'),labelMode=el('label','Details'),mode=el('select'),labelSize=el('label','Text size'),size=el('select');
 mode.id='listing-reading-mode';mode.append(new Option('Key facts first','overview'),new Option('Every section open','expanded'));mode.value=preferences.detailsMode || 'overview';labelMode.append(mode);
 size.append(new Option('Standard','standard'),new Option('Larger','large'));size.value=$('#text-size').value;labelSize.append(size);
 const help=el('p','Key facts stay visible. Open the sections you want to explore.','sr-only');help.id='listing-reading-help';mode.setAttribute('aria-describedby',help.id);controls.append(labelMode,labelSize,help);toolbar.append(el('summary','Display options'),controls);root.append(toolbar);
 function apply(){const expanded=mode.value==='expanded';$('#listing-page').dataset.textSize=size.value;for(const details of root.querySelectorAll('.reading-section,.field-group'))details.open=expanded;const rest=root.querySelector('.description-rest'),toggle=root.querySelector('.description-toggle');if(rest){rest.hidden=!expanded;toggle.setAttribute('aria-expanded',String(expanded));toggle.textContent=expanded?'Show shorter description':'Read full description';}help.textContent=expanded?'Every section is open. You can still close individual sections.':'Key facts stay visible. Open the sections you want to explore.';}
 mode.addEventListener('change',()=>{preferences.detailsMode=mode.value;persist();apply();});size.addEventListener('change',()=>{preferences.textSize=size.value;$('#text-size').value=size.value;persist();$('#listing-page').dataset.textSize=size.value;const url=new URL(location.href);url.searchParams.set('textSize',size.value);history.replaceState(null,'',url);$('#back-results').href='/'+url.search;});
 return apply;
}
function listingLocation(l) {
 const mapURL=publicMapURL(l);if(!mapURL)return null;
 const node=section('Location','location'),mapLink=link('Open Google Maps ↗',mapURL,'button secondary');
 mapLink.target='_blank';mapLink.rel='noopener noreferrer';
 node.append(el('p',address(l)),el('p',locationText(l),'muted'),mapLink,el('p','Location supplied by the listing source. Confirm the property location before visiting.','muted'));return node;
}
function listingPhotos(l) {
 if(l.media.length){
  const hero=el('div','',`hero${l.media.length===1?' one-photo':''}`);
  l.media.slice(0,3).forEach((photo,i)=>{const button=action('',()=>openGallery(l,button,i));button.setAttribute('aria-label',`Open listing photo ${i+1}`);button.append(img(photo,`Listing photo ${i+1} for ${address(l)}`,i===0,'display'));hero.append(button);});
  const all=action(`All ${l.media.length} photos`,()=>openGallery(l,all),'all-photos');hero.append(all);hero.dataset.listingPhotos='';return hero;
 }else {const empty=el('div',production?'Photos are being prepared. Listing details are available below.':'Photos not available in this sample.','hero-empty');empty.dataset.listingPhotos='';return empty;}
}
function watchListing(l) {
 return followListing(l,{
  onStatus:status=>{if(galleryListing===l&&$('#gallery').open)$('#gallery-count').textContent=`Photo ${galleryIndex+1} of ${galleryPhotos.length}`+(['queued','waiting'].includes(status?.state)?' · More photos requested':'');if(activeListing===l){const node=$('#listing-photo-progress');if(node)node.textContent=enrichmentMessage(status);}},
  onUpdate:next=>{
   const changed=JSON.stringify(l.media)!==JSON.stringify(next.media);
   const factsChanged=l.ModificationTimestamp!==next.ModificationTimestamp||l.addressWithheld!==next.addressWithheld;
   Object.assign(l,next);
   if(factsChanged&&activeListing===l)renderListing(l);
   if(changed&&activeListing===l){const current=$('[data-listing-photos]');if(current&&!current.contains(document.activeElement))current.replaceWith(listingPhotos(l));}
   if(changed&&galleryListing===l&&$('#gallery').open){
    const current=galleryPhotos[galleryIndex]?.url;galleryPhotos=l.media;
    $('#gallery-thumbs').replaceChildren(...l.media.map((photo,i)=>{const button=action('',()=>showPhoto(i));button.setAttribute('aria-label',`Show photo ${i+1}`);button.append(img(photo,'',false,'thumb'));return button;}));
    const index=l.media.findIndex(photo=>photo.url===current);if(l.media.length)void showPhoto(Math.max(0,index));else{$('#gallery-image').removeAttribute('src');$('#gallery').close();}
   }
  },
  onUnavailable:()=>{if(galleryListing===l&&$('#gallery').open)$('#gallery').close();if(activeListing===l){$('#listing-content').replaceChildren(el('p','This listing is no longer available. Return to the results to find another property.','error-panel'));}}
 });
}
function renderListing(l) {
 activeListing=l;const profile=consumerProfile(l),target=$('#listing-content'),root=el('div');root.id='listing-content';
 document.body.dataset.experience=profile.key==='rental'?'rental':profile.key.startsWith('commercial')?'commercial':profile.key==='investment'?'investment':profile.key==='land'?'land':'home';root.className=`profile-${profile.key}`;
 const heading=el('div','','listing-heading'),left=el('div'),right=el('div');
 left.append(el('span',`${statusText(l)} · ${profile.label}`,'pill'),el('h1',address(l)),el('p',locationText(l),'muted'));
 right.append(el('p',priceText(l),'price'));
 if(l.PropertyType?.includes('Lease'))right.append(el('p',provided(l.LeaseAmountFrequency)?`Price period: ${valueText(l.LeaseAmountFrequency)}`:'Quoted price · period not supplied','price-note'));
 heading.append(left,right);root.append(heading);
 const sharing=el('div','','listing-sharing'),shareStatus=el('span','','share-status'),publicLink=document.body.dataset.publicOrigin+location.pathname;shareStatus.setAttribute('role','status');
 const separate=link('Open separately ↗',location.href,'button secondary');separate.target='_blank';separate.rel='noopener';
 sharing.append(action('Share listing',async()=>{try{await navigator.clipboard.writeText(publicLink);shareStatus.textContent='Link copied.';}catch{shareStatus.replaceChildren(el('span','Copy this link: '));const field=el('input');field.value=publicLink;field.readOnly=true;field.setAttribute('aria-label','Listing share link');shareStatus.append(field);field.focus();field.select();}},'secondary'),link('Contact','#listing-contact','button secondary'),separate,shareStatus);root.append(sharing);
 root.append(listingPhotos(l));if(production){const progress=el('p','','muted');progress.id='listing-photo-progress';progress.setAttribute('role','status');root.append(progress,action('Check for more photos',()=>{stopListingRefresh?.();stopListingRefresh=watchListing(l);},'secondary'));}
 const applyReading=listingReadingControls(root),layout=el('div','','property-layout'),main=el('div','','property-main'),strip=el('div','','fact-strip');
 const summaries=profile.key==='land'?[['LotSizeAcres','acres'],['LotSizeSquareFeet','lot sq ft'],['Zoning','zoning'],['WaterSource','water source']]:profile.key.startsWith('commercial')?[['BuildingAreaTotal',`area (${l.BuildingAreaUnits||'units not supplied'})`],['BusinessType','use'],['ParkingTotal','parking spaces'],['Zoning','zoning']]:profile.key==='investment'?[['NumberOfUnitsTotal','reported units'],['BedroomsTotal','bedrooms'],['YearBuilt','year built'],['LotSizeSquareFeet','lot sq ft']]:[['BedroomsTotal','bedrooms'],['BathroomsFull','full bathrooms'],areaFact(l),['YearBuilt','year built']];
 for(const[field,title]of summaries){if(!provided(l[field]))continue;const item=el('div');item.append(el('strong',fieldText(l,field)),el('span',title));strip.append(item);}if(strip.childNodes.length)main.append(strip);
 const locationSection=listingLocation(l),tabs=el('nav','','section-tabs');tabs.setAttribute('aria-label','Property sections');
 const sections=[['Overview','#overview'],['Features','#property-fit'],['Costs','#costs'],['All details','#all-details']];if(locationSection)sections.push(['Location','#location']);
 for(const[title,id]of sections){const jump=link(title,id);jump.addEventListener('click',event=>{event.preventDefault();const target=root.querySelector(id),details=target.querySelector('.reading-section');if(details)details.open=true;const heading=target.querySelector('h2');heading.tabIndex=-1;history.replaceState(null,'',id);target.scrollIntoView({block:'start'});heading.focus({preventScroll:true});});tabs.append(jump);}main.append(tabs);
 const overview=section('About this property','overview');overview.append(listingDescription(l));main.append(overview);
 const fit=section(profile.section,'property-fit'),panel=el('div','','profile-panel');panel.append(grid(l,profile.fields.filter(field=>provided(l[field]))));
 const cautions={coop:'Confirm maintenance, board approval, financing limits and sublet rules.',condo:'Confirm common charges, taxes, assessments and building rules.',rental:'Confirm lease dates, included utilities, fees, pets and application requirements.',investment:'Verify income periods, leases, expenses, occupancy and legal unit count.','commercial-lease':'Confirm permitted use, lease structure, build-out responsibilities and operating charges.','commercial-sale':'Confirm permitted use, condition, costs, existing leases and financing.',land:'Confirm zoning, utilities, access, survey and development approvals.',house:'Confirm condition, heating and cooling, taxes and inspection findings.'};
 panel.append(el('p',cautions[profile.key]+' Unreported details require confirmation.','muted'));fit.append(panel);main.append(readingSection(fit));
 if(l.PropertyType==='Residential'||l.PropertyType==='Residential Income')main.append(readingSection(calculator(l,profile)));
 else{const costs=section(profile.key==='rental'?'Rent & move-in costs':profile.key==='commercial-lease'?'Lease costs':profile.key==='commercial-sale'?'Ownership costs':'Land purchase costs','costs');costs.append(grid(l,profile.key==='rental'?['ListPrice','LeaseAmountFrequency','SecurityDeposit','RentIncludes','TenantPays']:profile.key==='commercial-lease'?['ListPrice','LeaseAmountFrequency','LeaseTerm','TenantPays','RentIncludes','SecurityDeposit']:['ListPrice','TaxAnnualAmount','AssociationFee','AssociationFeeFrequency']),el('p','Confirm charges and payment periods. Missing costs are not assumed to be zero.','muted'));main.append(readingSection(costs));}
 if(locationSection)main.append(readingSection(locationSection));main.append(readingSection(allDetails(l)));layout.append(main,contactCard(l));root.append(layout);target.replaceWith(root);applyReading();
 $('#freshness').textContent=`Last imported: ${stamp(l.obtainedAt)} · Source updated: ${stamp(l.ModificationTimestamp)}`;
}

discovery=initializeDiscovery({form,search:()=>scheduleSearch(0),renderCard:card});
bottomDock=initializeBottomDock();
const route=location.pathname.match(/^\/listing\/([^/]+)\/([^/]+)$/);
if(route){$('#search-page').hidden=true;$('#listing-page').hidden=false;$('#back-results').href='/'+location.search;try{const response=await fetch(`/api/listing/${route[1]}/${route[2]}`);if(!response.ok)throw Error();const data=await response.json();renderListing(data.listing);if(production){stopListingRefresh=watchListing(data.listing);window.addEventListener('pagehide',()=>stopListingRefresh?.(),{once:true});}}catch{$('#listing-content').replaceChildren();$('#listing-content').append(el('div','This listing is unavailable. Return to the results to find another property.','error-panel'));}}
else{const params=new URLSearchParams(location.search);for(const control of form.elements)if(control.name&&params.has(control.name))control.value=params.get(control.name);const restored=Number(params.get('offset')||0);offset=Number.isSafeInteger(restored)&&restored>=0?restored:0;search();}
