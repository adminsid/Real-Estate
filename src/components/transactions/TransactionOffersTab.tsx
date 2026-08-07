import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useTransactionDetail } from './TransactionContext'
import { Plus, Trash2, Printer, X } from 'lucide-react'
import clsx from 'clsx'

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
    <div className="relative w-full">
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
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 max-h-48 overflow-y-auto p-1 space-y-0.5">
          <p className="text-[9px] font-bold text-gray-400 px-2 py-1 uppercase">Autocomplete Suggestions ({matches.length})</p>
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
    networkLenders
  } = useTransactionDetail()

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
      } catch (e) {}
    }
    loadOutline()
  }, [id])

  const [offerForm, setOfferForm] = useState<any>({
    offerType: 'sales_agreement',
    offerDate: new Date().toISOString().substring(0, 10),
    purchaserName: '',
    purchaserAddress: '',
    sellerName: '',
    sellerAddress: '',
    propertyAddress: '',
    purchasePrice: 0,
    downPaymentAmount: 0,
    downPaymentPercent: 20,
    mortgageAmount: 0,
    cashOnClosing: 0,
    closingDate: 'Within 45 days (or as mutually agreed upon)',
    contingencies: 'To be delivered vacant and subject to home inspection within 10 days.',
    personalProperty: 'All fixtures and personal property attached.',
    occupancyTerms: 'At closing of title.',
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
    status: 'submitted'
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

    setOfferForm({
      id: `offer_${Date.now()}`,
      offerType: 'sales_agreement',
      offerDate: new Date().toISOString().substring(0, 10),
      purchaserName: buyers[0]?.name || outlineFields?.buyerName || 'Surya Shrestha',
      purchaserAddress: buyers[0]?.address || outlineFields?.buyerAddress || 'Queens, NY 11379',
      sellerName: sellers[0]?.name || outlineFields?.sellerName || 'Prime America Real Estate',
      sellerAddress: sellers[0]?.address || outlineFields?.sellerAddress || 'Queens, NY 11379',
      propertyAddress: tx?.propertyAddress || tx?.name || '6123 Fresh Pond Rd, Queens, NY 11379',
      purchasePrice: defaultPrice,
      downPaymentAmount: defaultDown,
      downPaymentPercent: 50,
      mortgageAmount: defaultMortgage,
      cashOnClosing: 0,
      closingDate: 'Within 45 days (or as mutually agreed upon)',
      contingencies: 'To be delivered vacant and subject to home inspection within 10 days.',
      personalProperty: outlineFields?.personalProperty || 'All fixtures attached.',
      occupancyTerms: outlineFields?.possessionTerms || 'At closing of title.',
      loanOfficerName: outlineFields?.loanOfficerName || 'Maura Crowley',
      loanOfficerCompany: outlineFields?.financeInstitute || 'LenJen Corp',
      loanOfficerPhone: outlineFields?.loanOfficerPhone || '(516) 687-6738',
      loanOfficerEmail: outlineFields?.loanOfficerEmail || 'Maura@Lendgen.com',
      loanOfficerAddress: outlineFields?.mortgageOfficerAddress || '6851 Jericho Turnpike, Syosset, New York 11791',
      attorneyName: outlineFields?.buyerAttorneyName || 'John A Colonna',
      attorneyFirm: outlineFields?.buyerAttorneyAddress ? 'Law Office Of John A. Colonna' : 'Law Office Of John A. Colonna',
      attorneyPhone: outlineFields?.buyerAttorneyPhone || '(718) 894-4600',
      attorneyEmail: outlineFields?.buyerAttorneyEmail || 'John@Colonna-Law.com',
      attorneyAddress: outlineFields?.buyerAttorneyAddress || '73-15 Metropolitan Avenue Middle Village NY 11379',
      buyerAgentName: user?.name || 'Surya Shrestha',
      sellerAgentName: outlineFields?.listingAgentName || 'Listing Agent',
      sellerAgentTel: outlineFields?.listingAgentCell || '(347) 725-3142',
      buyerBrokerCommission: 'Seller to pay Buyer Broker 2% of purchase price, payable to Prime America Real Estate upon closing.',
      inspectionDate: tx?.home_inspection_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
      possessionDate: tx?.possession_date || new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
      escrowDate: tx?.escrow_date || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
      inspectionDeadline: tx?.inspection_deadline || new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
      appraisalDeadline: tx?.appraisal_date || new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
      status: 'submitted'
    })
    setShowCreateOfferModal(true)
  }

  const handlePrintOfferDocument = (off: any) => {
    const isSalesAgreement = off.offerType === 'sales_agreement'
    const fileTitle = `${isSalesAgreement ? 'Sales_Agreement' : 'Letter_of_Intent'}_${(off.purchaserName || 'Purchaser').replace(/\s+/g, '_')}`
    const docElement = document.getElementById('printable-offer-document')

    const printWin = window.open('', '_blank', 'width=900,height=1100')
    if (printWin && docElement) {
      printWin.document.write(`
        <html>
          <head>
            <title>${fileTitle}</title>
            <style>
              @page {
                size: portrait;
                margin: 15mm 15mm 15mm 15mm;
              }
              @media print {
                body {
                  margin: 0;
                  padding: 0 !important;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                  background-color: #ffffff;
                }
              }
              body {
                font-family: ${isSalesAgreement ? "'Times New Roman', Georgia, serif" : "'Inter', system-ui, -apple-system, sans-serif"};
                padding: 0;
                color: #111827;
                background-color: #ffffff;
                box-sizing: border-box;
              }
              #printable-offer-document, #printable-sales-agreement, #printable-loi-agreement {
                padding: 0 !important;
                margin: 0 !important;
                border: none !important;
                box-shadow: none !important;
                max-width: 100% !important;
              }
              /* Layout & Flexbox */
              .flex { display: flex !important; }
              .flex-col { flex-direction: column !important; }
              .items-center { align-items: center !important; }
              .items-end { align-items: flex-end !important; }
              .justify-between { justify-content: space-between !important; }
              .justify-center { justify-content: center !important; }
              .gap-1 { gap: 4px !important; }
              .gap-2 { gap: 8px !important; }
              .gap-3 { gap: 12px !important; }
              .gap-4 { gap: 16px !important; }
              .gap-x-8 { column-gap: 32px !important; }
              .gap-y-2 { row-gap: 8px !important; }
              .gap-x-12 { column-gap: 48px !important; }
              .gap-y-4 { row-gap: 16px !important; }
              .grid { display: grid !important; }
              .grid-cols-2 { grid-template-columns: 1fr 1fr !important; }
              .space-y-1 > * + * { margin-top: 4px !important; }
              .space-y-1.5 > * + * { margin-top: 6px !important; }
              .space-y-2 > * + * { margin-top: 8px !important; }
              .space-y-2.5 > * + * { margin-top: 10px !important; }
              .space-y-3 > * + * { margin-top: 12px !important; }
              .space-y-4 > * + * { margin-top: 16px !important; }
              .space-y-6 > * + * { margin-top: 24px !important; }
              .pl-6 { padding-left: 24px !important; }
              .flex-1 { flex: 1 !important; }
              .inline-block { display: inline-block !important; }

              /* Sizing */
              .w-12 { width: 48px !important; }
              .h-12 { height: 48px !important; }
              .w-16 { width: 64px !important; }
              .h-16 { height: 64px !important; }
              .w-20 { width: 80px !important; }
              .h-20 { height: 80px !important; }
              .w-24 { width: 96px !important; }
              .w-28 { width: 112px !important; }
              .w-36 { width: 144px !important; }
              .w-40 { width: 160px !important; }
              .w-48 { width: 192px !important; }
              .w-96 { width: 384px !important; }
              .w-\[60\%\] { width: 60% !important; }
              .w-3\/5 { width: 60% !important; }
              .w-4\/5 { width: 80% !important; }
              .w-1\/2 { width: 50% !important; }
              .min-h-\[16px\] { min-height: 16px !important; }

              /* Typography */
              .text-xs { font-size: 11px !important; }
              .text-sm { font-size: 13px !important; }
              .text-lg { font-size: 18px !important; }
              .text-xl { font-size: 20px !important; }
              .text-\[9px\] { font-size: 9px !important; }
              .text-\[10px\] { font-size: 10px !important; }
              .text-\[11px\] { font-size: 11px !important; }
              .font-serif { font-family: "Times New Roman", Georgia, serif !important; }
              .font-sans { font-family: "Inter", system-ui, -apple-system, sans-serif !important; }
              .font-mono { font-family: monospace !important; }
              .font-bold { font-weight: 700 !important; }
              .font-semibold { font-weight: 600 !important; }
              .font-medium { font-weight: 500 !important; }
              .text-center { text-align: center !important; }
              .text-right { text-align: right !important; }
              .text-justify { text-align: justify !important; }
              .uppercase { text-transform: uppercase !important; }
              .tracking-wide { letter-spacing: 0.05em !important; }
              .tracking-wider { letter-spacing: 0.1em !important; }
              .leading-relaxed { line-height: 1.625 !important; }
              .leading-loose { line-height: 2 !important; }

              /* Spacing */
              .mt-2 { margin-top: 8px !important; }
              .mt-6 { margin-top: 24px !important; }
              .mt-8 { margin-top: 32px !important; }
              .mb-2 { margin-bottom: 8px !important; }
              .mb-4 { margin-bottom: 16px !important; }
              .mb-6 { margin-bottom: 24px !important; }
              .pt-2 { padding-top: 8px !important; }
              .pt-4 { padding-top: 16px !important; }
              .pt-8 { padding-top: 32px !important; }
              .pb-0.5 { padding-bottom: 2px !important; }
              .pb-1 { padding-bottom: 4px !important; }
              .pb-4 { padding-bottom: 16px !important; }

              /* Borders */
              .border-b { border-bottom: 1px solid #d1d5db !important; }
              .border-t { border-top: 1px solid #d1d5db !important; }
              .border-gray-300 { border-color: #d1d5db !important; }
              .border-gray-400 { border-color: #9ca3af !important; }

              /* Colors */
              .bg-slate-900 { background-color: #0f172a !important; }
              .text-white { color: #ffffff !important; }
              .text-gray-900 { color: #111827 !important; }
              .text-gray-800 { color: #1f2937 !important; }
              .text-gray-700 { color: #374151 !important; }
              .text-gray-600 { color: #4b5563 !important; }
              .text-gray-500 { color: #6b7280 !important; }

              /* Explicit logo overrides to prevent scaling issues */
              #printable-sales-agreement img, .sales-agreement-logo {
                height: 64px !important;
                max-height: 64px !important;
                width: auto !important;
                display: block !important;
                object-fit: contain !important;
              }
              #printable-sales-agreement svg {
                height: 64px !important;
                width: 64px !important;
                display: block !important;
              }
              #printable-loi-agreement img, .loi-logo {
                height: 48px !important;
                max-height: 48px !important;
                width: auto !important;
                display: block !important;
                object-fit: contain !important;
              }
              #printable-loi-agreement svg {
                height: 48px !important;
                width: 48px !important;
                display: block !important;
              }
            </style>
          </head>
          <body>
            ${docElement.innerHTML}
            <script>
              window.onload = function() {
                // Ensure all images are loaded before printing
                const images = document.getElementsByTagName('img');
                let loadedCount = 0;
                if (images.length === 0) {
                  window.print();
                  setTimeout(window.close, 500);
                } else {
                  for (let i = 0; i < images.length; i++) {
                    if (images[i].complete) {
                      loadedCount++;
                      if (loadedCount === images.length) {
                        window.print();
                        setTimeout(window.close, 500);
                      }
                    } else {
                      images[i].addEventListener('load', () => {
                        loadedCount++;
                        if (loadedCount === images.length) {
                          window.print();
                          setTimeout(window.close, 500);
                        }
                      });
                      images[i].addEventListener('error', () => {
                        loadedCount++;
                        if (loadedCount === images.length) {
                          window.print();
                          setTimeout(window.close, 500);
                        }
                      });
                    }
                  }
                }
              };
            </script>
          </body>
        </html>
      `)
      printWin.document.close()
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
                      if (!confirm('Are you sure you want to accept this offer and auto-populate all deal milestones?')) return
                      const updatedOffer = { ...off, status: 'accepted' }
                      await handleSaveOffer(updatedOffer)
                      await handleUpdateDetails({
                        status: 'under_contract',
                        offer_date: off.offerDate || null,
                        pending_date: off.offerDate || null,
                        home_inspection_date: off.inspectionDate || null,
                        inspection_deadline: off.inspectionDeadline || null,
                        appraisal_date: off.appraisalDeadline || null,
                        possession_date: off.possessionDate || null,
                        escrow_date: off.escrowDate || null
                      })
                      alert('Offer accepted successfully! Deal timeline dates have been auto-populated.')
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
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const saved = await handleSaveOffer(offerForm)
                if (saved) {
                  setSelectedOffer(saved)
                  setShowCreateOfferModal(false)
                  setShowPrintOfferModal(true)
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

              {/* Financials Row */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Purchase Price ($)</label>
                  <input
                    type="number"
                    required
                    value={offerForm.purchasePrice}
                    onChange={(e) => {
                      const p = Number(e.target.value)
                      const dp = Math.round(p * (offerForm.downPaymentPercent / 100))
                      setOfferForm((f: any) => ({ ...f, purchasePrice: p, downPaymentAmount: dp, mortgageAmount: p - dp }))
                    }}
                    className="w-full rounded-xl border border-gray-300 p-2 text-xs font-bold focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Down Payment ($)</label>
                  <input
                    type="number"
                    required
                    value={offerForm.downPaymentAmount}
                    onChange={(e) => {
                      const dp = Number(e.target.value)
                      const pct = offerForm.purchasePrice ? Math.round((dp / offerForm.purchasePrice) * 100) : 0
                      setOfferForm((f: any) => ({ ...f, downPaymentAmount: dp, downPaymentPercent: pct, mortgageAmount: Math.max(0, offerForm.purchasePrice - dp) }))
                    }}
                    className="w-full rounded-xl border border-gray-300 p-2 text-xs font-bold focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-gray-700 block mb-1">Mortgage Amount ($)</label>
                  <input
                    type="number"
                    value={offerForm.mortgageAmount}
                    onChange={(e) => setOfferForm((f: any) => ({ ...f, mortgageAmount: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-gray-300 p-2 text-xs font-bold focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Parties & Address */}
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="font-bold text-gray-700 block mb-1">Seller Name(s)</label>
                  <input
                    required
                    value={offerForm.sellerName}
                    onChange={(e) => setOfferForm((f: any) => ({ ...f, sellerName: e.target.value }))}
                    className="w-full rounded-xl border border-gray-300 p-2 text-xs font-bold focus:border-blue-500 focus:outline-none"
                  />
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

              {/* Key Dates */}
              <div className="pt-2 border-t border-gray-100">
                <p className="font-bold text-gray-800 text-xs mb-2">Key Dates</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Offer Date (Contract Date)</label>
                    <input
                      type="date"
                      value={offerForm.offerDate}
                      onChange={(e) => {
                        const dateVal = e.target.value
                        setOfferForm((f: any) => {
                          const baseline = new Date(dateVal)
                          if (!isNaN(baseline.getTime())) {
                            const escDate = new Date(baseline.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
                            const insDate = new Date(baseline.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
                            const insDead = new Date(baseline.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
                            const appDead = new Date(baseline.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
                            const posDate = new Date(baseline.getTime() + 45 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10)
                            return {
                              ...f,
                              offerDate: dateVal,
                              escrowDate: escDate,
                              inspectionDate: insDate,
                              inspectionDeadline: insDead,
                              appraisalDeadline: appDead,
                              possessionDate: posDate
                            }
                          }
                          return { ...f, offerDate: dateVal }
                        })
                      }}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Escrow Deposit Date</label>
                    <input
                      type="date"
                      value={offerForm.escrowDate || ''}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, escrowDate: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Home Inspection Date</label>
                    <input
                      type="date"
                      value={offerForm.inspectionDate || ''}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, inspectionDate: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Inspection Deadline</label>
                    <input
                      type="date"
                      value={offerForm.inspectionDeadline || ''}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, inspectionDeadline: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Appraisal Deadline</label>
                    <input
                      type="date"
                      value={offerForm.appraisalDeadline || ''}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, appraisalDeadline: e.target.value }))}
                      className="w-full rounded-xl border border-gray-300 p-2 text-xs focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">Possession Date</label>
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
                </div>

              <button type="submit" className="w-full bg-blue-600 text-white p-2.5 rounded-lg font-bold">
                Generate Offer
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
                  /* SALES AGREEMENT DOCUMENT VIEW */
                  <div id="printable-sales-agreement" className="p-6 bg-white text-gray-900 font-serif leading-relaxed text-[11px] space-y-2.5 max-w-[800px] mx-auto">
                    <div className="flex justify-between items-center border-b border-gray-300 pb-4 mb-4">
                      {/* Left: Logo */}
                      <div className="flex items-center gap-3">
                        {logoSrc ? (
                          <img src={logoSrc} alt="Company Logo" className="h-16 w-auto object-contain max-h-16 sales-agreement-logo" />
                        ) : (
                          <svg className="h-16 w-16" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="48" fill="#0c1e2d" stroke="#b45309" strokeWidth="3" />
                            <circle cx="50" cy="50" r="42" fill="none" stroke="#b45309" strokeWidth="0.7" strokeDasharray="2 2" />
                            <text x="50" y="32" fill="#f59e0b" fontSize="6.5" fontWeight="bold" textAnchor="middle" letterSpacing="0.5">PRIME</text>
                            <text x="50" y="42" fill="#f59e0b" fontSize="6.5" fontWeight="bold" textAnchor="middle" letterSpacing="0.5">AMERICA</text>
                            <text x="50" y="70" fill="#f59e0b" fontSize="5.5" fontWeight="bold" textAnchor="middle">REAL ESTATE</text>
                            <path d="M42 58 L50 50 L58 58 L55 58 L55 64 L45 64 L45 58 Z" fill="#f59e0b" />
                          </svg>
                        )}
                      </div>
                      {/* Center Title */}
                      <h1 className="text-xl font-bold font-sans tracking-wide uppercase text-gray-900">SALES AGREEMENT</h1>
                      {/* Right Address */}
                      <div className="text-right text-[9px] text-gray-600 font-sans leading-tight">
                        <p className="font-bold text-gray-800">6123 Fresh Pond Road Queens, NY 11379</p>
                        <p>info@PrimeAmericaNY.com</p>
                        <p>PrimeAmericaNY.com</p>
                        <p>347-725-3142</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <p>Date: <span className="border-b border-gray-400 pb-0.5 inline-block w-48 text-center">{selectedOffer.offerDate || '____________________'}</span></p>
                      </div>

                      <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                        <div className="flex items-end gap-1">
                          <span>Purchaser:</span>
                          <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px] px-2">{selectedOffer.purchaserName || '__________________________________'}</span>
                        </div>
                        <div className="flex items-end gap-1">
                          <span>Seller:</span>
                          <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px] px-2">{selectedOffer.sellerName || '__________________________________'}</span>
                        </div>
                        <div className="flex items-end gap-1">
                          <span>Address:</span>
                          <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px] px-2">{selectedOffer.purchaserAddress || '__________________________________'}</span>
                        </div>
                        <div className="flex items-end gap-1">
                          <span>Address:</span>
                          <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px] px-2">{selectedOffer.sellerAddress || '__________________________________'}</span>
                        </div>
                      </div>

                      {/* PROPERTY TO BE SOLD */}
                      <div className="space-y-1 pt-2">
                        <h3 className="font-bold text-xs uppercase text-gray-800 tracking-wider font-sans">PROPERTY TO BE SOLD</h3>
                        <p className="leading-loose">
                          The undersigned purchaser agrees to purchase and the undersigned seller agrees to sell the property known as and by street number{' '}
                          <span className="border-b border-gray-400 pb-0.5 inline-block w-[60%] px-2 font-bold">{selectedOffer.propertyAddress || '________________________________________________________________'}</span>
                        </p>
                        <p className="leading-loose">
                          Acknowledge the receipt of so <span className="border-b border-gray-400 pb-0.5 inline-block w-36 text-center font-bold">${Number(selectedOffer.downPaymentAmount || 0).toLocaleString() || '___________'}</span> as a deposit on account of the purchase price.
                        </p>
                      </div>

                      {/* PRICE AND TERMS */}
                      <div className="space-y-2 pt-2">
                        <h3 className="font-bold text-xs uppercase text-gray-800 tracking-wider font-sans">PRICE AND TERMS</h3>
                        <div className="space-y-1 max-w-lg">
                          <div className="flex justify-between items-end gap-1">
                            <span>Purchase Price (Offer Amount)</span>
                            <div className="flex items-end gap-1">
                              <span>$</span>
                              <span className="border-b border-gray-400 pb-0.5 inline-block w-40 text-right font-bold">{selectedOffer.purchasePrice ? Number(selectedOffer.purchasePrice).toLocaleString() : '___________________'}</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-end gap-1">
                            <span>Cash on signing more formal contract, including the amount above</span>
                            <div className="flex items-end gap-1">
                              <span>$</span>
                              <span className="border-b border-gray-400 pb-0.5 inline-block w-40 text-right font-semibold">{selectedOffer.downPaymentAmount ? Number(selectedOffer.downPaymentAmount).toLocaleString() : '___________________'}</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-end gap-1">
                            <span>Mortgage Amount.</span>
                            <div className="flex items-end gap-1">
                              <span>$</span>
                              <span className="border-b border-gray-400 pb-0.5 inline-block w-40 text-right font-semibold">{selectedOffer.mortgageAmount ? Number(selectedOffer.mortgageAmount).toLocaleString() : '___________________'}</span>
                            </div>
                          </div>
                          <div className="flex justify-between items-end gap-1">
                            <span>Cash on closing title</span>
                            <div className="flex items-end gap-1">
                              <span>$</span>
                              <span className="border-b border-gray-400 pb-0.5 inline-block w-40 text-right font-bold">{selectedOffer.purchasePrice ? Number(selectedOffer.purchasePrice - (selectedOffer.downPaymentAmount || 0) - (selectedOffer.mortgageAmount || 0)).toLocaleString() : '___________________'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* PERSONAL PROPERTY */}
                      <div className="space-y-1 pt-2 text-xs">
                        <p><strong>PERSONAL PROPERTY:</strong> {selectedOffer.personalProperty || 'To be agreed upon at formal contract.'}</p>
                        <div className="flex items-end gap-1">
                          <span><strong>OCCUPANCY:</strong></span>
                          <span className="border-b border-gray-400 pb-0.5 inline-block w-96 px-2">{selectedOffer.occupancyTerms || 'At closing of title.'}</span>
                        </div>
                      </div>

                      {/* MORTGAGE REQUIREMENTS */}
                      <div className="space-y-1 pt-2">
                        <h3 className="font-bold text-xs uppercase text-gray-800 tracking-wider font-sans">MORTGAGE REQUIREMENTS</h3>
                        <p className="text-justify leading-relaxed">
                          This agreement may be cancelled if purchaser is unable to obtain, at purchaser's expense, a first CONV/FHA/VA loan, approved by a lending institution in the sum of ${' '}
                          <span className="border-b border-gray-400 pb-0.5 inline-block w-28 text-center font-bold">{selectedOffer.mortgageAmount ? `$${Number(selectedOffer.mortgageAmount).toLocaleString()}` : '_________________'}</span>{' '}
                          (total mortgage amount) payable in equal monthly payments of principal and interest over 15/30 years with interest at the prevailing rate, within 45 days after signing of the formal contract. Purchaser agrees to sign any and all papers and documents and furnish all information required by the lending institution to obtain such mortgage loan.
                        </p>
                      </div>

                      {/* DATE FOR SETTLEMENT AND DELIVERY OF DEED */}
                      <div className="space-y-1 pt-2">
                        <h3 className="font-bold text-xs uppercase text-gray-800 tracking-wider font-sans">DATE FOR SETTLEMENT AND DELIVERY OF DEED</h3>
                        <p className="text-justify leading-relaxed">
                          The settlement of the obligations of the seller and purchaser under this agreement (closing of title) and the transfer, of the deed shall take place on or about 45 days from signing of formal contract at 10:00 (a.m.) at the office of the seller attorney, buyer attorney or bank attorney.
                        </p>
                      </div>

                      {/* ACCEPTANCE OF OFFER */}
                      <div className="space-y-1 pt-2">
                        <h3 className="font-bold text-xs uppercase text-gray-800 tracking-wider font-sans">ACCEPTANCE OF OFFER</h3>
                        <p className="text-justify leading-relaxed">
                          The above sum is accepted by the Broker with the understanding that the owner is not obligated by this agreement until such time as the owner agrees to be obligated by the terms of this agreement. If owner fails to agree to the terms of this agreement, said amount shall be refunded to purchaser. If owner does agree to the terms of this agreement, usual formal contract expressing the above terms and conditions, prepared by seller's attorney, shall be signed and exchanged by the seller and purchaser on or about 10 days from the acceptance of offer date.
                        </p>
                      </div>

                      {/* BROKER'S COMMISSION */}
                      <div className="space-y-1 pt-2">
                        <h3 className="font-bold text-xs uppercase text-gray-800 tracking-wider font-sans">BROKER'S COMMISSION</h3>
                        <p className="text-justify leading-relaxed">
                          The parties agree that Prime America Real Estate, Inc., Broker, brought about this sale, and seller agrees to pay Prime America Real Estate, Inc. a commission that is supplied in a separate commission agreement. The undersigned purchaser and seller agrees to the above terms and acknowledge receipt of a copy of this agreement.
                        </p>
                      </div>

                      {/* Bottom signatures */}
                      <div className="pt-4 grid grid-cols-2 gap-x-12 gap-y-4 text-[10px] font-sans border-t border-gray-300 mt-6 leading-relaxed">
                         <div className="space-y-2">
                           <div className="flex items-end gap-1">
                             <span><strong>BUYER'S SIGN:</strong></span>
                             <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.purchaserName}</span>
                           </div>
                           <div className="flex items-end gap-1">
                             <span><strong>ATTORNEY'S NAME:</strong></span>
                             <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.buyerAttorneyName || 'N/A'}</span>
                           </div>
                           <div className="grid grid-cols-2 gap-2">
                             <div className="flex items-end gap-1">
                               <span><strong>TEL:</strong></span>
                               <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.buyerAttorneyPhone || 'N/A'}</span>
                             </div>
                             <div className="flex items-end gap-1">
                               <span><strong>EMAIL:</strong></span>
                               <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.buyerAttorneyEmail || 'N/A'}</span>
                             </div>
                           </div>
                           <div className="flex items-end gap-1">
                             <span><strong>MORTGAGE OFFICER'S NAME:</strong></span>
                             <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.loanOfficerName || 'N/A'}</span>
                           </div>
                           <div className="grid grid-cols-2 gap-2">
                             <div className="flex items-end gap-1">
                               <span><strong>TEL:</strong></span>
                               <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.loanOfficerPhone || 'N/A'}</span>
                             </div>
                             <div className="flex items-end gap-1">
                               <span><strong>EMAIL:</strong></span>
                               <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.loanOfficerEmail || 'N/A'}</span>
                             </div>
                           </div>
                           <div className="flex items-end gap-1">
                             <span><strong>MORTGAGE BANK/BANKER'S NAME:</strong></span>
                             <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.loanOfficerCompany || 'N/A'}</span>
                           </div>
                         </div>

                         <div className="space-y-2">
                           <div className="flex items-end gap-1">
                             <span><strong>SELLER'S SIGN:</strong></span>
                             <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]"></span>
                           </div>
                           <div className="flex items-end gap-1">
                             <span><strong>SELLER'S AGENT:</strong></span>
                             <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.sellerAgentName || 'N/A'}</span>
                           </div>
                           <div className="flex items-end gap-1">
                             <span><strong>SELLER'S AGENT TEL:</strong></span>
                             <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.sellerAgentTel || 'N/A'}</span>
                           </div>
                           <div className="flex items-end gap-1">
                             <span><strong>ATTORNEY'S NAME:</strong></span>
                             <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.sellerAttorneyName || 'To Be Nominated'}</span>
                           </div>
                           <div className="grid grid-cols-2 gap-2">
                             <div className="flex items-end gap-1">
                               <span><strong>TEL:</strong></span>
                               <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.sellerAttorneyPhone || 'N/A'}</span>
                             </div>
                             <div className="flex items-end gap-1">
                               <span><strong>FAX:</strong></span>
                               <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.sellerAttorneyFax || 'N/A'}</span>
                             </div>
                           </div>
                           <div className="flex items-end gap-1">
                             <span><strong>EMAIL:</strong></span>
                             <span className="border-b border-gray-400 pb-0.5 flex-1 min-h-[16px]">{selectedOffer.sellerAttorneyEmail || 'N/A'}</span>
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
                        <img src={logoSrc} alt="Company Logo" className="h-12 w-auto object-contain max-h-12 mb-2" />
                      ) : (
                        <svg className="h-12 w-12 mb-2" viewBox="0 0 100 100">
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
