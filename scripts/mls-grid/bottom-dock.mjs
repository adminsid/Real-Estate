const $=selector=>document.querySelector(selector);
// One form and one settings panel. Only the form changes position.
export function initializeBottomDock(){
 const dock=$('#search-dock'),form=$('#search'),searchDialog=$('#dock-search-panel'),viewDialog=$('#dock-view-panel'),position=$('#controls-position');
 const marker=document.createComment('Inline search position');form.before(marker);
 const originalMenus=[...form.querySelectorAll('[data-popover]')];
 let selected=new URLSearchParams(location.search).get('controls'),lastSearchTrigger=$('#dock-search-open');
 if(!['top','bottom'].includes(selected))try{selected=localStorage.getItem('property-search-controls');}catch{}
 if(!['top','bottom'].includes(selected))selected='bottom';
 const embedded=document.body.dataset.embedded==='true';if(embedded)selected='top';position.closest('label').hidden=embedded;
 $('#results-filters').append($('#active-filters'));
 $('#search-actions').append($('#save-search'),$('#results-view-open'));$('.quick-filters').append($('.photos-filter'));$('.photo-inspiration').append($('#match-insights'));
 $('#dock-view-body').append($('.result-actions'),$('.browse-choice'),$('.view-preferences'));$('.view-preferences').removeAttribute('data-popover');$('.view-preferences').open=true;
 $('#dock-position-setting').append(position.closest('label'));
 $('#saved-search-body').append($('#saved-search-panel'),$('#preference-status'));$('#saved-search-panel').open=true;
 $('.map-view-switch').setAttribute('aria-label','Results and map layout');
 function measure(){document.documentElement.style.setProperty('--search-dock-height',(selected==='bottom'?Math.ceil(dock.getBoundingClientRect().height):0)+'px');}
 function summary(){const count=Math.max(0,$('#active-filters').querySelectorAll('button').length-1);$('#dock-filters-open').textContent=count?`Filters (${count})`:'Filters';$('#dock-map-toggle').setAttribute('aria-pressed',String($('#discovery-layout').dataset.layout==='map'));const error=$('#filter-error');$('#dock-input-error').hidden=selected!=='bottom'||searchDialog.open||error.hidden;$('#dock-input-error').textContent=error.textContent;}
 function apply(){if(searchDialog.open)searchDialog.close();document.body.dataset.controls=selected;position.value=selected;dock.hidden=selected!=='bottom';$('#skip-controls').hidden=selected!=='bottom'||document.body.dataset.page!=='results'||location.pathname.startsWith('/listing/');
  for(const menu of originalMenus){menu.open=false;if(selected==='bottom')menu.removeAttribute('data-popover');else menu.setAttribute('data-popover','');}
  if(selected==='bottom')$('#dock-search-body').append(form);else marker.after(form);
  $('#dock-top-position').hidden=true;summary();measure();
 }
 position.addEventListener('change',()=>{selected=position.value;apply();try{localStorage.setItem('property-search-controls',selected);}catch{}const url=new URL(location.href);url.searchParams.set('controls',selected);history.replaceState(null,'',url);$('#open-full-search').href=document.body.dataset.publicOrigin+'/?'+url.searchParams;});
 function openSearch(filters,trigger){lastSearchTrigger=trigger;$('#dock-search-title').textContent=filters?'Filters':'Search';$('.more-filters').open=filters;$('.price-filter').open=filters;if(!searchDialog.open)searchDialog.showModal();trigger.setAttribute('aria-expanded','true');(filters?$('.price-filter summary'):$('#results-query')).focus();}
 $('#dock-search-open').addEventListener('click',()=>openSearch(false,$('#dock-search-open')));$('#dock-filters-open').addEventListener('click',()=>openSearch(true,$('#dock-filters-open')));
 $('#results-view-open').addEventListener('click',()=>{if(!viewDialog.open)viewDialog.showModal();$('.view-preferences').open=true;$('#results-view-open').setAttribute('aria-expanded','true');});
 for(const [dialog,trigger]of [[searchDialog,null],[viewDialog,$('#results-view-open')],[$('#saved-search-dialog'),$('#save-search')]]){
  dialog.querySelector('[data-close-dock]').addEventListener('click',()=>{if(dialog===searchDialog&&!form.reportValidity())return;dialog.close();});
  dialog.addEventListener('close',()=>{if(dialog===searchDialog){$('#dock-search-open').setAttribute('aria-expanded','false');$('#dock-filters-open').setAttribute('aria-expanded','false');if(selected==='bottom')lastSearchTrigger?.focus();}else{trigger?.setAttribute('aria-expanded','false');trigger?.focus();}summary();});
 }
 form.addEventListener('submit',()=>{const fields=form.elements;if(form.checkValidity()&&!(fields.minPrice.value&&fields.maxPrice.value&&Number(fields.minPrice.value)>Number(fields.maxPrice.value)))searchDialog.close();});
 $('#dock-map-toggle').addEventListener('click',()=>document.querySelector(`[data-layout="${$('#discovery-layout').dataset.layout==='map'?'homes':'map'}"]`).click());
 function viewport(){const v=window.visualViewport;document.documentElement.style.setProperty('--available-height',(v?.height||innerHeight)+'px');document.documentElement.style.setProperty('--visual-top',(v?.offsetTop||0)+'px');document.body.dataset.keyboard=v&&v.height<innerHeight*.8?'open':'closed';}
 window.visualViewport?.addEventListener('resize',viewport);viewport();new ResizeObserver(measure).observe(dock);
 new MutationObserver(summary).observe($('#active-filters'),{childList:true,subtree:true});new MutationObserver(summary).observe($('#discovery-layout'),{attributes:true,attributeFilter:['data-layout']});new MutationObserver(summary).observe($('#filter-error'),{childList:true,attributes:true,attributeFilter:['hidden']});
 apply();return {params(params){params.set('controls',selected);}};
}
