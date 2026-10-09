import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/utils/api'
import type { NextSummary } from '@/domain/next'

export function JourneyLinks({contactId,listingId,transactionId}:{contactId?:string;listingId?:string;transactionId?:string}) {
  const [items,setItems]=useState<NextSummary[]>([]),[error,setError]=useState('')
  const query=new URLSearchParams({...contactId?{contactId}:{},...listingId?{listingId}:{},...transactionId?{transactionId}:{}}).toString()
  useEffect(()=>{let active=true;void apiFetch<NextSummary[]>(`/api/next/journeys?${query}`).then(items=>{if(active)setItems(items)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[query])
  return <section className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 my-4 print:hidden"><div className="flex justify-between items-center gap-3"><h3 className="font-bold text-teal-900">Next · Seller Journey</h3><Link to={`/next?${query}`} className="text-sm font-semibold text-teal-700">Open Next →</Link></div>
    {error?<p role="alert" className="text-sm text-red-700 mt-2">{error}</p>:items.length?<div className="mt-3 space-y-2">{items.map(j=><Link className="flex justify-between gap-3 rounded-lg bg-white p-3 text-sm border border-teal-100" key={j.id} to={`/next/${j.id}`}><strong>{j.name}</strong><span>{j.done}/{j.total} outcomes</span></Link>)}</div>:<p className="text-sm text-slate-600 mt-2">Start a seller journey to organize milestones and collaborate on the next steps.</p>}
  </section>
}
