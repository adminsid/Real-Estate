import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '@/utils/api'
import type { NextAssignment, NextJourney } from '@/domain/next'

export function AssignedOutcomes({onNavigate, refreshKey = 0, canWrite = true}:{onNavigate?:()=>void;refreshKey?:number;canWrite?:boolean}) {
  const [items,setItems]=useState<NextAssignment[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState('')
  useEffect(()=>{
    let canceled=false
    const load=()=>{void apiFetch<NextAssignment[]>('/api/next/assignments').then(d=>{if(!canceled){setItems(d);setError('')}}).catch(e=>{if(!canceled)setError(e.message)})}
    load();const refresh=()=>{if(!document.hidden)load()};const timer=setInterval(refresh,20000);window.addEventListener('focus',refresh)
    return()=>{canceled=true;clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[refreshKey])
  const complete=async(item:NextAssignment)=>{
    setBusy(item.outcome.id);setError('')
    try{
      const j=await apiFetch<NextJourney>(`/api/next/journeys/${item.journeyId}`)
      const phases=j.document.phases.map(p=>({...p,milestones:p.milestones.map(m=>({...m,outcomes:m.outcomes.map(o=>o.id===item.outcome.id?{...o,done:true}:o)}))}))
      await apiFetch(`/api/next/journeys/${j.id}`,{method:'PUT',body:JSON.stringify({revision:j.revision,document:{...j.document,phases}})})
      setItems(await apiFetch('/api/next/assignments'))
    }catch(e){setError(e instanceof Error?e.message:'Could not complete outcome')}finally{setBusy('')}
  }
  const today=new Date().toLocaleDateString('en-CA')
  return <section className="mb-6 rounded-xl border border-teal-100 bg-white p-4"><div className="flex justify-between mb-3"><h3 className="font-bold text-gray-900">My assigned outcomes</h3><Link className="text-sm font-semibold text-teal-700" to="/next" onClick={onNavigate}>Open Next →</Link></div>
    {error&&<p role="alert" className="text-red-700 text-sm mb-3">{error}</p>}
    {!items.length&&!error&&<p className="text-sm text-gray-500 py-4">No open outcomes assigned to you.</p>}
    <div className="space-y-2">{items.map(item=><div key={`${item.journeyId}-${item.outcome.id}`} className="flex gap-3 items-start p-3 rounded-lg bg-slate-50">
      <input type="checkbox" aria-label={`Complete ${item.outcome.name}`} checked={false} disabled={!canWrite||!!busy||item.outcome.gateway} onChange={()=>void complete(item)} className="mt-1 accent-teal-700"/>
      <Link to={`/next/${item.journeyId}?phase=${item.phaseId}&outcome=${item.outcome.id}#outcome-${item.outcome.id}`} onClick={onNavigate} className="flex-1 min-w-0"><strong className="text-sm text-gray-900">{item.outcome.name}</strong><p className="text-xs text-gray-500 mt-1">{item.journeyName}</p></Link>
      {item.outcome.dueDate&&<span className={`text-xs ${item.outcome.dueDate<today?'text-red-700 font-bold':'text-gray-500'}`}>{item.outcome.dueDate<today?'Overdue · ':''}{item.outcome.dueDate}</span>}
    </div>)}</div>
  </section>
}
