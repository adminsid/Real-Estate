import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/utils/api'

interface Related {id:string;contactId:string;name:string;email:string;phone:string;relationship:string;note:string}
export function RelatedContacts({contactId}:{contactId:string}) {
  const [rows,setRows]=useState<Related[]>([]),[open,setOpen]=useState(false),[mode,setMode]=useState<'existing'|'new'>('existing')
  const [search,setSearch]=useState(''),[options,setOptions]=useState<{id:string;name:string}[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [editing,setEditing]=useState<Related|null>(null)
  const url=`/api/contact-relationships?contactId=${encodeURIComponent(contactId)}`
  useEffect(()=>{let active=true;void apiFetch<Related[]>(url).then(d=>{if(active)setRows(d)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[url])
  useEffect(()=>{if(!open)return;const abort=new AbortController();const timer=setTimeout(()=>{void apiFetch<{contacts:{id:string;name:string}[]}>(`/api/next/options?q=${encodeURIComponent(search)}`,{signal:abort.signal}).then(d=>setOptions(d.contacts.filter(c=>c.id!==contactId))).catch(e=>{if(e.name!=='AbortError')setError(e.message)})},200);return()=>{clearTimeout(timer);abort.abort()}},[open,search,contactId])
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setError('')
    try{
      let relatedContactId=String(f.get('contactId')||'')
      if(mode==='new'){
        const firstName=String(f.get('firstName')||'').trim(),lastName=String(f.get('lastName')||'').trim(),email=String(f.get('email')||'').trim(),phone=String(f.get('phone')||'').trim()
        const c=await apiFetch<{id:string}>('/api/contacts',{method:'POST',body:JSON.stringify({firstName,lastName,email,phone,type:'other',lifecycleStage:'lead'})})
        relatedContactId=c.id
        // If linking fails, preserve the created record and let the user retry linking it.
        setMode('existing');setOptions(old=>[{id:c.id,name:`${firstName} ${lastName}`},...old]);setEditing({id:'',contactId:c.id,name:`${firstName} ${lastName}`,email,phone,relationship:String(f.get('relationship')),note:String(f.get('note')||'')})
      }
      await apiFetch(url,{method:'POST',body:JSON.stringify({relatedContactId,relationship:f.get('relationship'),note:f.get('note')})})
      setRows(await apiFetch(url));setOpen(false);setEditing(null)
    }catch(e){setError(e instanceof Error?e.message:'Could not save relationship')}finally{setBusy(false)}
  }
  return <section className="rounded-xl border border-gray-200 bg-white p-4 my-4"><div className="flex justify-between items-center"><h3 className="font-bold text-gray-900">Related Contacts</h3><button className="text-sm font-semibold text-teal-700" onClick={()=>{setEditing(null);setMode('existing');setOpen(!open)}}>＋ Link contact</button></div>
    {error&&<p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}
    {!rows.length&&!open&&!error&&<p className="text-sm text-gray-500 mt-3">Connect a spouse, co-seller, family member or referral contact.</p>}
    {rows.map(r=><div key={r.id} className="mt-3 flex items-start gap-3 border-t pt-3"><div className="flex-1"><Link className="font-semibold text-sm text-blue-700" to={`/marketing/crm/${r.contactId}`}>{r.name}</Link><span className="text-xs text-gray-500 ml-2">{r.relationship}</span><p className="text-xs text-gray-500">{r.email}{r.phone?` · ${r.phone}`:''}</p>{r.note&&<p className="text-sm mt-1">{r.note}</p>}</div><button className="text-xs text-gray-600" onClick={()=>{setEditing(r);setMode('existing');setOpen(true)}}>Edit</button><button disabled={busy} className="text-xs text-red-700" onClick={()=>{if(window.confirm('Remove this relationship? Both contacts will remain.')){setBusy(true);void apiFetch(url,{method:'DELETE',body:JSON.stringify({id:r.id})}).then(()=>apiFetch<Related[]>(url)).then(setRows).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}}>Unlink</button></div>)}
    {open&&<form key={`${mode}-${editing?.contactId||'new'}`} onSubmit={e=>void submit(e)} className="mt-4 space-y-3 border-t pt-4"><div className="flex gap-3 text-sm"><button type="button" className={mode==='existing'?'font-bold text-teal-700':''} onClick={()=>setMode('existing')}>Existing contact</button>{!editing&&<button type="button" className={mode==='new'?'font-bold text-teal-700':''} onClick={()=>setMode('new')}>New contact</button>}</div>
      {mode==='existing'?<><label className="block text-sm">Find a contact<input className="block border rounded-lg p-2 w-full mt-1" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name or email"/></label><select aria-label="Related contact" name="contactId" defaultValue={editing?.contactId||''} required className="border rounded-lg p-2 w-full"><option value="">Choose contact</option>{editing&&!options.some(c=>c.id===editing.contactId)&&<option value={editing.contactId}>{editing.name}</option>}{options.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></>:<div className="grid grid-cols-2 gap-3">{[['firstName','First name'],['lastName','Last name'],['email','Email'],['phone','Phone']].map(([name,label])=><label key={name} className="text-sm">{label}<input name={name} type={name==='email'?'email':'text'} required={name==='firstName'||name==='lastName'} className="border rounded-lg p-2 w-full mt-1"/></label>)}</div>}
      <label className="block text-sm">Relationship to this contact<select name="relationship" defaultValue={editing?.relationship||'Spouse'} className="block border rounded-lg p-2 w-full mt-1">{['Spouse','Parent','Child','Sibling','Relative','Friend','Co-buyer','Co-seller','Referral source','Referred contact','Other'].map(t=><option key={t}>{t}</option>)}</select></label><label className="block text-sm">Note<textarea name="note" defaultValue={editing?.note||''} maxLength={500} className="block border rounded-lg p-2 w-full mt-1"/></label><div className="flex gap-3"><button disabled={busy} className="bg-teal-700 text-white rounded-lg px-3 py-2 text-sm">Save relationship</button><button type="button" onClick={()=>setOpen(false)}>Cancel</button></div>
    </form>}
  </section>
}
