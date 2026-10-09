import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useTransactionDetail } from './TransactionContext'
import { Plus, Trash2, Printer, X, Loader2, FileText, AlertCircle } from 'lucide-react'
import clsx from 'clsx'
import { getLocalDateString } from '@/utils/date'

function AutocompleteInput({
  placeholder,
  value,
  onChange,
  onSelect,
  contacts,
}: {
  placeholder: string
  value: string
  onChange: (val: string) => void
  onSelect: (contact: any) => void
  contacts: any[]
}) {
  const [showDropdown, setShowDropdown] = useState(false)

  const matches = useMemo(() => {
    const q = (value || '').trim().toLowerCase()
    if (q.length < 2) return []
    return contacts.filter((c) => {
      const name = (c.name || c.first_name || '').toLowerCase()
      const comp = (c.company || c.firm || '').toLowerCase()
      const email = (c.email || '').toLowerCase()
      return name.includes(q) || comp.includes(q) || email.includes(q)
    })
  }, [value, contacts])

  return (
    <div className="relative">
      <input
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setShowDropdown(true)
        }}
        onFocus={() => setShowDropdown(true)}
        className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
      />
      {showDropdown && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-40 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
          {matches.map((c) => (
            <button
              key={c.id || c.name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                onSelect(c)
                setShowDropdown(false)
              }}
              className="w-full text-left px-2.5 py-1.5 hover:bg-blue-50 rounded-lg text-xs flex flex-col transition-colors"
            >
              <span className="font-semibold text-gray-800">{c.name || `${c.first_name} ${c.last_name}`}</span>
              <span className="text-[10px] text-gray-500">{c.company || c.firm || c.email || c.phone || 'Network Contact'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const getAbsoluteUrl = (url?: string) => {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
}

const fmtMoney = (v: any) => {
  if (v === undefined || v === null || v === '') return ''
  const n = Number(v)
  if (Number.isNaN(n)) return ''
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const fmtDateMDY = (v: any) => {
  if (!v) return ''
  const s = String(v).trim()
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`
  return s
}

const blankIfEmpty = (v: any) => {
  if (v === undefined || v === null) return ''
  const s = String(v).trim()
  if (s === '' || s === '0' || s.toUpperCase() === 'TBD') return ''
  return String(v)
}

const calcCashClosing = (p: any, c: any, m: any) => Math.max(0, Number(p || 0) - Number(c || 0) - Number(m || 0))

export function TransactionOffersTab() {
  const { user, branding } = useAuth()
  const {
    id,
    data,
    offers,
    fetchOffers,
    handleSaveOffer,
    handleUpdateDetails,
    networkContacts,
    networkAttorneys,
    networkLenders,
    directoryUsers
  } = useTransactionDetail() as any

  const { transaction: tx } = data
  const isBrokerOrAdmin = user && ['admin', 'broker'].includes(user.role)
  const isLocked = tx.is_locked === 1
  const canEdit = !isLocked || isBrokerOrAdmin
  const logoSrc = branding?.logoUrl ? getAbsoluteUrl(branding.logoUrl) : null

  // Offers tab component states
  const [showCreateOfferModal, setShowCreateOfferModal] = useState(false)
  const [showPrintOfferModal, setShowPrintOfferModal] = useState(false)
  const [selectedOffer, setSelectedOffer] = useState<any>(null)
  const [showDocuSignModal, setShowDocuSignModal] = useState(false)
  const [docuSignStep, setDocuSignStep] = useState<'prepare' | 'signing' | 'completed'>('prepare')
  const [signerEmail, setSignerEmail] = useState('')
  const [signerName, setSignerName] = useState('')
  const [isSigningAdopted, setIsSigningAdopted] = useState(false)
  const [isSubmittingSignature, setIsSubmittingSignature] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')

  // Independent fetch of outline fields for print letterhead purposes
  const [outlineFields, setOutlineFields] = useState<any>({})
  useEffect(() => {
    async function loadOutline() {
      try {
        const res = await fetch(`/api/transactions/${id}`)
        const json = await res.json()
        if (json.success && json.data.transaction.parties_involved) {
          const pi = json.data.transaction.parties_involved
          if (pi.startsWith('{')) setOutlineFields(JSON.parse(pi))
        }
      } catch { /* Ignore unavailable outline data. */ }
    }
    loadOutline()
  }, [id])

  const [offerForm, setOfferForm] = useState<any>({
    offerType: 'sales_agreement',
    offerDate: getLocalDateString(),
    purchaserName: '',
    purchaserAddress: '',
    sellerName: '',
    sellerAddress: '',
    propertyAddress: '',
    purchasePrice: 0,
    downPaymentAmount: 0,
    downPaymentPercent: 50,
    mortgageAmount: 0,
    cashOnClosing: 0,
    depositReceiptAmount: '',
    closingDate: 'Within 45 days (or as mutually agreed upon)',
    contingencies: 'To be delivered vacant and subject to home inspection within 10 days.',
    personalProperty: 'To be agreed upon at formal contract.',
    occupancyTerms: '',
    inspectionDate: '',
    possessionDate: '',
    loanOfficerName: '',
    loanOfficerCompany: '',
    loanOfficerPhone: '',
    loanOfficerEmail: '',
    loanOfficerAddress: '',
    attorneyName: '',
    attorneyFirm: '',
    attorneyPhone: '',
    attorneyEmail: '',
    attorneyAddress: '',
    buyerAgentName: '',
    sellerAgentName: '',
    sellerAgentTel: '',
    buyerBrokerCommission: '2% of purchase price, payable to Prime America Real Estate upon closing.',
    status: 'pending'
  })

  const getBuyersList = () => {
    const list: any[] = []
    if (outlineFields.buyerName) list.push({ name: outlineFields.buyerName, address: outlineFields.buyerAddress, email: outlineFields.buyerEmail, phone: outlineFields.buyerPhone })
    return list
  }

  const getSellersList = () => {
    const list: any[] = []
    if (outlineFields.sellerName) list.push({ name: outlineFields.sellerName, address: outlineFields.sellerAddress, email: outlineFields.sellerEmail, phone: outlineFields.sellerPhone })
    return list
  }

  const handleOpenCreateOfferModal = () => {
    const buyers = getBuyersList()
    const sellers = getSellersList()
    const defaultPrice = Number(tx?.price || outlineFields?.sellingPrice || 2000000)
    const defaultDown = Math.round(defaultPrice * 0.50)
    const defaultMortgage = Math.max(0, defaultPrice - defaultDown)
    const dirAgent = (directoryUsers || []).find((u: any) =>
      (u?.name && outlineFields?.listingAgentName && u.name === outlineFields.listingAgentName) ||
      (tx?.agent_name && u?.name === tx.agent_name)
    ) || (directoryUsers || [])[0]
    const resolvedSellerAgentName = outlineFields?.listingAgentName || (tx as any)?.listingAgentName || (tx as any)?.agent_name || dirAgent?.name || ''
    const resolvedSellerAgentTel = outlineFields?.listingAgentCell || (tx as any)?.listingAgentPhone || (tx as any)?.agent_phone || dirAgent?.phone || ''

    setOfferForm({
      id: `offer_${Date.now()}`,
      offerType: 'sales_agreement',
      offerDate: getLocalDateString(),
      purchaserName: buyers[0]?.name || outlineFields?.buyerName || '',
      purchaserAddress: buyers[0]?.address || outlineFields?.buyerAddress || '',
      sellerName: sellers[0]?.name || outlineFields?.sellerName || '',
      sellerAddress: sellers[0]?.address || outlineFields?.sellerAddress || '',
      propertyAddress: tx?.propertyAddress || tx?.name || '',
      purchasePrice: defaultPrice,
      depositReceiptAmount: '',
      downPaymentAmount: defaultDown,
      downPaymentPercent: 50,
      mortgageAmount: defaultMortgage,
      cashOnClosing: 0,
      cashClosingManuallyEdited: false,
      closingDate: 'Within 45 days (or as mutually agreed upon)',
      contingencies: 'To be delivered vacant and subject to home inspection within 10 days.',
      personalProperty: outlineFields?.personalProperty || 'To be agreed upon at formal contract.',
      occupancyTerms: outlineFields?.possessionTerms || '',
      loanOfficerName: outlineFields?.loanOfficerName || '',
      loanOfficerCompany: outlineFields?.financeInstitute || '',
      loanOfficerPhone: outlineFields?.loanOfficerPhone || '',
      loanOfficerEmail: outlineFields?.loanOfficerEmail || '',
      loanOfficerAddress: outlineFields?.mortgageOfficerAddress || '',
      attorneyName: outlineFields?.buyerAttorneyName || '',
      attorneyFirm: outlineFields?.buyerAttorneyFirm || '',
      attorneyPhone: outlineFields?.buyerAttorneyPhone || '',
      attorneyEmail: outlineFields?.buyerAttorneyEmail || '',
      attorneyAddress: outlineFields?.buyerAttorneyAddress || '',
      buyerAgentName: user?.name || '',
      sellerAgentName: resolvedSellerAgentName,
      sellerAgentTel: resolvedSellerAgentTel,
      buyerBrokerCommission: 'Seller to pay Buyer Broker 2% of purchase price, payable to Prime America Real Estate upon closing.',
      possessionDate: tx?.possession_date || getLocalDateString(new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)),
      status: 'pending'
    })
    setShowCreateOfferModal(true)
  }

  const handlePrintOfferDocument = (off: any) => {
    const isSalesAgreement = off.offerType === 'sales_agreement'
    const fileTitle = `${isSalesAgreement ? 'Sales_Agreement' : 'Letter_of_Intent'}_${(off.purchaserName || 'Purchaser').replace(/\s+/g, '_')}`

    // Use visibility:hidden on body + visibility:visible on the target.
    // Unlike display:none, visibility propagates through the tree and CAN be
    // selectively overridden on a child regardless of nesting depth, so the
    // document renders with the full Tailwind stylesheet already loaded.
    const styleId = '__offer-print-style__'
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }

    const pageMargin = isSalesAgreement ? '6mm 10mm' : '10mm 12mm'

    styleEl.textContent = `
      @media print {
        @page {
          size: letter portrait;
          margin: ${pageMargin};
        }
        /* Make everything invisible without removing it from layout */
        body {
          visibility: hidden !important;
          background: #ffffff !important;
        }
        /* Make the document and ALL its descendants visible */
        #printable-offer-document {
          visibility: visible !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          margin: 0 !important;
          background: #ffffff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          overflow: visible !important;
        }
        #printable-offer-document * {
          visibility: visible !important;
        }
        /* Page break control */
        #printable-sales-agreement,
        #printable-loi-agreement {
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
      }
    `

    // Set the document title for the print dialog filename
    const prevTitle = document.title
    document.title = fileTitle

    window.print()

    // Restore title and remove the injected style
    document.title = prevTitle
    if (styleEl && styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl)
    }
  }

  const handleDeleteOffer = async (offerId: string) => {
    if (!confirm('Are you sure you want to delete this offer?')) return
    try {
      const res = await fetch(`/api/transactions/${id}/offers/${offerId}`, { method: 'DELETE' })
      if (res.ok) fetchOffers()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <h3 className="font-bold text-gray-900">Official Offers</h3>
          <p className="text-xs text-gray-500">Track and generate letterhead offers for this transaction.</p>
        </div>
        <button
          onClick={handleOpenCreateOfferModal}
          disabled={!canEdit}
          className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-sm disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> New Offer
        </button>
      </div>

      {offers.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">No offers logged yet.</p>
      ) : (
        <div className="space-y-3">
          {offers.map((off: any) => (
            <div key={off.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-150 bg-gray-50/50">
              <div>
                <p className="font-bold text-gray-800 text-sm">
                  {off.purchaserName || 'Purchaser'} Offer — ${Number(off.purchasePrice || 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Type: {off.offerType === 'sales_agreement' ? 'Sales Agreement' : 'LOI'} • Date: {off.offerDate}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => { setSelectedOffer(off); setShowPrintOfferModal(true) }}
                  className="inline-flex items-center gap-1 text-xs font-semibold bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg"
                >
                  <Printer className="h-3.5 w-3.5" /> View / Print
                </button>

                {/* Accept Offer Action */}
                {off.status !== 'accepted' ? (
                  <button
                    onClick={async () => {
                      if (!confirm('Are you sure you want to accept this offer? Contract execution remains a separate step.')) return
                      const updatedOffer = { ...off, status: 'accepted' }
                      await handleSaveOffer(updatedOffer)
                      await handleUpdateDetails({
                        status: tx.status === 'lead' ? 'offer_received' : tx.status,
                        offer_accepted_date: off.offerDate || new Date().toISOString().slice(0, 10),
                        offer_date: off.offerDate || null,
                        pending_date: off.offerDate || null,
                        home_inspection_date: off.inspectionDate || null,
                        inspection_deadline: off.inspectionDeadline || null,
                        appraisal_date: off.appraisalDeadline || null,
                        possession_date: off.possessionDate || null,
                        escrow_date: off.escrowDate || null
                      })
                      alert('Offer accepted. Confirm the executed contract separately in Financials.')
                      fetchOffers()
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg"
                  >
                    Accept & Sync
                  </button>
                ) : (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                    Accepted ✓
                  </span>
                )}

                {/* DocuSign Action */}
                {!off.isSigned ? (
                  <button
                    onClick={() => {
                      setSelectedOffer(off)
                      setSignerName(off.purchaserName || '')
                      setSignerEmail(outlineFields?.buyerEmail || '')
                      setDocuSignStep('prepare')
                      setIsSigningAdopted(false)
                      setShowDocuSignModal(true)
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg"
                  >
                    🖋️ DocuSign
                  </button>
                ) : (
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg" title={`Signed by ${off.signerName} (${off.signerEmail})`}>
                    Signed ✓
                  </span>
                )}

                <button
                  onClick={() => handleDeleteOffer(off.id)}
                  className="p-2 text-gray-400 hover:text-red-600 rounded-lg animate-pulse"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE OFFER MODAL */}
      {showCreateOfferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-900 text-sm">Create Offer Document</h3>
              <button onClick={() => setShowCreateOfferModal(false)} className="text-gray-400">✕</button>
            </div>

            {generateError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{generateError}</span>
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setIsGenerating(true)
                setGenerateError('')
                try {
                  const saved = await handleSaveOffer(offerForm)
                  if (saved) {
                    setSelectedOffer(saved)
                    setShowCreateOfferModal(false)
                    setShowPrintOfferModal(true)
                  } else {
                    setGenerateError('Failed to generate offer. Please verify deal details.')
                  }
                } catch (err: any) {
                  setGenerateError(err.message || 'An error occurred while generating the offer.')
                } finally {
                  setIsGenerating(false)
                }
              }}
              className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs"
            >
              {/* Offer Type Selection */}
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5 uppercase">Document Format</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setOfferForm((f: any) => ({ ...f, offerType: 'sales_agreement' }))}
                    className={clsx(
                      "p-3 rounded-2xl border text-left font-bold transition-all",
                      offerForm.offerType === 'sales_agreement' ? "bg-amber-50 border-amber-400 text-amber-900 shadow-sm" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    <p className="text-xs">📄 Sales Agreement</p>
                    <p className="text-[10px] font-normal text-gray-500 mt-0.5">Submit directly to client sellers (Direct client sale)</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOfferForm((f: any) => ({ ...f, offerType: 'loi' }))}
                    className={clsx(
                      "p-3 rounded-2xl border text-left font-bold transition-all",
                      offerForm.offerType === 'loi' ? "bg-blue-50 border-blue-400 text-blue-900 shadow-sm" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                    )}
                  >
                    <p className="text-xs">📜 Letter of Intent (LOI)</p>
                    <p className="text-[10px] font-normal text-gray-500 mt-0.5">Submit to listing agent on another company (Co-Broke offer)</p>
                  </button>
                </div>
              </div>

              {/* Financial Terms: P = CashSigning + Mortgage + CashClosing; Receipt is memo-only */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Purchase Price ($)</label>
                  <input
                    type="number"
                    required
                    value={offerForm.purchasePrice}
                    onChange={(e) => {
                      const p = Number(e.target.value)
                      const dp = Math.round(p * ((offerForm.downPaymentPercent || 50) / 100))
                      const m = Number(offerForm.mortgageAmount || 0)
                      setOfferForm((f: any) => ({ ...f, purchasePrice: p, downPaymentAmount: dp, cashOnClosing: calcCashClosing(p, dp, m) }))
                    }}
                    className="w-full rounded-xl border border-gray-300 p-2 text-xs font-bold focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Receipt on Account ($)</label>
                  <input
                    type="number"
                    value={offerForm.depositReceiptAmount ?? ''}
                    onChange={(e) => setOfferForm((f: any) => ({ ...f, depositReceiptAmount: e.target.value === '' ? '' : Number(e.target.value) }))}
                    className="w-full rounded-xl border border-gray-300 p-2 text-xs font-bold focus:border-blue-500 focus:outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Cash on Signing ($) ({offerForm.downPaymentPercent || 0}%)</label>
                  <input
                    type="number"
                    required
                    value={offerForm.downPaymentAmount}
                    onChange={(e) => {
                      const dp = Number(e.target.value)
                      const pct = offerForm.purchasePrice ? Math.round((dp / offerForm.purchasePrice) * 100) : 0
                      setOfferForm((f: any) => ({ ...f, downPaymentAmount: dp, downPaymentPercent: pct, cashOnClosing: calcCashClosing(offerForm.purchasePrice, dp, offerForm.mortgageAmount) }))
                    }}
                    className="w-full rounded-xl border border-gray-300 p-2 text-xs font-bold focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Mortgage ($)</label>
                  <input
                    type="number"
                    value={offerForm.mortgageAmount}
                    onChange={(e) => setOfferForm((f: any) => ({ ...f, mortgageAmount: Number(e.target.value), cashOnClosing: calcCashClosing(offerForm.purchasePrice, offerForm.downPaymentAmount, Number(e.target.value)) }))}
                    className="w-full rounded-xl border border-gray-300 p-2 text-xs font-bold focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="font-bold text-gray-700 block mb-1">Cash on Closing Title ($)</label>
                  <input
                    type="number"
                    value={offerForm.cashOnClosing ?? 0}
                    onChange={(e) => {
                      const cc = Number(e.target.value)
                      setOfferForm((f: any) => ({ ...f, cashOnClosing: cc, mortgageAmount: Math.max(0, Number(f.purchasePrice || 0) - Number(f.downPaymentAmount || 0) - cc) }))
                    }}
                    className="w-full rounded-xl border border-gray-300 p-2 text-xs font-bold focus:border-blue-500 focus:outline-none"
                  />
                  {(Number(offerForm.downPaymentAmount || 0) + Number(offerForm.mortgageAmount || 0) > Number(offerForm.purchasePrice || 0)) && (
                    <p className="text-[10px] text-red-600 font-semibold mt-1">Cash signing + mortgage exceeds purchase price.</p>
                  )}
                </div>
              </div>

              {/* Parties & Addresses */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                <div className="space-y-2">
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Purchaser Name(s)</label>
                    <input
                      required
                      value={offerForm.purchaserName}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, purchaserName: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs font-bold focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Purchaser Address</label>
                    <input
                      value={offerForm.purchaserAddress || ''}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, purchaserAddress: e.target.value }))}
                      placeholder="e.g. 123 Main St, Flushing, NY 11354"
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Seller Name(s)</label>
                    <input
                      required
                      value={offerForm.sellerName}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, sellerName: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs font-bold focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Seller Address</label>
                    <input
                      value={offerForm.sellerAddress || ''}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, sellerAddress: e.target.value }))}
                      placeholder="e.g. 456 Oak Ave, Queens, NY 11379"
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Property Address</label>
                <input
                  required
                  value={offerForm.propertyAddress}
                  onChange={(e) => setOfferForm((f: any) => ({ ...f, propertyAddress: e.target.value }))}
                  className="w-full rounded-xl border border-gray-300 p-2 text-xs font-bold focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Offer Dates */}
              <div className="pt-2 border-t border-gray-100">
                <p className="font-bold text-gray-800 text-xs mb-2">Offer Dates</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Offer Date (Contract / Submission Date)</label>
                    <input
                      type="date"
                      value={offerForm.offerDate}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, offerDate: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Proposed Closing / Possession Date</label>
                    <input
                      type="date"
                      value={offerForm.possessionDate || ''}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, possessionDate: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Terms & Contingencies */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                 <div>
                   <label className="font-bold text-gray-700 block mb-1">Closing Terms</label>
                   <input
                     value={offerForm.closingDate}
                     onChange={(e) => setOfferForm((f: any) => ({ ...f, closingDate: e.target.value }))}
                     className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                   />
                 </div>
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Contingencies</label>
                    <input
                      value={offerForm.contingencies || ''}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, contingencies: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
               </div>

              {/* Property Terms */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                 <div>
                   <label className="font-bold text-gray-700 block mb-1">Personal Property</label>
                   <input
                     value={offerForm.personalProperty || ''}
                     onChange={(e) => setOfferForm((f: any) => ({ ...f, personalProperty: e.target.value }))}
                     placeholder="To be agreed upon at formal contract."
                     className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                   />
                 </div>
                 <div>
                   <label className="font-bold text-gray-700 block mb-1">Occupancy Terms</label>
                   <input
                     value={offerForm.occupancyTerms || ''}
                     onChange={(e) => setOfferForm((f: any) => ({ ...f, occupancyTerms: e.target.value }))}
                     placeholder="e.g. As-Is with all tenants in place."
                     className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                   />
                 </div>
              </div>

              {/* Financing Contact Info */}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                  <p className="font-bold text-gray-800 text-xs">Financing & Loan Officer Contact</p>
                  <div className="grid grid-cols-2 gap-3">
                    <AutocompleteInput
                      placeholder="Loan Officer Name"
                      value={offerForm.loanOfficerName || ''}
                      onChange={(v) => setOfferForm((f: any) => ({ ...f, loanOfficerName: v }))}
                      onSelect={(c) => setOfferForm((f: any) => ({
                        ...f,
                        loanOfficerName: c.name,
                        loanOfficerCompany: c.company || c.firm || 'Mortgage Lender',
                        loanOfficerPhone: c.phone || '',
                        loanOfficerEmail: c.email || '',
                      }))}
                      contacts={networkLenders.length ? networkLenders : networkContacts}
                    />
                    <input
                      placeholder="Company (e.g. LenJen Corp)"
                      value={offerForm.loanOfficerCompany || ''}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, loanOfficerCompany: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      placeholder="Phone"
                      value={offerForm.loanOfficerPhone || ''}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, loanOfficerPhone: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                    <input
                      placeholder="Email"
                      value={offerForm.loanOfficerEmail || ''}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, loanOfficerEmail: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Attorney Contact Info */}
                <div className="pt-2 border-t border-gray-100 space-y-4">
                  {/* Buyer Attorney */}
                  <div className="space-y-2">
                    <p className="font-bold text-gray-800 text-xs">Buyer Attorney Contact</p>
                    <div className="grid grid-cols-2 gap-3">
                      <AutocompleteInput
                        placeholder="Buyer Attorney Name"
                        value={offerForm.buyerAttorneyName || ''}
                        onChange={(v) => setOfferForm((f: any) => ({ ...f, buyerAttorneyName: v }))}
                        onSelect={(c) => setOfferForm((f: any) => ({
                          ...f,
                          buyerAttorneyName: c.name,
                          buyerAttorneyFirm: c.company || c.firm || 'Law Firm',
                          buyerAttorneyPhone: c.phone || '',
                          buyerAttorneyEmail: c.email || '',
                        }))}
                        contacts={networkAttorneys}
                      />
                      <AutocompleteInput
                        placeholder="Firm (e.g. Law Office Of John A. Colonna)"
                        value={offerForm.buyerAttorneyFirm || ''}
                        onChange={(v) => setOfferForm((f: any) => ({ ...f, buyerAttorneyFirm: v }))}
                        onSelect={(c) => setOfferForm((f: any) => ({
                          ...f,
                          buyerAttorneyName: c.name,
                          buyerAttorneyFirm: c.company || c.firm || 'Law Firm',
                          buyerAttorneyPhone: c.phone || '',
                          buyerAttorneyEmail: c.email || '',
                        }))}
                        contacts={networkAttorneys}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        placeholder="Phone"
                        value={offerForm.buyerAttorneyPhone || ''}
                        onChange={(e) => setOfferForm((f: any) => ({ ...f, buyerAttorneyPhone: e.target.value }))}
                        className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                      />
                      <input
                        placeholder="Email"
                        value={offerForm.buyerAttorneyEmail || ''}
                        onChange={(e) => setOfferForm((f: any) => ({ ...f, buyerAttorneyEmail: e.target.value }))}
                        className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Seller Attorney */}
                  <div className="space-y-2 pt-2 border-t border-gray-100">
                    <p className="font-bold text-gray-800 text-xs">Seller Attorney Contact</p>
                    <div className="grid grid-cols-2 gap-3">
                      <AutocompleteInput
                        placeholder="Seller Attorney Name"
                        value={offerForm.sellerAttorneyName || ''}
                        onChange={(v) => setOfferForm((f: any) => ({ ...f, sellerAttorneyName: v }))}
                        onSelect={(c) => setOfferForm((f: any) => ({
                          ...f,
                          sellerAttorneyName: c.name,
                          sellerAttorneyFirm: c.company || c.firm || 'Law Firm',
                          sellerAttorneyPhone: c.phone || '',
                          sellerAttorneyEmail: c.email || '',
                        }))}
                        contacts={networkAttorneys}
                      />
                      <AutocompleteInput
                        placeholder="Firm (e.g. Law Office LLP)"
                        value={offerForm.sellerAttorneyFirm || ''}
                        onChange={(v) => setOfferForm((f: any) => ({ ...f, sellerAttorneyFirm: v }))}
                        onSelect={(c) => setOfferForm((f: any) => ({
                          ...f,
                          sellerAttorneyName: c.name,
                          sellerAttorneyFirm: c.company || c.firm || 'Law Firm',
                          sellerAttorneyPhone: c.phone || '',
                          sellerAttorneyEmail: c.email || '',
                        }))}
                        contacts={networkAttorneys}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        placeholder="Phone"
                        value={offerForm.sellerAttorneyPhone || ''}
                        onChange={(e) => setOfferForm((f: any) => ({ ...f, sellerAttorneyPhone: e.target.value }))}
                        className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                      />
                      <input
                        placeholder="Email"
                        value={offerForm.sellerAttorneyEmail || ''}
                        onChange={(e) => setOfferForm((f: any) => ({ ...f, sellerAttorneyEmail: e.target.value }))}
                        className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Seller Agent */}
                  <div className="space-y-2 pt-2 border-t border-gray-100">
                    <p className="font-bold text-gray-800 text-xs">Seller Agent Contact</p>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        placeholder="Seller Agent Name"
                        value={offerForm.sellerAgentName || ''}
                        onChange={(e) => setOfferForm((f: any) => ({ ...f, sellerAgentName: e.target.value }))}
                        className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                      />
                      <input
                        placeholder="Seller Agent Tel"
                        value={offerForm.sellerAgentTel || ''}
                        onChange={(e) => setOfferForm((f: any) => ({ ...f, sellerAgentTel: e.target.value }))}
                        className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

              <button
                type="submit"
                disabled={isGenerating}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-2.5 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                {isGenerating ? 'Generating Offer Document...' : 'Generate Offer'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* PRINT OFFER DOCUMENT TEMPORARY CONTAINER FOR PRINTING */}
      {showPrintOfferModal && selectedOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden font-sans border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 no-print">
              <span className="text-xs font-bold text-gray-700">
                Official Document Preview: {selectedOffer.offerType === 'sales_agreement' ? 'Sales Agreement' : 'Letter of Intent / Purchase Offer'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrintOfferDocument(selectedOffer)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-sm flex items-center gap-1.5"
                >
                  <Printer className="h-4 w-4" /> Print / Save PDF
                </button>
                <button onClick={() => setShowPrintOfferModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-8 overflow-y-auto flex-1 bg-gray-100">
              <div id="printable-offer-document" className="border p-8 bg-white text-gray-900 text-xs leading-relaxed max-w-[800px] mx-auto shadow-sm">
                {selectedOffer.offerType === 'sales_agreement' ? (
                  /* SALES AGREEMENT DOCUMENT VIEW - MATCHED TO TEMPLATE */
                  <div id="printable-sales-agreement" className="bg-white text-gray-900 font-serif text-[9.5px] leading-snug max-w-[800px] mx-auto relative p-0">
                    {/* Top Decorative Header Swoosh Banner with Exact Brand Colors */}
                    <div className="relative w-full h-[52px] mb-2 overflow-visible">
                      <svg className="w-full h-[48px] block" viewBox="0 0 800 48" preserveAspectRatio="none">
                        <rect x="0" y="0" width="800" height="48" fill="#2a3f54" />
                        <path d="M 120 0 Q 320 48, 800 12 L 800 0 Z" fill="#b99306" />
                      </svg>
                      {/* Prime America Seal Actual Image */}
                      <div className="absolute top-[2px] left-4 z-10">
                        <img
                          src="/prime-america-seal.png"
                          alt="Prime America Real Estate"
                          className="w-[86px] h-[86px] object-contain drop-shadow-md rounded-full sales-agreement-seal"
                        />
                      </div>
                    </div>

                    {/* Title & Contact Info Header */}
                    <div className="flex justify-between items-start mb-2 px-6">
                      <div className="w-[86px] flex-shrink-0"></div>
                      <div className="flex-1 text-center">
                        <h1 className="text-lg font-bold tracking-wide uppercase font-serif text-gray-900 mt-0.5">SALES AGREEMENT</h1>
                      </div>
                      <div className="text-right text-[8.5px] text-gray-700 font-serif leading-tight">
                        <p>6123 Fresh Pond Road Queens, NY 11379</p>
                        <p>info@PrimeAmericaNY.com</p>
                        <p>PrimeAmericaNY.com</p>
                        <p>347-725-3142</p>
                      </div>
                    </div>

                    {/* Content Body */}
                    <div className="px-6 space-y-2">
                      {/* Date */}
                      <div className="flex items-end">
                        <span className="font-serif">Date:&nbsp;</span>
                        <span className="border-b border-gray-900 pb-0.5 inline-block w-48 text-center font-semibold">{fmtDateMDY(selectedOffer.offerDate)}</span>
                      </div>

                      {/* Purchaser & Seller */}
                      <div className="grid grid-cols-2 gap-x-8">
                        <div className="flex items-end">
                          <span className="whitespace-nowrap font-serif">Purchaser:&nbsp;</span>
                          <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1 font-semibold">{selectedOffer.purchaserName || ''}</span>
                        </div>
                        <div className="flex items-end">
                          <span className="whitespace-nowrap font-serif">Seller:&nbsp;</span>
                          <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1 font-semibold">{selectedOffer.sellerName || ''}</span>
                        </div>
                      </div>

                      {/* Address & Address */}
                      <div className="grid grid-cols-2 gap-x-8">
                        <div className="flex items-end">
                          <span className="whitespace-nowrap font-serif">Address:&nbsp;</span>
                          <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{selectedOffer.purchaserAddress || ''}</span>
                        </div>
                        <div className="flex items-end">
                          <span className="whitespace-nowrap font-serif">Address:&nbsp;</span>
                          <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{selectedOffer.sellerAddress || ''}</span>
                        </div>
                      </div>

                      {/* PROPERTY TO BE SOLD */}
                      <div className="pt-0.5">
                        <h3 className="font-bold text-[10px] uppercase text-gray-900 font-serif mb-0.5">PROPERTY TO BE SOLD</h3>
                        <p className="leading-snug">
                          The undersigned purchaser agrees to purchase and the undersigned seller agrees to sell the property known as and by street number{' '}
                          <span className="border-b border-gray-900 pb-0.5 inline-block w-[60%] px-1 font-bold">{selectedOffer.propertyAddress || ''}</span>
                        </p>
                        <p className="leading-snug mt-1">
                          Acknowledge the receipt of ${' '}
                          <span className="border-b border-gray-900 pb-0.5 inline-block w-36 text-center font-bold">
                            {blankIfEmpty(selectedOffer.depositReceiptAmount) === '' ? '' : fmtMoney(selectedOffer.depositReceiptAmount)}
                          </span>{' '}
                          as a deposit on account of the purchase price.
                        </p>
                      </div>

                      {/* PRICE AND TERMS */}
                      <div className="pt-0.5">
                        <h3 className="font-bold text-[10px] uppercase text-gray-900 font-serif mb-0.5">PRICE AND TERMS</h3>
                        <div className="space-y-1 max-w-xl">
                          <div className="flex justify-between items-end">
                            <span className="w-96">Purchase Price (Offer Amount)</span>
                            <div className="flex items-end gap-1 flex-1 max-w-[220px]">
                              <span className="font-semibold">$</span>
                              <span className="border-b border-gray-900 pb-0.5 flex-1 text-right font-bold pr-2">{fmtMoney(selectedOffer.purchasePrice)}</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-end">
                            <span className="w-96">Cash on signing more formal contract,Including the amount above</span>
                            <div className="flex items-end gap-1 flex-1 max-w-[220px]">
                              <span className="font-semibold">$</span>
                              <span className="border-b border-gray-900 pb-0.5 flex-1 text-right font-semibold pr-2">{fmtMoney(selectedOffer.downPaymentAmount)}</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-end">
                            <span className="w-96">Mortgage Amount.</span>
                            <div className="flex items-end gap-1 flex-1 max-w-[220px]">
                              <span className="font-semibold">$</span>
                              <span className="border-b border-gray-900 pb-0.5 flex-1 text-right font-semibold pr-2">{fmtMoney(selectedOffer.mortgageAmount)}</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-end">
                            <span className="w-96">Cash on closing title</span>
                            <div className="flex items-end gap-1 flex-1 max-w-[220px]">
                              <span className="font-semibold">$</span>
                              <span className="border-b border-gray-900 pb-0.5 flex-1 text-right font-bold pr-2">{fmtMoney(selectedOffer.cashOnClosing ?? (selectedOffer.purchasePrice ? Number(selectedOffer.purchasePrice) - Number(selectedOffer.downPaymentAmount || 0) - Number(selectedOffer.mortgageAmount || 0) : ''))}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* PERSONAL PROPERTY & OCCUPANCY */}
                      <div className="pt-0.5 space-y-1">
                        <p><strong>PERSONAL PROPERTY:</strong> {blankIfEmpty(selectedOffer.personalProperty) || 'To be agreed upon at formal contract.'}</p>
                        <div className="flex items-end">
                          <span className="whitespace-nowrap"><strong>OCCUPANCY:&nbsp;</strong></span>
                          <span className="border-b border-gray-900 pb-0.5 inline-block w-80 px-2">{blankIfEmpty(selectedOffer.occupancyTerms)}</span>
                        </div>
                      </div>

                      {/* MORTGAGE REQUIREMENTS */}
                      <div className="pt-0.5">
                        <h3 className="font-bold text-[10px] uppercase text-gray-900 font-serif mb-0.5">MORTGAGE REQUIREMENTS</h3>
                        <p className="text-justify leading-snug">
                          This agreement may be cancelled if purchaser is unable to obtain, at purchaser's expense, a first CONV/FHA/VA loan, approved by a lending institution in the sum of ${' '}
                          <span className="border-b border-gray-900 pb-0.5 inline-block w-28 text-center font-bold">{fmtMoney(selectedOffer.mortgageAmount)}</span>{' '}
                          (total mortgage amount) payable in equal monthly payments of principal and interest over 15/30 years with interest at the prevailing rate, within 45 days after signing of the formal contract. Purchaser agrees to sign any and all papers and documents and furnish all information required by the lending institution to obtain such mortgage loan.
                        </p>
                      </div>

                      {/* DATE FOR SETTLEMENT AND DELIVERY OF DEED */}
                      <div className="pt-0.5">
                        <h3 className="font-bold text-[10px] uppercase text-gray-900 font-serif mb-0.5">DATE FOR SETTLEMENT AND DELIVERY OF DEED</h3>
                        <p className="text-justify leading-snug">
                          The settlement of the obligations of the seller and purchaser under this agreement (closing of title) and the transfer, of the deed shall take place on or about 45 days from signing of formal contract at 10:00 (a.m.)at the office of the seller attorney, buyer attorney or bank attorney.
                        </p>
                      </div>

                      {/* ACCEPTANCE OF OFFER */}
                      <div className="pt-0.5">
                        <h3 className="font-bold text-[10px] uppercase text-gray-900 font-serif mb-0.5">ACCEPTANCE OF OFFER</h3>
                        <p className="text-justify leading-snug">
                          The above sum is accepted by the Broker with the understanding that the owner is not obligated by this agreement until such time as the owner agrees to be obligated by the terms of this agreement. If owner fails to agree to the terms of this agreement, said amount shall be refunded to purchaser. If owner does agree to the terms of this agreement, usual formal contract expressing the above terms and conditions, prepared by seller's attorney, shall be signed and exchanged by the seller and purchaser on or about 10 days from the acceptance of offer date.
                        </p>
                      </div>

                      {/* BROKER'S COMMISSION */}
                      <div className="pt-0.5">
                        <h3 className="font-bold text-[10px] uppercase text-gray-900 font-serif mb-0.5">BROKER'S COMMISSION</h3>
                        <p className="text-justify leading-snug">
                          The parties agree that Prime America Real Estate, Inc., Broker, brought about this sale, and seller agrees to pay Prime America Real Estate, Inc. a commission that is supplied in a separate commission agreement. The undersigned purchaser and seller agrees to the above terms and acknowledge receipt of a copy of this agreement.
                        </p>
                      </div>

                      {/* Bottom signatures table */}
                      <div className="pt-2 grid grid-cols-2 gap-x-8 text-[9px] font-serif leading-snug">
                        <div className="space-y-1">
                          <div className="flex items-end">
                            <span className="whitespace-nowrap font-serif"><strong>BUYER'S SIGN:&nbsp;</strong></span>
                            <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1 font-semibold">{selectedOffer.purchaserName || ''}</span>
                          </div>
                          <div className="flex items-end">
                            <span className="whitespace-nowrap font-serif"><strong>ATTORNEY'S NAME:&nbsp;</strong></span>
                            <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.buyerAttorneyName)}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-end">
                              <span className="whitespace-nowrap font-serif"><strong>TEL:&nbsp;</strong></span>
                              <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.buyerAttorneyPhone)}</span>
                            </div>
                            <div className="flex items-end">
                              <span className="whitespace-nowrap font-serif"><strong>EMAIL:&nbsp;</strong></span>
                              <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.buyerAttorneyEmail)}</span>
                            </div>
                          </div>
                          <div className="flex items-end">
                            <span className="whitespace-nowrap font-serif"><strong>MORTGAGE OFFICER'S NAME:&nbsp;</strong></span>
                            <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.loanOfficerName)}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-end">
                              <span className="whitespace-nowrap font-serif"><strong>TEL:&nbsp;</strong></span>
                              <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.loanOfficerPhone)}</span>
                            </div>
                            <div className="flex items-end">
                              <span className="whitespace-nowrap font-serif"><strong>EMAIL:&nbsp;</strong></span>
                              <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.loanOfficerEmail)}</span>
                            </div>
                          </div>
                          <div className="flex items-end">
                            <span className="whitespace-nowrap font-serif"><strong>MORTGAGE BANK/BANKER'S NAME:&nbsp;</strong></span>
                            <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.loanOfficerCompany)}</span>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-end">
                            <span className="whitespace-nowrap font-serif"><strong>SELLER'S SIGN:&nbsp;</strong></span>
                            <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px]"></span>
                          </div>
                          <div className="flex items-end">
                            <span className="whitespace-nowrap font-serif"><strong>SELLER'S AGENT:&nbsp;</strong></span>
                            <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.sellerAgentName)}</span>
                          </div>
                          <div className="flex items-end">
                            <span className="whitespace-nowrap font-serif"><strong>SELLER'S AGENT TEL:&nbsp;</strong></span>
                            <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.sellerAgentTel)}</span>
                          </div>
                          <div className="flex items-end">
                            <span className="whitespace-nowrap font-serif"><strong>ATTORNEY'S NAME:&nbsp;</strong></span>
                            <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.sellerAttorneyName)}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-end">
                              <span className="whitespace-nowrap font-serif"><strong>TEL:&nbsp;</strong></span>
                              <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.sellerAttorneyPhone)}</span>
                            </div>
                            <div className="flex items-end">
                              <span className="whitespace-nowrap font-serif"><strong>FAX:&nbsp;</strong></span>
                              <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.sellerAttorneyFax)}</span>
                            </div>
                          </div>
                          <div className="flex items-end">
                            <span className="whitespace-nowrap font-serif"><strong>EMAIL:&nbsp;</strong></span>
                            <span className="border-b border-gray-900 pb-0.5 flex-1 min-h-[16px] px-1">{blankIfEmpty(selectedOffer.sellerAttorneyEmail)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* LETTER OF INTENT DOCUMENT VIEW */
                  <div id="printable-loi-agreement" className="p-6 bg-white text-gray-900 font-sans leading-relaxed text-xs space-y-4 max-w-[800px] mx-auto">
                    <div className="flex flex-col items-center justify-center mb-6">
                      {logoSrc ? (
                        <img src={logoSrc} alt="Company Logo" className="h-16 w-auto object-contain max-h-16 mb-2 loi-logo" />
                      ) : (
                        <svg className="h-16 w-16 mb-2" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="48" fill="#0c1e2d" stroke="#b45309" strokeWidth="3" />
                          <circle cx="50" cy="50" r="42" fill="none" stroke="#b45309" strokeWidth="0.7" strokeDasharray="2 2" />
                          <text x="50" y="32" fill="#f59e0b" fontSize="6.5" fontWeight="bold" textAnchor="middle" letterSpacing="0.5">PRIME</text>
                          <text x="50" y="42" fill="#f59e0b" fontSize="6.5" fontWeight="bold" textAnchor="middle" letterSpacing="0.5">AMERICA</text>
                          <text x="50" y="70" fill="#f59e0b" fontSize="5.5" fontWeight="bold" textAnchor="middle">REAL ESTATE</text>
                          <path d="M42 58 L50 50 L58 58 L55 58 L55 64 L45 64 L45 58 Z" fill="#f59e0b" />
                        </svg>
                      )}
                      <h2 className="text-center font-bold text-sm tracking-wider uppercase text-gray-900 mt-2">LETTER OF INTENT TO PURCHASE PROPERTY</h2>
                    </div>

                    <p>Dear <strong>{selectedOffer.sellerName || 'Seller'}</strong>,</p>
                    <p>I am writing to formally present my offer to purchase your property located at<br />
                    <strong className="text-gray-900">{selectedOffer.propertyAddress}</strong>. After thorough evaluation, I am pleased to propose the following terms for your consideration:</p>

                    <ul className="space-y-1.5 pl-6 font-semibold text-gray-800">
                      <li className="flex items-center"><span className="w-4">•</span> <span className="w-36">Purchase Price:</span> <span>${Number(selectedOffer.purchasePrice || 0).toLocaleString()}</span></li>
                      <li className="flex items-center"><span className="w-4">•</span> <span className="w-36">Down Payment:</span> <span>${Number(selectedOffer.downPaymentAmount || 0).toLocaleString()} ({selectedOffer.downPaymentPercent || 50}%)</span></li>
                      <li className="flex items-center"><span className="w-4">•</span> <span className="w-36">Mortgage Amount:</span> <span>${Number(selectedOffer.mortgageAmount || 0).toLocaleString()}</span></li>
                      <li className="flex items-center"><span className="w-4">•</span> <span className="w-36">Closing Date:</span> <span>{selectedOffer.closingDate}</span></li>
                      <li className="flex items-center"><span className="w-4">•</span> <span className="w-36">Contingencies:</span> <span>{selectedOffer.contingencies}</span></li>
                    </ul>

                    <p className="leading-relaxed">I am fully committed to moving forward promptly and am flexible with the closing date to accommodate your schedule. My objective is to facilitate a smooth and seamless transaction for both parties.</p>

                    <p className="leading-relaxed">Please consider this offer favorably. Should it meet your expectations, or if you would like to discuss any aspect further, I would be more than happy to do so. I look forward to working together toward a successful sale.</p>

                    <p>Regarding my financing, kindly contact my Loan Officer, <strong>{selectedOffer.loanOfficerName || 'N/A'}</strong> at <strong>{selectedOffer.loanOfficerCompany || 'N/A'}</strong></p>
                    <ul className="space-y-1 pl-6 font-medium text-gray-800">
                      <li className="flex items-center"><span className="w-4">•</span> <span className="w-20">Phone:</span> <span>{selectedOffer.loanOfficerPhone || 'N/A'}</span></li>
                      <li className="flex items-center"><span className="w-4">•</span> <span className="w-20">Email:</span> <span>{selectedOffer.loanOfficerEmail || 'N/A'}</span></li>
                      <li className="flex items-center"><span className="w-4">•</span> <span className="w-20">Address:</span> <span>{selectedOffer.loanOfficerAddress || 'N/A'}</span></li>
                    </ul>

                    <p>For the legal aspects, please send the contract of sale to my attorney, <strong>{selectedOffer.attorneyName || 'N/A'}</strong> at <strong>{selectedOffer.attorneyFirm || 'N/A'}</strong></p>
                    <ul className="space-y-1 pl-6 font-medium text-gray-800">
                      <li className="flex items-center"><span className="w-4">•</span> <span className="w-20">Phone:</span> <span>{selectedOffer.attorneyPhone || 'N/A'}</span></li>
                      <li className="flex items-center"><span className="w-4">•</span> <span className="w-20">Email:</span> <span>{selectedOffer.attorneyEmail || 'N/A'}</span></li>
                      <li className="flex items-center"><span className="w-4">•</span> <span className="w-20">Address:</span> <span>{selectedOffer.attorneyAddress || 'N/A'}</span></li>
                    </ul>

                    <p className="leading-relaxed">Seller's Payment to Buyer Broker (if applicable): {selectedOffer.buyerBrokerCommission || 'Seller to pay Buyer Broker 2% of purchase price, payable to Prime America Real Estate upon closing.'}</p>
                    <p>Thank you for your time and consideration. I look forward to your positive response and to moving forward with this transaction.</p>

                    <p className="pt-2">Sincerely,</p>
                    <div className="pt-8 grid grid-cols-2 gap-8 text-xs font-bold border-t border-gray-300 mt-6">
                      <div>
                        <p className="border-b border-gray-400 pb-1">{selectedOffer.purchaserName || 'Surya Shrestha'}</p>
                        <p className="text-[10px] text-gray-500 font-normal mt-1">Purchaser Signature</p>
                      </div>
                      <div>
                        <p className="border-b border-gray-400 pb-1">Seller's Acknowledgment</p>
                        <p className="text-[10px] text-gray-500 font-normal mt-1">Date:</p>
                      </div>
                    </div>

                    {/* Bottom Footer Bar */}
                    <div className="mt-8 bg-slate-900 text-white text-[10px] py-2 px-4 text-center rounded-lg font-mono">
                      6123 Fresh Pond Rd, Queens, NY 11379 | 347-725-3142 | info@PrimeAmericaNY.com | www.PrimeAmericaNY.com
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-200 text-right flex gap-2 no-print">
              <button onClick={() => handlePrintOfferDocument(selectedOffer)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm">
                Print/Save PDF
              </button>
              <button onClick={() => setShowPrintOfferModal(false)} className="flex-1 border border-gray-300 bg-white hover:bg-gray-50 px-4 py-2.5 rounded-xl text-xs font-semibold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* DOCUSIGN MODAL */}
      {showDocuSignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* DocuSign Header */}
            <div className="bg-[#1e3a8a] text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-yellow-500 text-slate-900 rounded p-1.5 font-extrabold text-xs tracking-wider">
                  DocuSign
                </div>
                <div>
                  <h3 className="font-bold text-sm">Please Review & Sign Document</h3>
                  <p className="text-[10px] text-blue-200 font-mono">Envelope: docusign_{selectedOffer?.id || 'N/A'}</p>
                </div>
              </div>
              <button
                onClick={() => setShowDocuSignModal(false)}
                className="text-white/70 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Steps Container */}
            {docuSignStep === 'prepare' && (
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                <div className="border-b pb-3">
                  <h4 className="font-bold text-gray-900 text-sm">Prepare E-Signature Envelope</h4>
                  <p className="text-xs text-gray-500">Configure signer details to launch the DocuSign execution session.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Signer Name</label>
                    <input
                      type="text"
                      value={signerName}
                      onChange={(e) => setSignerName(e.target.value)}
                      placeholder="Full Name"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-xs focus:border-blue-500 focus:outline-none bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Signer Email</label>
                    <input
                      type="email"
                      value={signerEmail}
                      onChange={(e) => setSignerEmail(e.target.value)}
                      placeholder="Email Address"
                      className="w-full rounded-xl border border-gray-300 p-2.5 text-xs focus:border-blue-500 focus:outline-none bg-white"
                    />
                  </div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-900 space-y-1 text-xs">
                  <p className="font-bold">🖋️ Signing Roles</p>
                  <p className="text-[11px] text-amber-800">
                    By launching this session, a secure digital signature envelope is initialized. The purchaser ({signerName}) will be prompted to adopt a signature and stamp the contract.
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    onClick={() => setShowDocuSignModal(false)}
                    className="border border-gray-300 bg-white hover:bg-gray-50 px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!signerName.trim() || !signerEmail.trim()}
                    onClick={() => setDocuSignStep('signing')}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl font-bold text-xs shadow-sm disabled:opacity-50"
                  >
                    Start Signing Session
                  </button>
                </div>
              </div>
            )}

            {docuSignStep === 'signing' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* Yellow Instruction Bar */}
                <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2.5 text-xs text-yellow-800 font-semibold flex justify-between items-center flex-shrink-0">
                  <span>Please review the document below. Click on the yellow "SIGN" tag to apply your digital signature.</span>
                  {isSigningAdopted && (
                    <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                      Signature Placed ✓
                    </span>
                  )}
                </div>

                {/* Main Content Workspace */}
                <div className="flex-1 flex overflow-hidden">
                  {/* Left Sidebar */}
                  <div className="w-48 bg-gray-50 border-r p-4 space-y-4 hidden md:block">
                    <h5 className="font-bold text-[10px] uppercase text-gray-400">Pages</h5>
                    <div className="w-32 h-44 bg-white border shadow-sm p-2 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="w-full h-1 bg-gray-200"></div>
                        <div className="w-3/4 h-1 bg-gray-200"></div>
                        <div className="w-full h-1 bg-gray-200"></div>
                      </div>
                      <div className="border border-dashed border-blue-400 p-1 bg-blue-50/25 text-center">
                        <span className="text-[8px] font-bold text-blue-600 uppercase">Sign tag</span>
                      </div>
                    </div>
                  </div>

                  {/* Document Page Canvas */}
                  <div className="flex-1 bg-gray-100 p-6 overflow-y-auto flex justify-center">
                    <div className="w-full max-w-2xl bg-white shadow-md border p-8 space-y-6 text-xs relative select-none">
                      {/* DocuSign Header Flag */}
                      <div className="border-b-2 border-gray-800 pb-4 text-center">
                        <h4 className="text-sm font-extrabold uppercase font-serif text-gray-900">LETTER OF INTENT TO PURCHASE REAL PROPERTY</h4>
                      </div>

                      <p>Date: {selectedOffer?.offerDate}</p>
                      <p>Property Address: {selectedOffer?.propertyAddress}</p>
                      <p>Purchaser Name: <strong>{selectedOffer?.purchaserName}</strong></p>
                      <p>Purchase Price: <strong>${Number(selectedOffer?.purchasePrice || 0).toLocaleString()}</strong></p>
                      <p>Down Payment: <strong>${Number(selectedOffer?.downPaymentAmount || 0).toLocaleString()} ({selectedOffer?.downPaymentPercent || 50}%)</strong></p>

                      <p className="leading-relaxed">
                        This document constitutes a Letter of Intent for the purchase of the property listed above. Upon signing, both buyer and seller agree to initiate formal contract negotiations within 10 days.
                      </p>

                      {/* Signatures Area */}
                      <div className="pt-10 grid grid-cols-2 gap-8 border-t mt-12 relative">
                        {/* Interactive Signature Tag */}
                        <div className="relative">
                          <p className="text-[10px] text-gray-400 uppercase font-bold">Purchaser Signature</p>
                          <div className="mt-2 border-b border-gray-400 min-h-[50px] flex items-center relative">
                            {isSigningAdopted ? (
                              <div className="font-serif text-lg text-blue-700 italic font-bold">
                                {signerName}
                                <span className="absolute -top-3 left-0 text-[8px] text-green-600 font-bold bg-green-50 px-1 py-0.5 border border-green-200 font-sans tracking-wide uppercase">
                                  DocuSign Verified ✓
                                </span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setIsSigningAdopted(true)}
                                className="bg-yellow-400 hover:bg-yellow-500 text-slate-900 px-3 py-2 text-[10px] font-extrabold rounded-lg shadow animate-bounce flex items-center gap-1"
                              >
                                🖋️ CLICK TO SIGN
                              </button>
                            )}
                          </div>
                          <p className="text-[9px] text-gray-500 mt-1">{signerName} ({signerEmail})</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase font-bold">Seller Acknowledgment</p>
                          <div className="mt-2 border-b border-gray-400 min-h-[50px]"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 bg-gray-50 border-t flex justify-end gap-2 flex-shrink-0">
                  <button
                    onClick={() => setDocuSignStep('prepare')}
                    className="border border-gray-300 bg-white hover:bg-gray-50 px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Back
                  </button>
                  <button
                    disabled={!isSigningAdopted || isSubmittingSignature}
                    onClick={async () => {
                      setIsSubmittingSignature(true)
                      try {
                        const updated = {
                          ...selectedOffer,
                          isSigned: true,
                          signedAt: new Date().toISOString(),
                          signerName,
                          signerEmail
                        }
                        const saved = await handleSaveOffer(updated)
                        if (saved) {
                          setDocuSignStep('completed')
                          fetchOffers()
                        }
                      } catch (e) {
                        alert('Failed to save signature details')
                      } finally {
                        setIsSubmittingSignature(false)
                      }
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-sm disabled:opacity-50"
                  >
                    {isSubmittingSignature ? 'Finalizing...' : 'Finish & Execute'}
                  </button>
                </div>
              </div>
            )}

            {docuSignStep === 'completed' && (
              <div className="p-8 text-center space-y-4 overflow-y-auto flex-1">
                <div className="mx-auto w-12 h-12 bg-green-50 border border-green-200 rounded-full flex items-center justify-center text-green-600 font-extrabold text-lg">
                  ✓
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-gray-900 text-base">E-Signature Completed successfully!</h4>
                  <p className="text-xs text-gray-500">
                    The document has been securely signed and stamped with verified digital signatures.
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl max-w-md mx-auto text-left font-mono text-[10px] text-gray-600 space-y-1">
                  <p><strong>Envelope ID:</strong> docusign_env_{selectedOffer?.id || 'N/A'}</p>
                  <p><strong>Signer:</strong> {signerName} ({signerEmail})</p>
                  <p><strong>Status:</strong> COMPLETED & ARCHIVED</p>
                  <p><strong>Timestamp:</strong> {new Date().toLocaleString()}</p>
                </div>
                <div className="pt-4">
                  <button
                    onClick={() => {
                      setShowDocuSignModal(false)
                      setDocuSignStep('prepare')
                    }}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2 rounded-xl font-bold text-xs"
                  >
                    Return to Offers List
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
