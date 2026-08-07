import { useState } from 'react'
import { Layout } from '@/components/layout/Layout'
import { TransactionProvider, useTransactionDetail } from '@/components/transactions/TransactionContext'
import { TransactionHeader } from '@/components/transactions/TransactionHeader'
import { TransactionLeftPanel } from '@/components/transactions/TransactionLeftPanel'
import { TransactionTasksTab } from '@/components/transactions/TransactionTasksTab'
import { TransactionDocumentsTab } from '@/components/transactions/TransactionDocumentsTab'
import { TransactionOffersTab } from '@/components/transactions/TransactionOffersTab'
import { TransactionOutcomesTab } from '@/components/transactions/TransactionOutcomesTab'
import { TransactionTimelineTab } from '@/components/transactions/TransactionTimelineTab'
import { TransactionCalendarTab } from '@/components/transactions/TransactionCalendarTab'
import { TransactionSettingsTab } from '@/components/transactions/TransactionSettingsTab'
import { TransactionDealOutline } from '@/components/transactions/TransactionDealOutline'
import { EditDetailsModal, LockConfirmModal, EmailPartiesModal } from '@/components/transactions/TransactionModals'
import { TransactionOutlineModal } from '@/components/transactions/TransactionOutlineModal'
import { SkeletonBlock, SkeletonCard } from '@/components/common/SkeletonLoader'
import { StageGateModal } from '@/components/transactions/StageGateModal'
import clsx from 'clsx'

function TransactionDetailContent() {
  const {
    id,
    data,
    isLoading,
    fetchTransaction
  } = useTransactionDetail()

  const [mainTab, setMainTab] = useState<'tasks' | 'documents' | 'offers' | 'calendar' | 'outcomes' | 'timeline' | 'settings'>('tasks')

  // Modal states
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isOutlineEditOpen, setIsOutlineEditOpen] = useState(false)
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [stageGateTarget, setStageGateTarget] = useState<string | null>(null)

  // Shared email variables
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([])

  if (isLoading) {
    return (
      <Layout>
        <div className="flex-1 p-6 space-y-5 max-w-5xl mx-auto">
          <div className="flex items-center gap-4 mb-2">
            <SkeletonBlock width="w-8" height="h-8" />
            <SkeletonBlock width="w-64" height="h-7" />
            <div className="ml-auto flex gap-2">
              <SkeletonBlock width="w-24" height="h-9" />
              <SkeletonBlock width="w-24" height="h-9" />
            </div>
          </div>
          <SkeletonBlock width="w-full" height="h-14" className="rounded-xl" />
          <div className="flex gap-3">
            {[...Array(6)].map((_, i) => <SkeletonBlock key={i} width="w-24" height="h-9" />)}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={4} />
          </div>
          <SkeletonCard lines={5} />
        </div>
      </Layout>
    )
  }

  if (!data || !data.transaction) {
    return (
      <Layout>
        <div className="text-center py-20 text-gray-500">Transaction not found.</div>
      </Layout>
    )
  }

  const { transaction: tx, parties = [], tasks = [] } = data

  const tabItems = [
    { key: 'tasks', label: 'Tasks', badge: tasks.length },
    { key: 'documents', label: 'Documents', badge: data.documents?.length || 0 },
    { key: 'offers', label: 'Offers', badge: 0 },
    { key: 'calendar', label: 'Calendar View', badge: 0 },
    { key: 'outcomes', label: 'Outcomes Log', badge: data.outcomes?.length || 0 },
    { key: 'timeline', label: 'Timeline', badge: 0 },
    { key: 'settings', label: 'Settings', badge: 0 },
  ] as const

  return (
    <Layout title={tx.name}>
      {/* Print custom stylesheet */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          @page {
            size: portrait;
            margin: 12mm;
          }
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }
          body.print-active-deal-sheet * {
            visibility: hidden !important;
          }
          body.print-active-deal-sheet #printable-deal-sheet,
          body.print-active-deal-sheet #printable-deal-sheet * {
            visibility: visible !important;
          }
          body.print-active-deal-sheet #printable-deal-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            display: block !important;
            font-family: Georgia, serif !important;
            color: black !important;
            background: white !important;
            font-size: 11px !important;
            line-height: 1.4 !important;
          }
          #printable-deal-sheet div, #printable-deal-sheet section {
            page-break-inside: avoid !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

      <TransactionHeader
        setIsEditOpen={setIsEditOpen}
        setStageGateTarget={setStageGateTarget}
        setEmailModalOpen={setEmailModalOpen}
        setEmailSubject={setEmailSubject}
        setEmailBody={setEmailBody}
        setSelectedRecipients={setSelectedRecipients}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print-grid mt-4">
        {/* Left Column: Details & Collapsibles */}
        <TransactionLeftPanel setIsOutlineEditOpen={setIsOutlineEditOpen} />

        {/* Right Column: Tabbed Content */}
        <div className="lg:col-span-2 space-y-4 print-full-width">
          {/* Tabs Navigation */}
          <div className="flex border-b border-gray-200 bg-white rounded-xl shadow-sm p-1.5 gap-1 overflow-x-auto no-print">
            {tabItems.map((item) => {
              const isActive = mainTab === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => setMainTab(item.key)}
                  className={clsx(
                    "flex-1 min-w-[80px] text-center py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap",
                    isActive ? "bg-blue-600 text-white shadow-md" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                  )}
                >
                  <span>{item.label}</span>
                  {item.badge > 0 && (
                    <span className={clsx(
                      "inline-flex items-center justify-center rounded-full text-[10px] font-bold min-w-[16px] h-4 px-1",
                      isActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                    )}>
                      {item.badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Active Tab Panel */}
          {mainTab === 'tasks' && <TransactionTasksTab />}
          {mainTab === 'documents' && <TransactionDocumentsTab />}
          {mainTab === 'offers' && <TransactionOffersTab />}
          {mainTab === 'calendar' && <TransactionCalendarTab />}
          {mainTab === 'outcomes' && <TransactionOutcomesTab />}
          {mainTab === 'timeline' && <TransactionTimelineTab />}
          {mainTab === 'settings' && <TransactionSettingsTab setLockConfirmOpen={setIsEditOpen} />}
        </div>
      </div>

      {/* Hidden printable deal outline element */}
      <TransactionDealOutline transactionId={id || ''} parties={parties} />

      {/* Modals & Overlays */}
      <EditDetailsModal isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} />
      <TransactionOutlineModal isOpen={isOutlineEditOpen} onClose={() => setIsOutlineEditOpen(false)} />
      <LockConfirmModal isOpen={lockConfirmOpen} onClose={() => setLockConfirmOpen(false)} />
      <EmailPartiesModal
        isOpen={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        emailSubject={emailSubject}
        setEmailSubject={setEmailSubject}
        emailBody={emailBody}
        setEmailBody={setEmailBody}
        selectedRecipients={selectedRecipients}
        setSelectedRecipients={setSelectedRecipients}
      />

      {stageGateTarget && (
        <StageGateModal
          isOpen={!!stageGateTarget}
          targetStage={stageGateTarget}
          transactionName={tx.name}
          initialValues={{
            escrowDate: tx.escrow_date || '',
            inspectionDeadline: tx.inspection_deadline || '',
            appraisalDate: tx.appraisal_date || '',
          }}
          onClose={() => setStageGateTarget(null)}
          onSubmit={async (milestones) => {
            try {
              const res = await fetch(`/api/transactions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  status: stageGateTarget,
                  escrow_date: milestones.escrowDate || null,
                  inspection_deadline: milestones.inspectionDeadline || null,
                  appraisal_date: milestones.appraisalDate || null,
                })
              })
              if (res.ok) {
                setStageGateTarget(null)
                fetchTransaction()
              } else {
                const d = await res.json()
                alert(d.error || 'Failed to update status')
              }
            } catch (err) { console.error(err) }
          }}
        />
      )}
    </Layout>
  )
}

export function TransactionDetailPage() {
  return (
    <TransactionProvider>
      <TransactionDetailContent />
    </TransactionProvider>
  )
}
