import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/utils/api'

type Contact = { id: string; first_name: string; last_name: string; email?: string | null; phone?: string | null }
type Listing = { id: string; name?: string; address?: string }
type Inquiry = Contact & { contact_id: string; listing_id: string; listing_address: string; attendee_role: string; next_showing?: string; showing_count: number }
type Showing = { id: string; shown_at: string; status: string; feedback?: string }
type Props = { listing?: Listing; contact?: Contact; startOpen?: boolean }
const field = 'w-full rounded-lg border border-gray-300 bg-white p-2 text-sm'
const button = 'rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50'
const format = (value: string) => new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' })
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Unable to save. Please try again.'

// Resolve an entered New York wall time independently of the browser's time zone.
export function newYorkInstant(value: string): string {
  const candidate = Date.parse(`${value}:00Z`)
  if (!Number.isFinite(candidate)) throw new Error('Enter a valid date and time.')
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const matches = [4,5].map(offset => new Date(candidate + offset * 3600000)).filter(date => formatter.format(date).replace(' ', 'T') === value)
  if (matches.length !== 1) throw new Error(matches.length ? 'This time occurs twice when daylight saving ends. Please choose a time outside the repeated hour.' : 'This time does not exist when daylight saving starts. Please choose another time.')
  return matches[0].toISOString()
}
function wallTime(value: string) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value)).replace(' ', 'T')
}

export function ListingInquiriesPanel({ listing, contact, startOpen = false }: Props) {
  const [rows, setRows] = useState<Inquiry[]>([])
  const [listingNames, setListingNames] = useState<Record<string,string>>({})
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState('')
  const [archived, setArchived] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(startOpen)
  const [selected, setSelected] = useState<Inquiry | null>(null)
  const [visits, setVisits] = useState<Showing[]>([])
  const [edit, setEdit] = useState<Showing | null>(null)
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const load = useCallback(async () => {
    const current = ++generation.current
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), q: query, archived: archived ? '1' : '0' })
    if (listing) params.set('listingId', listing.id)
    if (contact) params.set('contactId', contact.id)
    try {
      const data = await apiFetch<{ inquiries: Inquiry[]; total: number }>(`/api/listing-inquiries?${params}`)
      if (current === generation.current) { setRows(data.inquiries); setTotal(data.total); setError('') }
    } catch (e) { if (current === generation.current) setError(errorText(e)) }
    finally { if (current === generation.current) setLoading(false) }
  }, [listing?.id, contact?.id, page, query, archived])
  useEffect(() => { const timer = setTimeout(() => { void load() }, 200); return () => { clearTimeout(timer); generation.current++ } }, [load])
  useEffect(() => { const refresh = () => { void load() }; window.addEventListener('focus', refresh); return () => window.removeEventListener('focus', refresh) }, [load])
  useEffect(() => {
    if (listing) { setListingNames({[listing.id]:listing.name || listing.address || listing.id}); return }
    let active = true
    void fetch('/api/listings', {credentials:'include'}).then(async response => {
      if (!response.ok) return
      const data = await response.json()
      const options: Listing[] = data.listings || data.data || data
      if (active && Array.isArray(options)) setListingNames(Object.fromEntries(options.map(item => [item.id,item.name || item.address || item.id])))
    }).catch(() => { /* Saved inquiry labels remain usable when Inventory is unavailable. */ })
    return () => { active = false }
  }, [listing?.id, listing?.name, listing?.address])
  async function showVisits(row: Inquiry) {
    setSelected(row); setEdit(null); setVisits([]); setError('')
    try { const result = await apiFetch<{showings: Showing[]}>(`/api/listing-inquiries/${encodeURIComponent(row.id)}/showings`); setVisits(result.showings) }
    catch(e) { setError(errorText(e)) }
  }
  async function archive(row: Inquiry) {
    setBusy(true)
    try { await apiFetch(`/api/listing-inquiries/${encodeURIComponent(row.id)}`, {method:'PATCH', body:JSON.stringify({archived:!archived})}); await load() }
    catch(e) { setError(errorText(e)) } finally { setBusy(false) }
  }
  return <section className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
    <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold text-gray-900">Listing inquiries & showings</h2><p className="text-sm text-gray-500">One inquiry per person and listing. Visits and updates appear in both places.</p></div>
      <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white" onClick={() => {setSelected(null);setFormOpen(true)}}>Add inquiry / showing</button></div>
    <div className="flex flex-wrap items-center gap-3"><input aria-label="Search listing inquiries" className={`${field} max-w-sm`} placeholder="Search person or listing" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/>
      <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={archived} onChange={e=>{setArchived(e.target.checked);setPage(1)}}/>Archived inquiries</label><button className={button} onClick={()=>void load()}>Refresh</button><span className="text-sm text-gray-500">{total} inquiries</span></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p className="text-sm text-gray-500">Loading inquiries…</p> : rows.length === 0 ? <p className="py-6 text-sm text-gray-500">No matching inquiries. Select a contact and listing to record interest or a showing.</p> :
      <div className="divide-y divide-gray-100">{rows.map(row=><div key={row.id} className="flex flex-wrap justify-between gap-3 py-4">
        <div><Link className="font-semibold text-blue-700" to={`/marketing/crm/${row.contact_id}`}>{row.first_name} {row.last_name}</Link><p><Link className="text-sm text-gray-700 underline" to={`/inventory/listings/${row.listing_id}`}>{listingNames[row.listing_id] || row.listing_address || `Listing ${row.listing_id}`}</Link></p>
          <p className="text-xs text-gray-500 mt-1">{row.attendee_role.replace('_',' ')} · {row.showing_count} visits{row.next_showing ? ` · Next: ${format(row.next_showing)} ET` : ''}</p></div>
        <div className="flex flex-wrap items-center gap-2"><button className={button} onClick={()=>void showVisits(row)}>View visits</button><button className={button} onClick={()=>{setSelected(row);setFormOpen(true)}}>Add visit</button><button disabled={busy} className={button} onClick={()=>void archive(row)}>{archived?'Restore':'Archive'}</button></div>
      </div>)}</div>}
    {total > 25 && <div className="flex gap-3 items-center"><button className={button} disabled={page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span><button className={button} disabled={page*25>=total} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
    {selected && !formOpen && <div className="border rounded-xl p-4 space-y-3"><div className="flex justify-between"><h3 className="font-semibold">Visits: {selected.first_name} {selected.last_name}</h3><button className={button} onClick={()=>{setSelected(null);setEdit(null)}}>Close visits</button></div>
      {visits.length===0 && <p className="text-sm text-gray-500">No visits recorded.</p>}{visits.map(visit=><div key={visit.id} className="flex flex-wrap justify-between border-t pt-3 gap-2"><div><p className="text-sm">{format(visit.shown_at)} ET · {visit.status.replace('_',' ')}</p><p className="text-sm text-gray-500 whitespace-pre-wrap">{visit.feedback}</p></div><button className={button} onClick={()=>setEdit(visit)}>Update visit</button></div>)}
      {edit && <form key={edit.id} className="space-y-3 bg-gray-50 p-3 rounded-xl" onSubmit={async e=>{e.preventDefault();setBusy(true);const data=new FormData(e.currentTarget);try {await apiFetch(`/api/inquiry-showings/${encodeURIComponent(edit.id)}`,{method:'PATCH',body:JSON.stringify({status:data.get('status'),shownAt:newYorkInstant(String(data.get('time'))),feedback:data.get('feedback')})});setEdit(null);await showVisits(selected);await load()}catch(err){setError(errorText(err))}finally{setBusy(false)}}}>
        <label className="block text-sm">Date and time (America/New_York)<input required name="time" type="datetime-local" defaultValue={wallTime(edit.shown_at)} className={field}/></label>
        <label className="block text-sm">Status<select name="status" defaultValue={edit.status} className={field}>{['scheduled','completed','canceled','no_show'].map(s=><option key={s} value={s}>{s.replace('_',' ')}</option>)}</select></label>
        <label className="block text-sm">Feedback<textarea name="feedback" defaultValue={edit.feedback || ''} className={field}/></label><button disabled={busy} className={button}>Save changes</button><button type="button" className={`${button} ml-2`} onClick={()=>setEdit(null)}>Cancel edit</button>
      </form>}
    </div>}
    {formOpen && <InquiryForm listing={selected?{id:selected.listing_id,name:listingNames[selected.listing_id] || selected.listing_address}:listing} contact={selected?{...selected,id:selected.contact_id}:contact} attendeeRole={selected?.attendee_role} onCancel={()=>{setFormOpen(false);setSelected(null)}} onSaved={()=>{setFormOpen(false);setSelected(null);void load()}}/>}
  </section>
}

function InquiryForm({listing,contact,attendeeRole,onCancel,onSaved}:Props & {attendeeRole?:string;onCancel:()=>void;onSaved:()=>void}) {
  const [contacts,setContacts]=useState<Contact[]>([])
  const [listings,setListings]=useState<Listing[]>([])
  const [search,setSearch]=useState('')
  const [contactId,setContactId]=useState(contact?.id || '')
  const [listingId,setListingId]=useState(listing?.id || '')
  const [newContact,setNewContact]=useState(false)
  const [mode,setMode]=useState('scheduled')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [requestId]=useState(()=>crypto.randomUUID())
  useEffect(()=>{if(contact)return;let active=true;const timer=setTimeout(()=>{void apiFetch<{contacts:Contact[]}>(`/api/contacts?limit=25&q=${encodeURIComponent(search)}`).then(data=>{if(active)setContacts(data.contacts)}).catch(e=>{if(active)setError(errorText(e))})},200);return()=>{active=false;clearTimeout(timer)}},[contact?.id,search])
  useEffect(()=>{if(listing)return;let active=true;void fetch('/api/listings',{credentials:'include'}).then(async res=>{if(!res.ok)throw new Error('Unable to load listings');const data=await res.json();const rows=data.listings || data.data || data;if(!Array.isArray(rows))throw new Error('Unable to load listings');if(active)setListings(rows)}).catch(e=>{if(active)setError(errorText(e))});return()=>{active=false}},[listing?.id])
  return <form className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-4" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');const data=new FormData(e.currentTarget);try {
    const shownAt=mode==='interest'?'':newYorkInstant(String(data.get('shownAt')))
    if(mode==='completed' && Date.parse(shownAt)>Date.now())throw new Error('A completed showing cannot be in the future.')
    if(mode==='scheduled' && Date.parse(shownAt)<=Date.now())throw new Error('Choose a future time, or log this as a completed showing.')
    await apiFetch('/api/listing-inquiries',{method:'POST',body:JSON.stringify({requestId,contactId:newContact?'':contactId,listingId,firstName:data.get('firstName'),lastName:data.get('lastName'),email:data.get('email'),phone:data.get('phone'),attendeeRole:data.get('attendeeRole'),shownAt,status:mode==='interest'?undefined:mode,feedback:data.get('feedback')})});onSaved()
  }catch(e){setError(errorText(e))}finally{setBusy(false)}}}>
    <h3 className="font-semibold">Record interest or a showing</h3>
    {contact?<p className="text-sm">Contact: {contact.first_name} {contact.last_name}</p>:<><label className="flex gap-2 text-sm"><input type="checkbox" checked={newContact} onChange={e=>setNewContact(e.target.checked)}/>New contact</label>{newContact?<div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">First name<input name="firstName" required className={field}/></label><label className="text-sm">Last name<input name="lastName" className={field}/></label><label className="text-sm">Email<input name="email" type="email" className={field}/></label><label className="text-sm">Phone<input name="phone" type="tel" className={field}/></label><p className="text-xs text-gray-500 sm:col-span-2">Provide email or phone. An existing matching contact will be reused.</p></div>:<div className="space-y-2"><input className={field} aria-label="Find contact" placeholder="Search contact name, email or phone" value={search} onChange={e=>setSearch(e.target.value)}/><select required aria-label="Select contact" className={field} value={contactId} onChange={e=>setContactId(e.target.value)}><option value="">Select contact</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.first_name} {c.last_name} {c.email||c.phone||''}</option>)}</select></div>}</>}
    {listing?<p className="text-sm">Listing: {listing.name||listing.address||listing.id}</p>:<label className="block text-sm">Listing<select required className={field} value={listingId} onChange={e=>setListingId(e.target.value)}><option value="">Select a listing</option>{listings.map(l=><option key={l.id} value={l.id}>{l.name||l.address||l.id}</option>)}</select></label>}
    <div className="grid sm:grid-cols-2 gap-3"><label className="text-sm">Attendee role<select name="attendeeRole" defaultValue={attendeeRole||'buyer'} className={field}><option value="buyer">Buyer</option><option value="renter">Renter</option><option value="outside_agent">Outside agent</option></select></label><label className="text-sm">Action<select value={mode} onChange={e=>setMode(e.target.value)} className={field}><option value="scheduled">Schedule showing</option><option value="completed">Log completed showing</option><option value="interest">Record interest only</option></select></label></div>
    {mode!=='interest'&&<><label className="block text-sm">Showing date and time (America/New_York)<input required type="datetime-local" name="shownAt" className={field}/></label><label className="block text-sm">Notes / feedback<textarea name="feedback" className={field}/></label></>}
    <p className="text-xs text-gray-500">This records property interest. It does not subscribe the contact to marketing or send a notification.</p>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex gap-2"><button disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{busy?'Saving…':'Save'}</button><button disabled={busy} type="button" className={button} onClick={onCancel}>Cancel</button></div>
  </form>
}
