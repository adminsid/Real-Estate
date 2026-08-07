import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Target, CheckCircle2, Circle, ArrowRight, TrendingUp, Award,
  Phone, Home, Key, ArrowLeftRight, ShieldCheck, Zap
} from 'lucide-react'
import { useWorkspace, type OperationalMode } from '@/context/WorkspaceContext'

interface HabitTask {
  id: string
  text: string
  actionLabel: string
  actionUrl: string
}

const HABITS_BY_MODE: Record<OperationalMode, { title: string; subtitle: string; tasks: HabitTask[] }> = {
  prospecting: {
    title: 'Prospecting & Lead Generation Focus',
    subtitle: 'Daily habit goal: 5 Contacts & 1 New CRM Lead to reach your $175K annual GCI target.',
    tasks: [
      { id: 'p1', text: 'Log 5 Lead Outreach Calls or Messages', actionLabel: 'Open CRM', actionUrl: '/marketing/crm' },
      { id: 'p2', text: 'Send 2 Overdue Follow-up Emails', actionLabel: 'View Follow-ups', actionUrl: '/marketing/crm?lead_stage=overdue' },
      { id: 'p3', text: 'Add 1 New Prospect to CRM Database', actionLabel: 'Add Contact', actionUrl: '/marketing/crm' },
      { id: 'p4', text: 'Share 1 Listing Landing Page on Social Media', actionLabel: 'Inventory', actionUrl: '/inventory' },
    ],
  },
  listing: {
    title: 'Listing Agent Operating Focus',
    subtitle: 'Keep inventory updated, check listing inputs, and update seller clients.',
    tasks: [
      { id: 'l1', text: 'Review Active Listing Analytics & Inquiries', actionLabel: 'Listings', actionUrl: '/inventory' },
      { id: 'l2', text: 'Check Pending Listing Approvals', actionLabel: 'Listing Input', actionUrl: '/inventory' },
      { id: 'l3', text: 'Send Weekly Seller Market Report', actionLabel: 'CRM', actionUrl: '/marketing/crm' },
      { id: 'l4', text: 'Schedule Upcoming Open House Event', actionLabel: 'Open House', actionUrl: '/marketing/openhouses' },
    ],
  },
  buyer: {
    title: 'Buyer Agent Operating Focus',
    subtitle: 'Match buyer criteria with new MLS inventory and schedule property showings.',
    tasks: [
      { id: 'b1', text: 'Review New MLS Listings matching Buyer criteria', actionLabel: 'MLS Search', actionUrl: '/inventory' },
      { id: 'b2', text: 'Schedule 2 Property Showings for Buyers', actionLabel: 'Calendar', actionUrl: '/transactions/pipeline' },
      { id: 'b3', text: 'Follow up on pre-approval status with Lenders', actionLabel: 'CRM Leads', actionUrl: '/marketing/crm' },
      { id: 'b4', text: 'Draft or review Buyer Representation Agreements', actionLabel: 'Deals Pipeline', actionUrl: '/transactions/pipeline' },
    ],
  },
  transaction: {
    title: 'Transaction & Closing Pipeline Focus',
    subtitle: 'Track milestone deadlines, escrow deposits, attorney reviews, and contingencies.',
    tasks: [
      { id: 't1', text: 'Verify Inspection & Appraisal Contingency Deadlines', actionLabel: 'Deals Pipeline', actionUrl: '/transactions/pipeline' },
      { id: 't2', text: 'Confirm Title & Escrow Deposit Verification', actionLabel: 'View Deals', actionUrl: '/transactions/pipeline' },
      { id: 't3', text: 'Send Deal Status Update to Buyer/Seller & Attorney', actionLabel: 'Deal Details', actionUrl: '/transactions/pipeline' },
      { id: 't4', text: 'Review Closing Settlement Statements', actionLabel: 'Transactions', actionUrl: '/transactions/pipeline' },
    ],
  },
  compliance: {
    title: 'NY State Regulatory & Audit Focus',
    subtitle: 'Ensure Fair Housing compliance, NY Article 12-A disclosures, and signed documents.',
    tasks: [
      { id: 'c1', text: 'Verify NYS Fair Housing Notice disclosures on listings', actionLabel: 'Inventory Audit', actionUrl: '/inventory' },
      { id: 'c2', text: 'Check Signed Agency Disclosure (Form 175-a) for active clients', actionLabel: 'CRM Contacts', actionUrl: '/marketing/crm' },
      { id: 'c3', text: 'Audit Commission Agreement & Disclosure Records', actionLabel: 'Transactions', actionUrl: '/transactions/pipeline' },
      { id: 'c4', text: 'Verify Property Condition Disclosure Statements (PCDS)', actionLabel: 'Documents', actionUrl: '/transactions/pipeline' },
    ],
  }
}

const MODES: Array<{ id: OperationalMode; label: string; icon: React.ElementType; color: string }> = [
  { id: 'prospecting', label: 'Prospecting', icon: Phone, color: 'bg-violet-600' },
  { id: 'listing', label: 'Listing Agent', icon: Home, color: 'bg-emerald-600' },
  { id: 'buyer', label: 'Buyer Agent', icon: Key, color: 'bg-sky-600' },
  { id: 'transaction', label: 'Transaction', icon: ArrowLeftRight, color: 'bg-blue-600' },
  { id: 'compliance', label: 'Compliance', icon: ShieldCheck, color: 'bg-orange-600' },
]

export function WorkflowHabitEngine({ activePipelineVolume = 0 }: { activePipelineVolume?: number }) {
  const { operationalMode, setOperationalMode } = useWorkspace()
  const currentMode: OperationalMode = operationalMode || 'prospecting'

  const annualGoal = 175000 // Prime America Real Estate default annual GCI target
  const currentEstEarnings = Math.min(annualGoal, activePipelineVolume * 0.025 + 35000)
  const goalProgressPct = Math.round((currentEstEarnings / annualGoal) * 100)

  // Load completed tasks from localStorage for today
  const todayKey = `habits_completed_${new Date().toISOString().substring(0, 10)}_${currentMode}`
  const [completedIds, setCompletedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(todayKey)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      const saved = localStorage.getItem(todayKey)
      setCompletedIds(saved ? JSON.parse(saved) : [])
    } catch {
      setCompletedIds([])
    }
  }, [currentMode, todayKey])

  const toggleTask = (id: string) => {
    const next = completedIds.includes(id)
      ? completedIds.filter(i => i !== id)
      : [...completedIds, id]
    setCompletedIds(next)
    try {
      localStorage.setItem(todayKey, JSON.stringify(next))
    } catch {}
  }

  const modeInfo = HABITS_BY_MODE[currentMode]
  const completedCount = completedIds.length
  const totalCount = modeInfo.tasks.length
  const habitCompletionPct = Math.round((completedCount / totalCount) * 100)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6 shadow-sm">
      {/* ── Top Bar: Mode Selector & Annual Target ──────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-navy text-brand-gold flex items-center gap-1">
              <Target className="h-3 w-3" /> $175K Annual GCI Target
            </span>
            <span className="text-xs text-gray-500 font-semibold">Prime America Realtor Operating System</span>
          </div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            My Daily Habit & Workflow Guide
          </h3>
        </div>

        {/* Workflow Mode Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          {MODES.map((m) => {
            const Icon = m.icon
            const isSelected = currentMode === m.id
            return (
              <button
                key={m.id}
                onClick={() => setOperationalMode(m.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex-shrink-0 ${
                  isSelected
                    ? `${m.color} text-white shadow-sm ring-2 ring-black/10`
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Target Progress Banner ────────────────────────────────────── */}
      <div className="my-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* $175K Goal Progress Card */}
        <div className="rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Annual GCI Goal ($175,000)
            </span>
            <span className="text-xs font-extrabold text-blue-800">{goalProgressPct}% Achieved</span>
          </div>
          <div className="w-full bg-blue-200/60 rounded-full h-2.5 overflow-hidden mb-2">
            <div className="bg-blue-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, goalProgressPct)}%` }} />
          </div>
          <p className="text-xs text-blue-600 font-medium">
            Est. Commission Tracked: <strong>${Math.round(currentEstEarnings).toLocaleString()}</strong> / $175,000 target
          </p>
        </div>

        {/* Daily Habit Completion Card */}
        <div className="rounded-xl border border-emerald-100 bg-gradient-to-r from-emerald-50/80 to-teal-50/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide flex items-center gap-1">
              <Zap className="h-3.5 w-3.5" /> Today's Habits ({completedCount}/{totalCount})
            </span>
            <span className="text-xs font-extrabold text-emerald-800">{habitCompletionPct}%</span>
          </div>
          <div className="w-full bg-emerald-200/60 rounded-full h-2.5 overflow-hidden mb-2">
            <div className="bg-emerald-600 h-full rounded-full transition-all duration-500" style={{ width: `${habitCompletionPct}%` }} />
          </div>
          <p className="text-xs text-emerald-700 font-medium">
            {completedCount === totalCount ? '🎉 All habits completed for today!' : `${totalCount - completedCount} habit action(s) remaining for today`}
          </p>
        </div>

        {/* Realtor Formula Card */}
        <div className="rounded-xl border border-amber-100 bg-gradient-to-r from-amber-50/80 to-orange-50/80 p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1">
              <Award className="h-3.5 w-3.5 text-amber-600" /> Realtor Success Formula
            </span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-200/50 px-2 py-0.5 rounded-full">1 Deal / Mo</span>
          </div>
          <p className="text-xs text-amber-800 mt-1 leading-snug">
            $175K GCI requires ~<strong>12 deals/yr</strong> (~$7M sales volume @ 2.5%). Complete daily habits to generate 1 closed deal every month.
          </p>
        </div>
      </div>

      {/* ── Active Mode Task List ──────────────────────────────────────── */}
      <div className="bg-gray-50/70 rounded-xl p-4 border border-gray-200/70">
        <div className="mb-3">
          <h4 className="font-bold text-gray-900 text-sm">{modeInfo.title}</h4>
          <p className="text-xs text-gray-500 mt-0.5">{modeInfo.subtitle}</p>
        </div>

        <div className="space-y-2.5">
          {modeInfo.tasks.map((task) => {
            const isDone = completedIds.includes(task.id)
            return (
              <div
                key={task.id}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isDone
                    ? 'bg-emerald-50/60 border-emerald-200 text-gray-600'
                    : 'bg-white border-gray-200 hover:border-brand-navy/30'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    className="flex-shrink-0 focus:outline-none"
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 fill-emerald-100" />
                    ) : (
                      <Circle className="h-5 w-5 text-gray-400 hover:text-brand-navy" />
                    )}
                  </button>
                  <span className={`text-xs font-semibold truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                    {task.text}
                  </span>
                </div>

                <Link
                  to={task.actionUrl}
                  className="flex-shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-navy/5 text-brand-navy hover:bg-brand-navy hover:text-white text-xs font-bold transition-all ml-2"
                >
                  {task.actionLabel}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
