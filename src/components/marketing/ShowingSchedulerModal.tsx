import { useEffect, useState } from 'react'
import { Calendar, Smartphone } from 'lucide-react'
import clsx from 'clsx'
import { apiFetch } from '@/utils/api'
import { newYorkInstant } from './ListingInquiriesPanel'

type Contact = {id:string;first_name:string;last_name:string;email?:string|null}
type Props = {listing:{id:string;name?:string;address?:string};agentName?:string;onClose:()=>void;onViewHistory:()=>void}
const inputClass = 'w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white'
export function ShowingSchedulerModal({listing,agentName,onClose,onViewHistory}:Props) {
  const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'America/New_York'}).format(new Date())
  const [showingForm,setShowingForm]=useState({buyerName:'',shownAt:'',feedback:''})
  const [showingTab,setShowingTab]=useState<'schedule'|'log'>('schedule')
  const [selectedDateStr,setSelectedDateStr]=useState(today)
  const [selectedTimeStr,setSelectedTimeStr]=useState('10:00')
  const [copyFeedback,setCopyFeedback]=useState(false)
  const [submittingShowing,setSubmittingShowing]=useState(false)
  const [newContact,setNewContact]=useState(false)
  const [contactId,setContactId]=useState('')
  const [contacts,setContacts]=useState<Contact[]>([])
  const [loadingContacts,setLoadingContacts]=useState(true)
  const [search,setSearch]=useState('')
  const [email,setEmail]=useState('')
  const [phone,setPhone]=useState('')
  const [attendeeRole,setAttendeeRole]=useState('buyer')
  const [error,setError]=useState('')
  const [requestId]=useState(()=>crypto.randomUUID())
  const close=()=>{if(!submittingShowing)onClose()}
  useEffect(()=>{
    let active=true
    const timer=setTimeout(()=>{setLoadingContacts(true);void apiFetch<{contacts:Contact[]}>(`/api/contacts?limit=25&q=${encodeURIComponent(search)}`)
      .then(data=>{if(active)setContacts(data.contacts)})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load contacts')})
      .finally(()=>{if(active)setLoadingContacts(false)})},200)
    return()=>{active=false;clearTimeout(timer)}
  },[search])
  useEffect(()=>{setCopyFeedback(false)},[selectedDateStr,selectedTimeStr,showingForm.buyerName])
  useEffect(()=>{
    const original=document.body.style.overflow;document.body.style.overflow='hidden'
    const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!submittingShowing)onClose()}
    document.addEventListener('keydown',keydown)
    return()=>{document.body.style.overflow=original;document.removeEventListener('keydown',keydown)}
  },[onClose,submittingShowing])
        const next7Days = []
        const locale = 'en-US'
        for (let i = 0; i < 7; i++) {
          const d = new Date(`${today}T12:00:00Z`)
          d.setUTCDate(d.getUTCDate() + i)
          next7Days.push({
            dateStr: d.toISOString().split('T')[0],
            dayName: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }),
            dayNum: d.getUTCDate(),
            monthName: d.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' }),
          })
        }
        const timeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']
        const confirmMessage = `Hi ${showingForm.buyerName || 'Client'}, confirming our showing of ${listing?.name || listing?.address || 'property'} scheduled for ${selectedDateStr} at ${selectedTimeStr}. See you there! — ${agentName || 'Agent'}`

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={close}>
            <div role="dialog" aria-modal="true" aria-label="Showing Scheduler" className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md mx-auto space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center border-b pb-2.5">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                  <Calendar className="h-5 w-5 text-brand-navy" />
                  Showing Scheduler
                </h3>
                <button aria-label="Close showing scheduler" disabled={submittingShowing} onClick={close} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              {/* Mode Toggle Tabs */}
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                <button
                  type="button"
                  aria-pressed={showingTab === 'schedule'} onClick={() => setShowingTab('schedule')}
                  className={clsx(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                    showingTab === 'schedule' ? "bg-white text-brand-navy shadow-sm" : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  📅 Schedule Future
                </button>
                <button
                  type="button"
                  aria-pressed={showingTab === 'log'} onClick={() => setShowingTab('log')}
                  className={clsx(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                    showingTab === 'log' ? "bg-white text-brand-navy shadow-sm" : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  📝 Log Past
                </button>
              </div>

              <p className="text-xs text-gray-500 truncate" title={listing.name || listing.address}>{listing.name || listing.address}</p>
              <div className="space-y-2">
                <div className="flex justify-between items-center"><label htmlFor="showing-contact-search" className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Buyer / Client *</label>
                  <button type="button" className="text-[10px] font-bold text-blue-600" onClick={() => {setNewContact(v => !v);setContactId('')}}>{newContact ? 'Choose existing contact' : '+ New contact'}</button>
                </div>
                {newContact ? <div className="space-y-2">
                  <input id="showing-contact-search" aria-label="Client full name" value={showingForm.buyerName} onChange={e => setShowingForm(p => ({...p,buyerName:e.target.value}))} placeholder="e.g. John Smith" className={inputClass}/>
                  <div className="grid grid-cols-2 gap-2"><input aria-label="Client email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className={inputClass}/><input aria-label="Client phone" type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Phone" className={inputClass}/></div>
                  <p className="text-[10px] text-gray-400">Add email or phone to match an existing CRM contact.</p>
                </div> : <>
                  <input id="showing-contact-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name, email or phone" className={inputClass}/>
                  <select aria-label="Select client" value={contactId} onChange={e=>{setContactId(e.target.value);const c=contacts.find(c=>c.id===e.target.value);setShowingForm(p=>({...p,buyerName:c ? `${c.first_name} ${c.last_name}`.trim() : ''}))}} className={inputClass}>
                    <option value="">{loadingContacts ? 'Loading contacts…' : 'Select client'}</option>{contacts.map(c=><option value={c.id} key={c.id}>{c.first_name} {c.last_name}{c.email ? ` · ${c.email}` : ''}</option>)}
                  </select>
                </>}
                <select aria-label="Attendee role" value={attendeeRole} onChange={e=>setAttendeeRole(e.target.value)} className={inputClass}><option value="buyer">Buyer</option><option value="renter">Renter</option><option value="outside_agent">Outside agent</option></select>
              </div>
              <p className="text-[10px] text-gray-400">All times in America/New_York · Saved to CRM automatically</p>
              {showingTab === 'schedule' ? (
                <>
                  {/* Date Scrolling Selector */}
                  <div className="space-y-1">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Select Date</label>
                    <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-none no-print">
                      {next7Days.map((d) => {
                        const isSelected = selectedDateStr === d.dateStr
                        return (
                          <button
                            key={d.dateStr}
                            type="button"
                            aria-pressed={isSelected} onClick={() => setSelectedDateStr(d.dateStr)}
                            className={clsx(
                              "flex-shrink-0 w-14 p-2 rounded-xl text-center border-2 transition-all flex flex-col items-center justify-center",
                              isSelected ? "border-brand-navy bg-blue-50/50 text-brand-navy font-bold" : "border-gray-100 bg-white text-gray-600 hover:border-gray-250"
                            )}
                          >
                            <span className="text-[9px] uppercase font-bold text-gray-400 leading-none mb-1">{d.dayName}</span>
                            <span className="text-base font-extrabold leading-none mb-0.5">{d.dayNum}</span>
                            <span className="text-[8px] uppercase font-semibold leading-none">{d.monthName}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Time Slots Selector */}
                  <div className="space-y-1.5">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Select Time Slot</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {timeSlots.map((ts) => {
                        const isSelected = selectedTimeStr === ts
                        const [hour, min] = ts.split(':')
                        const hr = parseInt(hour)
                        const ampm = hr >= 12 ? 'PM' : 'AM'
                        const hr12 = hr % 12 === 0 ? 12 : hr % 12
                        const displayTime = `${hr12}:${min} ${ampm}`

                        return (
                          <button
                            key={ts}
                            type="button"
                            aria-pressed={isSelected} onClick={() => setSelectedTimeStr(ts)}
                            className={clsx(
                              "py-1.5 rounded-lg text-center font-bold text-[10px] border transition-all",
                              isSelected ? "bg-brand-navy text-white border-brand-navy shadow-sm" : "bg-gray-50 border-gray-150 text-gray-600 hover:bg-gray-100"
                            )}
                          >
                            {displayTime}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Custom Picker Fallback */}
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Or Custom Date/Time</label>
                    <input
                      aria-label={showingTab === 'schedule' ? 'Custom date and time' : 'Past showing date and time'} type="datetime-local"
                      value={`${selectedDateStr}T${selectedTimeStr}`}
                      onChange={(e) => {
                        const parts = e.target.value.split('T')
                        if (parts[0]) setSelectedDateStr(parts[0])
                        if (parts[1]) setSelectedTimeStr(parts[1].substring(0, 5))
                      }}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white"
                    />
                  </div>

                  {/* SMS / Copy Confirmation Template */}
                  <div className="bg-gray-50 border border-gray-150 rounded-2xl p-3 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold uppercase text-gray-400 flex items-center gap-1">
                        <Smartphone className="h-3.5 w-3.5 text-gray-500" />
                        Client Text Confirmation Copy
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(confirmMessage); setCopyFeedback(true) }
                          catch { setError('Unable to copy. Select and copy the confirmation text below.') }
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:underline bg-white border px-2 py-0.5 rounded-md"
                      >
                        {copyFeedback ? 'Copied ✓' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-600 italic leading-relaxed bg-white border border-gray-100 p-2 rounded-xl">
                      "{confirmMessage}"
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {/* Past Showing Log fields */}
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Date & Time</label>
                    <input
                      aria-label="Past showing date and time" type="datetime-local"
                      value={showingForm.shownAt}
                      onChange={(e) => setShowingForm((p) => ({ ...p, shownAt: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Feedback</label>
                    <textarea
                      value={showingForm.feedback}
                      onChange={(e) => setShowingForm((p) => ({ ...p, feedback: e.target.value }))}
                      placeholder="Feedback from buyer/client..."
                      rows={3}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white"
                    />
                  </div>
                </>
              )}

              {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={close}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    submittingShowing ||
                    !showingForm.buyerName.trim() || (!newContact && !contactId) || (newContact && !email.trim() && !phone.trim()) ||
                    (showingTab === 'log' && !showingForm.shownAt)
                  }
                  onClick={async () => {
                    setSubmittingShowing(true)
                    try {
                      setError('')
                      const finalShownAt = newYorkInstant(showingTab === 'schedule' ? `${selectedDateStr}T${selectedTimeStr}` : showingForm.shownAt)
                      if (showingTab === 'schedule' && Date.parse(finalShownAt) <= Date.now()) throw new Error('Choose a future time, or use Log Past.')
                      if (showingTab === 'log' && Date.parse(finalShownAt) > Date.now()) throw new Error('Choose a past time, or use Schedule Future.')
                      const [firstName, ...lastNames] = showingForm.buyerName.trim().split(/\s+/)
                      await apiFetch('/api/listing-inquiries', {method:'POST', body:JSON.stringify({
                        requestId, listingId:listing.id, contactId:newContact ? undefined : contactId,
                        firstName,lastName:lastNames.join(' '),email,phone,attendeeRole,
                        shownAt:finalShownAt,status:showingTab === 'schedule' ? 'scheduled' : 'completed', feedback:showingForm.feedback,
                      })})
                      onClose()
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Unable to save showing')
                    } finally {
                      setSubmittingShowing(false)
                    }
                  }}
                  className="flex-1 rounded-xl bg-brand-navy px-4 py-2 text-xs font-semibold text-white hover:bg-brand-navy-light disabled:opacity-60"
                >
                  {submittingShowing ? 'Saving...' : showingTab === 'schedule' ? 'Schedule' : 'Save Log'}
                </button>
              </div>
              <button type="button" disabled={submittingShowing} onClick={onViewHistory} className="w-full text-center text-[11px] font-semibold text-blue-600 hover:underline">View inquiries & showing history</button>
            </div>
          </div>
        )

}
