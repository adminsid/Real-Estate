export const TYPE_CHOICES={Residential:'Buy a home','Residential Lease':'Rent a home','Residential Income':'Invest in property','Commercial Sale':'Buy commercial','Commercial Lease':'Lease commercial',Land:'Buy land'};
export const STATUS_CHOICES={Active:'Active','Coming Soon':'Coming soon','Active Under Contract':'Under contract',Pending:'Pending',Closed:'Closed',Hold:'On hold',Withdrawn:'Withdrawn',Expired:'Expired',Canceled:'Canceled',Incomplete:'Incomplete',Delete:'Removed'};
export const PUBLIC_STATUSES=['Active','Coming Soon','Active Under Contract','Pending'];
export const DISPLAY_STATUSES=[...PUBLIC_STATUSES,'Closed'];
export function choiceValues(value,kind='type'){
 if(value===undefined||value===null||value==='')return [];
 if(typeof value!=='string'||value.length>500)throw Error('Invalid '+kind+' selection');
 const choices=kind==='type'?TYPE_CHOICES:STATUS_CHOICES,values=value.split(',').map(v=>v.trim());
 if(values.length>Object.keys(choices).length||values.some(v=>!Object.hasOwn(choices,v))||new Set(values).size!==values.length)throw Error('Invalid '+kind+' selection');
 return Object.keys(choices).filter(key=>values.includes(key));
}
export function choiceLabel(value,kind='type'){let values;try{values=choiceValues(value,kind);}catch{return 'Check selection';}const choices=kind==='type'?TYPE_CHOICES:STATUS_CHOICES;return values.length?values.map(v=>choices[v]).join(' + '):kind==='type'?'All property types':'All statuses';}
export function typeApplies(value,allowed){try{const values=choiceValues(value);return !values.length||values.some(type=>allowed.includes(type));}catch{return false;}}
export function toggleType(value,type){const current=choiceValues(value),values=current.length?current:Object.keys(TYPE_CHOICES),next=values.includes(type)?values.filter(v=>v!==type):[...values,type];return next.length?choiceValues(next.join(',')).join(','):value;}
export function refreshChoicePickers(form){for(const picker of form.querySelectorAll('[data-choice]'))picker.refreshChoice?.();}
export function initializeChoicePickers(root=document){
 for(const picker of root.querySelectorAll('[data-choice]')){
  const form=picker.closest('form'),kind=picker.dataset.choice,field=form.elements[kind],all=kind==='type'?TYPE_CHOICES:Object.fromEntries(DISPLAY_STATUSES.map(key=>[key,STATUS_CHOICES[key]])),summary=picker.querySelector('summary'),panel=document.createElement('fieldset'),legend=document.createElement('legend'),note=document.createElement('p');legend.className='sr-only';legend.textContent=kind==='type'?'Choose one or more property types':'Choose one or more listing statuses';panel.append(legend);note.className='choice-help';note.setAttribute('role','status');const checks=[];
  for(const [value,label]of Object.entries(all)){const row=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=value;row.append(input,document.createTextNode(label));panel.append(row);checks.push(input);input.addEventListener('change',event=>{event.stopPropagation();const selected=checks.filter(c=>c.checked).map(c=>c.value);if(!selected.length){input.checked=true;note.textContent='Keep at least one choice, or choose all.';return;}field.value=selected.join(',');note.textContent='';field.dispatchEvent(new Event('change',{bubbles:true}));picker.refreshChoice();});}
  const actions=document.createElement('div'),every=document.createElement('button'),done=document.createElement('button');actions.className='choice-actions';for(const button of [every,done]){button.type='button';button.className='secondary';}every.textContent='Choose all';done.textContent='Done';every.addEventListener('click',()=>{field.value=Object.keys(all).join(',');field.dispatchEvent(new Event('change',{bubbles:true}));picker.refreshChoice();});done.addEventListener('click',()=>{picker.open=false;summary.focus();});actions.append(every,done);panel.append(actions,note);picker.append(panel);
  picker.refreshChoice=()=>{let selected;try{selected=choiceValues(field.value,kind);}catch{selected=[];}for(const c of checks)c.checked=!selected.length||selected.includes(c.value);summary.textContent=selected.length===1?all[selected[0]]||choiceLabel(field.value,kind):selected.length?`${selected.length} ${kind==='type'?'property types':'statuses'}`:kind==='type'?'All property types':'All statuses';summary.title=choiceLabel(field.value,kind);};picker.refreshChoice();form.addEventListener('reset',()=>queueMicrotask(()=>picker.refreshChoice()));
 }
}
