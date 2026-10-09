import { useEffect, useState, type FormEvent } from 'react'
import { apiFetch } from '@/utils/api'
import { offerStatuses, showingFollowUps, type NextJourney, type NextOffer, type NextShowing } from '@/domain/next'

export function NextRecords({kind,journey,disabled,onSaved}:{kind:'offers'|'showings';journey:NextJourney;disabled:boolean;onSaved:(j:NextJourney)=>void}) {
  const [records,setRecords]=useState<(NextOffer|NextShowing)[]>([]),[editing,setEditing]=useState<NextOffer|NextShowing|'new'|null>(null)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  const url=`/api/next/journeys/${journey.id}/${kind}`
  useEffect(()=>{let canceled=false;void apiFetch<(NextOffer|NextShowing)[]>(url).then(d=>{if(!canceled)setRecords(d)}).catch(e=>{if(!canceled)setError(e.message)});return()=>{canceled=true}},[url,journey.revision])
  const mutate=async(method:string,body:object)=>{
    setBusy(true);setError('')
    try{const j=await apiFetch<NextJourney>(url,{method,body:JSON.stringify({revision:journey.revision,...body})});onSaved(j);setEditing(null)}catch(e){setError(e instanceof Error?e.message:'Could not save')}finally{setBusy(false)}
  }
  const save=(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const record=Object.fromEntries(new FormData(e.currentTarget));if(kind==='showings'&&typeof record.time==='string')record.time=new Date(record.time).toISOString();void mutate(editing==='new'?'POST':'PUT',{record,id:editing&&editing!=='new'?editing.id:undefined})}
  const isOffer=kind==='offers'
  const fields=isOffer?[
    ['date','Date received','date'],['buyer','Buyer / entity','text'],['agent',"Buyer’s agent & brokerage",'text'],['price','Offer price','text'],['terms','Terms','textarea'],['notes','Notes','textarea'],
  ]:[['time','Date / time','datetime-local'],['type','Showing type','text'],['agent',"Buyer’s agent & brokerage",'text'],['contact','Contact','text'],['feedback','Buyer feedback','textarea']]
  const getValue=(key:string)=>{
    if(!editing||editing==='new')return key==='date'?new Date().toISOString().slice(0,10):key==='type'?'Private showing':''
    const value=Object.entries(editing).find(([name])=>name===key)?.[1] || ''
    if(key==='time'&&value){const d=new Date(value);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16)}
    return value
  }
  return <section><h2>{isOffer?'Offers Log':'Showings Log'} <small>{records.length} records</small></h2>
    <p>{isOffer?'Track offers from receipt through negotiation. Recording an accepted offer unlocks Contract & Closing.':'Record showings and buyer feedback to stay on top of market response and follow-up.'}</p>
    <p className="next-log-source">{isOffer?(journey.document.transactionId?'Connected to the transaction’s offers.':'Saved with this journey until a transaction is linked.'):(journey.document.listingId?'Connected to the listing’s showing records.':'Saved with this journey until a listing is linked.')}</p>
    {error&&<p className="next-alert" role="alert">{error}</p>}
    {disabled&&<p className="next-gate">Save your checklist changes before editing this log.</p>}
    <fieldset disabled={disabled||busy||!journey.canWrite}>
      {editing?<form className="next-record-form" onSubmit={save}><h3>{editing==='new'?'Log a new':'Edit'} {isOffer?'offer':'showing'}</h3><div className="next-grid">{fields.map(([key,label,type])=><label key={key}>{label}{type==='textarea'?<textarea name={key} defaultValue={getValue(key)} maxLength={10000}/>:<input name={key} type={type} defaultValue={getValue(key)} required={['date','buyer','price','time'].includes(key)} maxLength={500}/>}</label>)}<label>{isOffer?'Status':'Follow-up status'}<select name={isOffer?'status':'followUp'} defaultValue={getValue(isOffer?'status':'followUp')|| (isOffer?'Received':'New')}>{(isOffer?offerStatuses:showingFollowUps).map(s=><option key={s}>{s}</option>)}</select></label></div><div className="next-form-actions"><button type="button" className="next-btn ghost" onClick={()=>setEditing(null)}>Cancel</button><button className="next-btn solid">Save {isOffer?'offer':'showing'}</button></div></form>:<button className="next-add-trigger" onClick={()=>setEditing('new')}>＋ Log {isOffer?'an offer':'a showing'}</button>}
      {!records.length&&!error&&<p className="next-empty">No {kind} logged yet.</p>}
      {[...records].reverse().map(r=><article className="next-record" key={r.id}>{'buyer'in r?<><div className="next-record-top"><h3>{r.buyer||'Unnamed buyer'}</h3><span className={`next-record-status ${r.status==='Accepted'?'accepted':''}`}>{r.status}</span></div><div className="next-record-meta"><span>{r.date}</span><strong>{r.price}</strong><span>{r.agent}</span></div><p><strong>Terms:</strong> {r.terms||'—'}</p><p><strong>Notes:</strong> {r.notes||'—'}</p></>:<><div className="next-record-top"><h3>{r.type}</h3><span className="next-record-status">{r.followUp}</span></div><div className="next-record-meta"><span>{new Date(r.time).toLocaleString()}</span><span>{r.agent}</span><span>{r.contact}</span></div><p>{r.feedback||'No feedback yet'}</p></>}<div className="next-form-actions"><button className="next-btn ghost" onClick={()=>setEditing(r)}>Edit</button><button className="next-btn danger" onClick={()=>{if(window.confirm(`Delete this ${isOffer?'offer':'showing'}? This also removes its linked record.`))void mutate('DELETE',{id:r.id})}}>Delete</button></div></article>)}
    </fieldset>
  </section>
}
