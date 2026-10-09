import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { apiFetch } from '@/utils/api'
import { importNextJourneys, newSellerJourney, nextGateway, nextProgress,
  type NextDocument, type NextJourney, type NextSummary, type NextComment, type NextMember } from '@/domain/next'
import { NextRecords } from './NextRecords'
import './next.css'

interface Options { contacts: {id:string;name:string}[]; transactions: {id:string;name:string;listingId:string}[]; users: NextMember[] }
function download(name:string,data:unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}))
  const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)
}
export function NextPage() {
  const {id}=useParams();const navigate=useNavigate();const [params]=useSearchParams()
  const [list,setList]=useState<NextSummary[]>([]),[journey,setJourney]=useState<NextJourney|null>(null)
  const [doc,setDoc]=useState<NextDocument|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false)
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[view,setView]=useState(params.get('phase') || 'prelisting')
  const [modal,setModal]=useState<'new'|'team'|'links'|'reset'|null>(null)
  const [comments,setComments]=useState<NextComment[]>([]),[options,setOptions]=useState<Options>({contacts:[],transactions:[],users:[]})
  const [search,setSearch]=useState(''),[memberIds,setMemberIds]=useState<string[]>([])
  const importInput=useRef<HTMLInputElement>(null),dirtyRef=useRef(false),busyRef=useRef(false)
  dirtyRef.current=dirty;busyRef.current=busy
  const update=(next:NextDocument)=>{setDoc(next);setDirty(true);setNotice('')}
  const refreshList=useCallback(async()=>setList(await apiFetch<NextSummary[]>('/api/next/journeys')),[])
  const adopt=(j:NextJourney)=>{setJourney(j);setDoc(j.document);setDirty(false);setError('')}
  const run=async(task:()=>Promise<void>)=>{setBusy(true);setError('');try{await task()}catch(e){setError(e instanceof Error?e.message:'Request failed')}finally{setBusy(false)}}
  useEffect(()=>{void refreshList().catch(e=>setError(e.message))},[refreshList])
  useEffect(()=>{
    let canceled=false
    setJourney(null);setDoc(null);setDirty(false);setError('')
    const load=async()=>{
      if(!id)return
      const [j,c]=await Promise.all([apiFetch<NextJourney>(`/api/next/journeys/${id}`),apiFetch<NextComment[]>(`/api/next/journeys/${id}/comments`)])
      if(!canceled&&!dirtyRef.current&&!busyRef.current){setJourney(j);setDoc(j.document);setComments(c)}
    }
    void load().catch(e=>{if(!canceled)setError(e.message)})
    const refresh=()=>{if(!document.hidden&&!dirtyRef.current&&!busyRef.current)void load().catch(e=>{if(!canceled)setError(e.message)})}
    const interval=setInterval(refresh,20000);window.addEventListener('focus',refresh)
    return()=>{canceled=true;clearInterval(interval);window.removeEventListener('focus',refresh)}
  },[id])
  useEffect(()=>{
    if(!dirty)return
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''}
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)
  },[dirty])
  useEffect(()=>{
    if(modal!=='links'&&modal!=='team')return
    const abort=new AbortController()
    const timer=setTimeout(()=>{void apiFetch<Options>(`/api/next/options?q=${encodeURIComponent(search)}`,{signal:abort.signal}).then(setOptions).catch(e=>{if(e.name!=='AbortError')setError(e.message)})},200)
    return()=>{abort.abort();clearTimeout(timer)}
  },[modal,search])
  useEffect(()=>{if(!modal)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setModal(null)};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[modal])
  const save=()=>run(async()=>{
    if(!doc||!journey)return
    const saved=await apiFetch<NextJourney>(`/api/next/journeys/${journey.id}`,{method:'PUT',body:JSON.stringify({revision:journey.revision,document:doc})})
    adopt(saved);setNotice('All changes saved');await refreshList()
  })
  const create=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();const data=new FormData(e.currentTarget)
    await run(async()=>{
      const d=newSellerJourney(String(data.get('name')),data.get('seed')==='on');d.description=String(data.get('description')||d.description)
      if(params.get('contactId'))d.contactIds=[params.get('contactId')!]
      d.listingId=params.get('listingId')||'';d.transactionId=params.get('transactionId')||''
      const j=await apiFetch<NextJourney>('/api/next/journeys',{method:'POST',body:JSON.stringify({document:d})})
      setModal(null);setDirty(false);await refreshList();navigate(`/next/${j.id}`)
    })
  }
  const importFile=async(file:File)=>run(async()=>{
    if(file.size>1000000)throw new Error('Choose an export smaller than 1 MB')
    const imports=importNextJourneys(JSON.parse(await file.text()))
    let last=''
    for(const item of imports){
      let j=await apiFetch<NextJourney>('/api/next/journeys',{method:'POST',body:JSON.stringify({document:item.document})})
      last=j.id
      for(const [kind,records] of [['offers',item.offers],['showings',item.showings]] as const) for(const record of records){
        j=await apiFetch<NextJourney>(`/api/next/journeys/${j.id}/${kind}`,{method:'POST',body:JSON.stringify({revision:j.revision,record})})
      }
    }
    await refreshList();setDirty(false);navigate(`/next/${last}`);setNotice('Imported as new journeys. Original records were preserved.')
  })
  const progress=doc?nextProgress(doc.phases):{done:0,total:0,percent:0}
  const phase=doc?.phases.find(p=>p.id===view)
  const locked=doc?nextGateway(doc.phases):false
  const editMilestone=(mid:string,patch:Record<string,unknown>)=>{if(doc)update({...doc,phases:doc.phases.map(p=>({...p,milestones:p.milestones.map(m=>m.id===mid?{...m,...patch}:m)}))})}
  const editOutcome=(oid:string,patch:Record<string,unknown>)=>{if(doc)update({...doc,phases:doc.phases.map(p=>({...p,milestones:p.milestones.map(m=>({...m,outcomes:m.outcomes.map(o=>o.id===oid?{...o,...patch}:o)}))}))})}
  const removeMilestone=(mid:string)=>{
    if(!doc||!window.confirm('Delete this milestone and its outcomes? Earlier comments will remain in history.'))return
    update({...doc,phases:doc.phases.map(p=>({...p,milestones:p.milestones.filter(m=>m.id!==mid)}))})
  }
  const removeOutcome=(oid:string)=>{
    if(!doc||!window.confirm('Delete this outcome? Earlier comments will remain in history.'))return
    update({...doc,phases:doc.phases.map(p=>({...p,milestones:p.milestones.map(m=>({...m,outcomes:m.outcomes.filter(o=>o.id!==oid)}))}))})
  }
  const open=(m:typeof modal)=>{setSearch('');setModal(m);if(m==='team'&&journey)setMemberIds(journey.members.map(u=>u.id))}
  return <Layout title="Next · Seller Journey"><div className="next-app">
    <header className="next-topbar"><div className="next-bar-inner">
      <div className="next-brand"><span className="next-logo">N</span><strong>Next</strong><small>by Prime America Real Estate</small></div>
      <label>Journey <select aria-label="Journey" value={id||''} onChange={e=>{if(!dirty||window.confirm('Discard unsaved changes and switch journeys?')){setDirty(false);navigate(e.target.value?`/next/${e.target.value}`:'/next')}}}>
        <option value="">Select a journey</option>{list.map(j=><option key={j.id} value={j.id}>{j.name}</option>)}
      </select></label>
      <button className="next-btn solid" disabled={busy||dirty} onClick={()=>open('new')}>＋ New Journey</button>
      <button className="next-btn" disabled={!journey||busy||dirty} onClick={()=>void run(async()=>{
        if(!journey)return
        const data=await apiFetch(`/api/next/journeys/${journey.id}/export`)
        download('next-seller-journey.json',data)
        if(data.omitted?.length)setNotice('Checklist exported. Business records outside your access were omitted.')
      })}>↓ Export</button>
      <button className="next-btn" disabled={busy||dirty} onClick={()=>importInput.current?.click()}>↑ Import</button>
      {journey?.canManage&&<button className="next-btn" disabled={busy||dirty} onClick={()=>open('reset')}>Reset</button>}
      <input ref={importInput} hidden type="file" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];if(f)void importFile(f);e.target.value=''}}/>
    </div></header>
    {error&&<div className="next-alert" role="alert">{error} <button onClick={()=>void run(async()=>{if(id){adopt(await apiFetch(`/api/next/journeys/${id}`));setNotice('Latest saved version loaded')}})}>Reload saved version</button>{dirty&&<button onClick={()=>download('next-unsaved-changes.json',{document:doc})}>Download unsaved edits</button>}</div>}
    {notice&&<p className="next-notice" role="status">{notice}</p>}
    {!doc?<div className="next-empty"><h1>{id?'Loading journey…':'Every home sale has a next step.'}</h1><p>Start with the complete seller workflow, or build your own milestones within its four phases.</p>
      {!id&&<><button className="next-btn solid" onClick={()=>open('new')}>＋ New seller journey</button><div className="next-journey-list">{list.map(j=><Link to={`/next/${j.id}`} key={j.id}>{j.name}<small>{j.done} / {j.total} outcomes completed</small></Link>)}</div></>}
    </div>:<>
      <section className="next-hero"><div className="next-hero-row"><input aria-label="Journey title" value={doc.name} maxLength={200} disabled={!journey?.canWrite||busy} onChange={e=>update({...doc,name:e.target.value})}/><span className="next-status">{progress.percent===100?'✓ Complete':`${progress.percent}% complete`}</span></div>
        <small>Started {journey&&new Date(journey.createdAt+'Z').toLocaleDateString()} · Seller workflow</small>
        <textarea aria-label="Journey description" value={doc.description} disabled={!journey?.canWrite||busy} rows={2} onChange={e=>update({...doc,description:e.target.value})}/>
        <div className="next-progress"><span>{progress.done} of {progress.total} outcomes completed ({progress.percent}%)</span><progress max={progress.total||1} value={progress.done}/></div>
        <div className="next-toolbar"><span>{journey?.members.map(m=>m.name).join(' · ')}</span><div>
          {journey?.canManage&&<><button className="next-btn ghost" disabled={busy||dirty} onClick={()=>open('team')}>Team</button><button className="next-btn ghost" disabled={busy} onClick={()=>open('links')}>Linked records</button></>}
          {journey?.canWrite&&<button className="next-btn solid" disabled={!dirty||busy} onClick={()=>void save()}>{busy?'Saving…':dirty?'Save changes':'Saved'}</button>}
        </div></div>
      </section>
      <nav className="next-phasenav" aria-label="Seller journey phases">{doc.phases.map(p=>{const n=nextProgress([p]);return <button key={p.id} className={`next-pill ${view===p.id?'active':''}`} onClick={()=>setView(p.id)}>{p.name}<span>{n.done}/{n.total}</span>{locked&&['contract','closing'].includes(p.id)&&' 🔒'}</button>})}
        <span className="next-navsep"/><button className={`next-pill tool ${view==='offers'?'active':''}`} onClick={()=>setView('offers')}>Offers</button><button className={`next-pill tool ${view==='showings'?'active':''}`} onClick={()=>setView('showings')}>Showings</button>
        <a className="next-pill inventory" href={doc.listingId?`/inventory/${doc.listingId}`:doc.inventoryUrl} target="_blank" rel="noreferrer">↗ {doc.inventoryLabel}</a>
        {doc.transactionId&&<Link className="next-pill" to={`/transactions/${doc.transactionId}`}>Transaction ↗</Link>}
      </nav>
      <main className="next-main">
        {phase&&<><h2>{phase.name} <small>{nextProgress([phase]).done}/{nextProgress([phase]).total} outcomes</small></h2>
          {locked&&['contract','closing'].includes(phase.id)&&<p className="next-gate">🔒 Preview this phase. Record an accepted offer in Offers to start these outcomes.</p>}
          <fieldset disabled={busy||!journey?.canWrite||(locked&&['contract','closing'].includes(phase.id))}>
          {phase.milestones.filter(m=>!m.hidden).map(m=><details className="next-milestone" key={m.id} open={undefined} ref={el=>{if(el&&!el.dataset.initialized){el.open=true;el.dataset.initialized='true'}}}>
            <summary><span className="next-caret">▸</span><strong>{m.name}</strong><span className="next-count">{nextProgress([{...phase,milestones:[m]}]).done}/{m.outcomes.filter(o=>!o.notApplicable).length}</span><button type="button" title="Hide milestone" onClick={e=>{e.preventDefault();editMilestone(m.id,{hidden:true})}}>◉</button>{!m.outcomes.some(o=>o.gateway)&&<button type="button" title="Delete milestone" onClick={e=>{e.preventDefault();removeMilestone(m.id)}}>×</button>}</summary>
            <div className="next-ms-description"><input aria-label={`Milestone name: ${m.name}`} value={m.name} onChange={e=>editMilestone(m.id,{name:e.target.value})}/><textarea aria-label={`Description: ${m.name}`} value={m.description} rows={3} onChange={e=>editMilestone(m.id,{description:e.target.value})}/></div>
            {m.outcomes.filter(o=>!o.hidden).map(o=><div className={`next-outcome ${o.done?'done':''}`} key={o.id} id={`outcome-${o.id}`}>
              <input aria-label={`Complete ${o.name}`} type="checkbox" checked={o.done} disabled={!!o.gateway||!!o.notApplicable} onChange={e=>editOutcome(o.id,{done:e.target.checked})}/>
              <div className="next-outcome-body"><div className="next-outcome-title"><input aria-label={`Outcome name: ${o.name}`} value={o.name} onChange={e=>editOutcome(o.id,{name:e.target.value})}/>{o.star&&<span className="next-star">*</span>}<button title="Hide outcome" onClick={()=>editOutcome(o.id,{hidden:true})}>◉</button>{!o.gateway&&<button type="button" title="Delete outcome" onClick={()=>removeOutcome(o.id)}>×</button>}</div>
                {o.gateway&&<small>Updated from the Offers log. Acceptance does not change MLS or transaction stage.</small>}
                <details className="next-outcome-details" open={params.get('outcome')===o.id}><summary>{o.assigneeId?journey?.members.find(u=>u.id===o.assigneeId)?.name||'Former team member':'Assign & discuss'}{o.dueDate?` · Due ${o.dueDate}`:''}{o.notApplicable?' · Not applicable':''}{comments.some(c=>c.outcome_id===o.id)?` · ${comments.filter(c=>c.outcome_id===o.id).length} comments`:''}</summary>
                  <label>Description<textarea value={o.description} onChange={e=>editOutcome(o.id,{description:e.target.value})}/></label>
                  <div className="next-grid"><label>Assigned to<select value={o.assigneeId||''} onChange={e=>editOutcome(o.id,{assigneeId:e.target.value})}><option value="">Unassigned</option>{journey?.members.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>Due date<input type="date" value={o.dueDate||''} onChange={e=>editOutcome(o.id,{dueDate:e.target.value})}/></label></div>
                  {!o.gateway&&<label>Not applicable — optional reason<input value={o.notApplicable||''} placeholder="Leave blank if this outcome applies" onChange={e=>editOutcome(o.id,{notApplicable:e.target.value,done:e.target.value?false:o.done})}/></label>}
                  <div className="next-comments">{comments.filter(c=>c.outcome_id===o.id).map(c=><div key={c.id}><strong>{c.user_name}</strong><small>{new Date(c.created_at+'Z').toLocaleString()}</small><p>{c.body}</p></div>)}</div>
                  <form onSubmit={e=>{e.preventDefault();const form=e.currentTarget;const body=String(new FormData(form).get('comment')||'');void run(async()=>{
                    await apiFetch(`/api/next/journeys/${id}/comments`,{method:'POST',body:JSON.stringify({outcomeId:o.id,body})});setComments(await apiFetch(`/api/next/journeys/${id}/comments`));form.reset()
                  })}}><label>Comment<textarea name="comment" required maxLength={5000}/></label><button className="next-btn ghost" disabled={dirty}>Post comment</button>{dirty&&<small>Save changes before posting a comment.</small>}</form>
                </details>
              </div>
            </div>)}
            {m.outcomes.some(o=>o.hidden)&&<details className="next-hidden"><summary>Hidden outcomes · {m.outcomes.filter(o=>o.hidden).length}</summary>{m.outcomes.filter(o=>o.hidden).map(o=><div key={o.id}>{o.name}<button onClick={()=>editOutcome(o.id,{hidden:false})}>Restore</button></div>)}</details>}
            <form className="next-add-outcome" onSubmit={e=>{e.preventDefault();const f=e.currentTarget,d=new FormData(f);editMilestone(m.id,{outcomes:[...m.outcomes,{id:crypto.randomUUID(),name:String(d.get('name')),description:String(d.get('description')||''),done:false,hidden:false}]});f.reset()}}>
              <input name="name" aria-label={`New outcome in ${m.name}`} required maxLength={500} placeholder="New outcome"/><input name="description" aria-label="New outcome description" placeholder="Description (optional)"/><button className="next-btn ghost">＋ Add outcome</button>
            </form>
          </details>)}
          {!phase.milestones.some(m=>!m.hidden)&&<p className="next-empty">No milestones shown. Add a milestone or restore a hidden one below.</p>}
          <details className="next-add-milestone"><summary>＋ Add milestone <small>to {phase.name}</small></summary><form onSubmit={e=>{e.preventDefault();const f=e.currentTarget,d=new FormData(f);update({...doc,phases:doc.phases.map(p=>p.id===phase.id?{...p,milestones:[...p.milestones,{id:crypto.randomUUID(),name:String(d.get('name')),description:String(d.get('description')||''),hidden:false,outcomes:[]}]}:p)});f.reset()}}><label>Milestone name<input name="name" required maxLength={300}/></label><label>Description<textarea name="description"/></label><button className="next-btn solid">Add milestone</button></form></details>
          {phase.milestones.some(m=>m.hidden)&&<div className="next-hidden"><h3>Hidden milestones</h3><p>Hidden work still counts toward progress. Restore it to continue.</p>{phase.milestones.filter(m=>m.hidden).map(m=><div key={m.id}>{m.name}<button onClick={()=>editMilestone(m.id,{hidden:false})}>Restore</button></div>)}</div>}
          </fieldset>
        </>}
        {journey&&(view==='offers'||view==='showings')&&<NextRecords key={`${id}-${view}`} kind={view} journey={journey} disabled={dirty||busy} onSaved={j=>{adopt(j);void refreshList()}}/>}
        {comments.some(c=>!doc.phases.some(p=>p.milestones.some(m=>m.outcomes.some(o=>o.id===c.outcome_id))))&&<details className="next-hidden"><summary>Comments from earlier checklist versions</summary><div className="next-comments">{comments.filter(c=>!doc.phases.some(p=>p.milestones.some(m=>m.outcomes.some(o=>o.id===c.outcome_id)))).map(c=><div key={c.id}><strong>{c.user_name}</strong><small>{new Date(c.created_at+'Z').toLocaleString()}</small><p>{c.body}</p></div>)}</div></details>}
      </main>
    </>}
    {modal&&<div className="next-overlay" onClick={e=>{if(e.target===e.currentTarget)setModal(null)}}><section className="next-modal" role="dialog" aria-modal="true" aria-label={modal==='new'?'Create a new journey':modal==='team'?'Journey team':modal==='reset'?'Reset journey':'Linked records'}>
      <button className="next-close" aria-label="Close dialog" onClick={()=>setModal(null)}>×</button>
      {modal==='new'&&<form onSubmit={e=>void create(e)}><h2>Create a New Journey</h2><p>One seller engagement, with phases, milestones and outcomes you can extend at any time.</p><label>Journey name<input autoFocus name="name" required maxLength={200} placeholder="456 Oak Avenue — Home Sale"/></label><label>Description<textarea name="description"/></label><label className="next-check-label"><input type="checkbox" name="seed" defaultChecked/> Start with the complete seller template</label><button className="next-btn solid" disabled={busy}>Create Journey</button></form>}
      {modal==='team'&&journey&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{adopt(await apiFetch(`/api/next/journeys/${id}/members`,{method:'PUT',body:JSON.stringify({revision:journey.revision,userIds:memberIds})}));setModal(null)})}}><h2>Journey team</h2><p>Members can view and edit this journey and receive outcome assignments. Linked CRM and transaction access remains separate.</p><div className="next-member-list">{options.users.map(u=><label className="next-check-label" key={u.id}><input type="checkbox" disabled={u.id===journey.ownerId} checked={memberIds.includes(u.id)} onChange={e=>setMemberIds(e.target.checked?[...memberIds,u.id]:memberIds.filter(id=>id!==u.id))}/>{u.name}<small>{u.role}</small></label>)}</div><button className="next-btn solid" disabled={busy}>Save team</button></form>}
      {modal==='links'&&doc&&<><h2>Linked records</h2><label>Find contacts or transactions<input autoFocus value={search} onChange={e=>setSearch(e.target.value)}/></label><label>Seller contacts<select value="" onChange={e=>{if(e.target.value&&!doc.contactIds.includes(e.target.value))update({...doc,contactIds:[...doc.contactIds,e.target.value]})}}><option value="">Add an existing contact</option>{options.contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{doc.contactIds.map(cid=><div className="next-linked" key={cid}><Link to={`/marketing/crm/${cid}`}>{options.contacts.find(c=>c.id===cid)?.name||'Open contact'}</Link><button onClick={()=>update({...doc,contactIds:doc.contactIds.filter(c=>c!==cid)})}>Unlink</button></div>)}<label>Transaction<select disabled={!!journey?.document.transactionId} value={doc.transactionId} onChange={e=>{const t=options.transactions.find(t=>t.id===e.target.value);update({...doc,transactionId:e.target.value,listingId:t?.listingId||doc.listingId})}}><option value="">Not linked yet</option>{doc.transactionId&&!options.transactions.some(t=>t.id===doc.transactionId)&&<option value={doc.transactionId}>Linked transaction</option>}{options.transactions.map(t=><option value={t.id} key={t.id}>{t.name}</option>)}</select></label>
        <ListingPicker value={doc.listingId} disabled={!!journey?.document.listingId} onChange={listingId=>update({...doc,listingId})}/>
        <label>Inventory link<input type="url" value={doc.inventoryUrl} onChange={e=>update({...doc,inventoryUrl:e.target.value})}/></label><label>Inventory label<input value={doc.inventoryLabel} onChange={e=>update({...doc,inventoryLabel:e.target.value})}/></label><button className="next-btn solid" onClick={()=>setModal(null)}>Done — save changes on journey</button></>}
      {modal==='reset'&&journey&&doc&&<form onSubmit={e=>{e.preventDefault();const confirmName=String(new FormData(e.currentTarget).get('confirm'));void run(async()=>{adopt(await apiFetch(`/api/next/journeys/${id}/reset`,{method:'POST',body:JSON.stringify({revision:journey.revision,confirmName})}));setModal(null);setNotice('Seller checklist reset. Linked records and logs were preserved.');await refreshList()})}}><h2>Reset this seller checklist?</h2><p>This restores all 23 milestones and 182 outcomes. Custom checklist edits and assignments are removed from the current version. Offers, showings, links, team and comment history remain.</p><label>Type “{doc.name}” to confirm<input autoFocus name="confirm" required/></label><button className="next-btn danger" disabled={busy}>Reset selected journey</button></form>}
      {error&&<p className="next-alert" role="alert">{error}</p>}
    </section></div>}
  </div></Layout>
}

function ListingPicker({value,disabled,onChange}:{value:string;disabled:boolean;onChange:(id:string)=>void}) {
  const [list,setList]=useState<{id:string;address?:string;name?:string}[]>([]),[error,setError]=useState('')
  useEffect(()=>{let canceled=false;void apiFetch('/api/listings').then(data=>{if(!canceled)setList(Array.isArray(data)?data:data.listings||[])}).catch(e=>{if(!canceled)setError(e.message)});return()=>{canceled=true}},[])
  return <label>Listing<select disabled={disabled} value={value} onChange={e=>onChange(e.target.value)}><option value="">Not linked yet</option>{value&&!list.some(l=>l.id===value)&&<option value={value}>Linked listing</option>}{list.map(l=><option value={l.id} key={l.id}>{l.address||l.name||l.id}</option>)}</select>{error&&<small>{error}</small>}</label>
}
