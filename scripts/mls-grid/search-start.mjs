import { BOROUGHS } from './confidence.mjs';
import { interpretSearch,searchURL,RECENT_SEARCH_KEY,cleanRecent,rememberSearch } from './search-intent.mjs';
const node=(tag,text='',className='')=>{const element=document.createElement(tag);element.textContent=text;if(className)element.className=className;return element;};
const $=selector=>document.querySelector(selector);
const kindLabel={borough:'Borough',area:'Neighborhood / postal town',address:'Address',zip:'ZIP code',mls:'MLS number'};
function composer({form,input,list,preview,getDefaults,onApply,merge=false}) {
 let selected=-1,items=[],areas=[],controller,timer,version=0;const removed=new Set();
 const feedback=node('p','','search-understanding-status');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');preview.after(feedback);
 function interpretation(){const parsed=interpretSearch(input.value,{...getDefaults(),areas});for(const key of removed){if(key==='borough')parsed.params.borough='NYC';else delete parsed.params[key];}parsed.chips=parsed.chips.filter(chip=>!removed.has(chip.key));return parsed;}
 function close(){feedback.textContent='';list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');selected=-1;}
 function render(){const parsed=interpretation();preview.hidden=!input.value.trim();preview.replaceChildren();
  if(!preview.hidden){preview.append(node('span','Search with:','interpretation-label'));for(const chip of parsed.chips){if(chip.key==='type'){preview.append(node('span',chip.label,'intent-chip'));continue;}const button=node('button',chip.label+' ×','intent-chip');button.type='button';button.setAttribute('aria-label','Remove '+chip.label);button.addEventListener('click',()=>{removed.add(chip.key);render();});preview.append(button);}preview.append(node('p',parsed.warnings.join(' ')||(merge?'These choices update your search. Other filters stay as selected.':'Review these choices. Search applies only the choices shown.'),'interpretation-help'));}
  return parsed;
 }
 function select(item){const parsed=interpretation(),residual=parsed.params.q||'';input.value=residual&&input.value!==residual?input.value.replace(residual,item.value):item.value;areas=item.kind==='area'?[item]:[];removed.clear();if(item.kind==='borough')input.value=item.value;close();render();input.focus();}
 function display(suggestions){items=suggestions;selected=-1;list.replaceChildren(...items.map((item,i)=>{const option=node('li');option.id=input.id+'-option-'+i;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.append(node('span',item.label),node('small',kindLabel[item.kind]));option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>select(item));return option;}));list.hidden=!items.length;input.setAttribute('aria-expanded',String(Boolean(items.length)));input.removeAttribute('aria-activedescendant');}
 function suggest(){clearTimeout(timer);controller?.abort();const current=++version,parsed=render(),query=parsed.params.q||input.value.trim();close();
  const local=BOROUGHS.filter(area=>query&&area.toLowerCase().includes(query.toLowerCase())).map(value=>({kind:'borough',label:value,value}));display(local);
  if(!parsed.params.q||query.length<2||query.length>100)return;
  timer=setTimeout(async()=>{controller=new AbortController();try{const params=new URLSearchParams({q:query,type:parsed.params.type,borough:parsed.params.borough}),response=await fetch('/api/suggestions?'+params,{signal:controller.signal});if(!response.ok)throw Error();const data=await response.json();if(current!==version)return;
    const suggestions=(data.suggestions||[]).filter(item=>['area','address','zip','mls'].includes(item.kind)&&typeof item.label==='string'&&typeof item.value==='string').slice(0,12);
    areas=suggestions.filter(item=>item.kind==='area');render();display([...local,...suggestions].slice(0,12));feedback.textContent=items.length?`${items.length} ${items.length===1?'suggestion':'suggestions'}. Use arrow keys to choose or keep typing.`:'No suggestions. You can search the words you entered.';
   }catch(error){if(error.name!=='AbortError'&&current===version)feedback.textContent='Suggestions are unavailable. You can still search your entered words and filters.';}},250);
 }
 input.addEventListener('input',()=>{areas=[];removed.clear();suggest();});input.addEventListener('focus',suggest);input.addEventListener('blur',()=>{close();clearTimeout(timer);controller?.abort();version++;});
 input.addEventListener('keydown',event=>{if(event.key==='Escape'){close();controller?.abort();version++;return;}if(['ArrowDown','ArrowUp'].includes(event.key)&&items.length){event.preventDefault();list.hidden=false;input.setAttribute('aria-expanded','true');selected=selected<0?(event.key==='ArrowDown'?0:items.length-1):(selected+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;[...list.children].forEach((option,i)=>option.setAttribute('aria-selected',String(i===selected)));input.setAttribute('aria-activedescendant',list.children[selected].id);list.children[selected].scrollIntoView({block:'nearest'});}else if(event.key==='Enter'&&selected>=0&&!list.hidden){event.preventDefault();select(items[selected]);}});
 form.addEventListener('submit',event=>{const parsed=render();if(parsed.warnings.length){event.preventDefault();event.stopImmediatePropagation();feedback.textContent=parsed.warnings.join(' ');return;}onApply(parsed,event,removed);close();},true);
 form.addEventListener('change',()=>render());
 return {render};
}
export function initializeSearchStart() {
 const form=$('#start-form');
 composer({form,input:$('#start-query'),list:$('#start-suggestions'),preview:$('#start-understanding'),getDefaults:()=>({type:form.elements.type.value,borough:form.elements.borough.value}),onApply(parsed,event){event.preventDefault();const href=searchURL(parsed.params),label=parsed.chips.map(chip=>chip.label).join(' · ').slice(0,220);try{rememberSearch(localStorage,{label,href});}catch{/* Optional history. */}location.href=href;}});
 for(const button of document.querySelectorAll('[data-start-area]'))button.addEventListener('click',()=>{const href=searchURL({type:form.elements.type.value,borough:button.dataset.startArea});try{rememberSearch(localStorage,{label:button.dataset.startArea,href});}catch{/* Optional history. */}location.href=href;});
 function recent(){let items=[];try{items=cleanRecent(JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY)||'[]'));}catch{/* Optional history. */}$('#recent-searches').hidden=!items.length;$('#recent-search-list').replaceChildren(...items.map(item=>{const a=node('a',item.label);a.href=item.href;return a;}));}
 $('#recent-search-clear').addEventListener('click',()=>{try{localStorage.removeItem(RECENT_SEARCH_KEY);recent();$('#recent-search-status').textContent='Recent searches cleared from this browser.';}catch{$('#recent-search-status').textContent='Browser storage could not be updated.';}});recent();
}
export function initializeResultsComposer(form) {
 const input=$('#results-query');input.value=form.elements.q.value;
 composer({form,input,list:$('#results-suggestions'),preview:$('#results-understanding'),getDefaults:()=>({type:form.elements.type.value,borough:form.elements.borough.value}),merge:true,onApply(parsed,_event,removed){
   for(const key of removed){if(key==='bedsExact'){form.elements.beds.value='';form.elements.bedMatch.value='minimum';}else if(form.elements[key])form.elements[key].value=key==='borough'?'NYC':'';}
   for(const key of ['q','areas','beds','bedsExact','baths','minPrice','maxPrice']){if(!Object.hasOwn(parsed.params,key))continue;if(key==='bedsExact'){form.elements.beds.value=parsed.params[key]==='0'?'studio':parsed.params[key];form.elements.bedMatch.value='exact';}else if(form.elements[key])form.elements[key].value=parsed.params[key];}
   // Clear only the previously entered keywords when a phrase resolves to structured choices.
   form.elements.q.value=parsed.params.q||'';
   if(parsed.params.beds&&!parsed.params.bedsExact)form.elements.bedMatch.value='minimum';
   for(const key of ['type','borough'])form.elements[key].value=parsed.params[key]||'';
   try{rememberSearch(localStorage,{label:parsed.chips.map(chip=>chip.label).join(' · ').slice(0,220),href:searchURL(parsed.params)});}catch{/* Optional history. */}
   input.value=form.elements.q.value;$('#results-understanding').hidden=true;
  }});
}
