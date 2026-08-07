import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
const getAbsoluteUrl = (url?: string) => {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
}

interface TransactionDealOutlineProps {
  transactionId: string
  parties: any[]
}

export function TransactionDealOutline({ transactionId, parties }: TransactionDealOutlineProps) {
  const { branding } = useAuth()
  const [outlineFields, setOutlineFields] = useState<any>({})
  const [tx, setTx] = useState<any>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`/api/transactions/${transactionId}`)
        const json = await res.json()
        if (json.success) {
          const t = json.data.transaction
          setTx(t)
          if (t.parties_involved) {
            try {
              if (t.parties_involved.startsWith('{')) {
                setOutlineFields(JSON.parse(t.parties_involved))
              } else {
                setOutlineFields({ notes: t.parties_involved })
              }
            } catch (e) {
              setOutlineFields({ notes: t.parties_involved })
            }
          }
        }
      } catch (e) {
        console.error(e)
      }
    }
    loadData()
  }, [transactionId])

  const getBuyersList = () => {
    const list: any[] = []
    if (outlineFields.buyerName) list.push({ name: outlineFields.buyerName, address: outlineFields.buyerAddress, email: outlineFields.buyerEmail, phone: outlineFields.buyerPhone })
    if (outlineFields.additionalBuyers && Array.isArray(outlineFields.additionalBuyers)) {
      list.push(...outlineFields.additionalBuyers)
    }
    parties.filter(p => p.role === 'buyer').forEach(p => {
      if (!list.some(x => x.email === p.email)) {
        list.push({ name: `${p.first_name} ${p.last_name}`, address: p.poi || p.address || '', email: p.email, phone: p.phone || '' })
      }
    })
    return list
  }

  const getSellersList = () => {
    const list: any[] = []
    if (outlineFields.sellerName) list.push({ name: outlineFields.sellerName, address: outlineFields.sellerAddress, email: outlineFields.sellerEmail, phone: outlineFields.sellerPhone })
    if (outlineFields.additionalSellers && Array.isArray(outlineFields.additionalSellers)) {
      list.push(...outlineFields.additionalSellers)
    }
    parties.filter(p => p.role === 'seller').forEach(p => {
      if (!list.some(x => x.email === p.email)) {
        list.push({ name: `${p.first_name} ${p.last_name}`, address: p.poi || p.address || '', email: p.email, phone: p.phone || '' })
      }
    })
    return list
  }

  if (!tx) return null

  const logoSrc = branding.logoUrl ? getAbsoluteUrl(branding.logoUrl) : null

  return (
    <div id="printable-deal-sheet" className="hidden print:block bg-white p-8 font-serif text-black leading-relaxed max-w-[800px] mx-auto">
      {/* Printable Header */}
      <div className="flex items-center justify-between border-b border-gray-300 pb-4 mb-6">
        <div className="flex items-center gap-3">
          {logoSrc ? (
            <img src={logoSrc} alt="Company Logo" className="h-16 w-auto object-contain" />
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
          <div>
            <h2 className="text-xl font-bold tracking-tight text-gray-900 leading-none">{branding.companyName || 'Prime America'}</h2>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest leading-none mt-1">Real Estate Brokerage</p>
          </div>
        </div>
        <div className="text-right text-[10px] text-gray-500 space-y-0.5">
          <p className="font-bold text-gray-700">Prime America Real Estate</p>
          <p>6123 Fresh Pond Road, Queens, NY 11379</p>
          <p>info@PrimeAmericaNY.com | PrimeAmericaNY.com</p>
          <p>Phone: 347-725-3142</p>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-black underline tracking-wide uppercase">DEAL OUTLINE SHEET</h1>
        <p className="text-base font-semibold text-gray-800 mt-2">{tx.name}</p>
      </div>

      {/* Two-Column Grid */}
      <div className="grid grid-cols-2 gap-x-12 gap-y-4 text-xs">

        {/* Left Column */}
        <div className="space-y-4">
          <div>
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Buyer Information</p>
            <p><span className="font-bold">Buyer(s):</span> {getBuyersList().map(b => b.name).filter(Boolean).join(', ') || '—'}</p>
            <p><span className="font-bold">Address(es):</span> {getBuyersList().map(b => b.address).filter(Boolean).join('; ') || '—'}</p>
          </div>

          <div>
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Buyer's Attorney</p>
            <p><span className="font-bold">Attorney:</span> {outlineFields.buyerAttorneyName || '—'}</p>
            <p><span className="font-bold">Address:</span> {outlineFields.buyerAttorneyAddress || '—'}</p>
            <p><span className="font-bold">Email:</span> {outlineFields.buyerAttorneyEmail || '—'}</p>
            <p><span className="font-bold">Phone:</span> {outlineFields.buyerAttorneyPhone || '—'}</p>
            <p><span className="font-bold">Fax:</span> {outlineFields.buyerAttorneyFax || '—'}</p>
          </div>

          <div>
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Selling Agent Details</p>
            <p><span className="font-bold">Selling Agent:</span> {outlineFields.sellingAgentName || '—'}</p>
            <p><span className="font-bold">Cell:</span> {outlineFields.sellingAgentCell || '—'}</p>
            <p><span className="font-bold">Email:</span> {outlineFields.sellingAgentEmail || '—'}</p>
            <p><span className="font-bold">License No:</span> {outlineFields.sellingAgentLicense || '—'}</p>
          </div>

          <div>
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Co-Selling Agent</p>
            <p><span className="font-bold">Agent:</span> {outlineFields.coSellingAgentName || '—'}</p>
            <p><span className="font-bold">Cell:</span> {outlineFields.coSellingAgentCell || '—'}</p>
            <p><span className="font-bold">Email:</span> {outlineFields.coSellingAgentEmail || '—'}</p>
            <p><span className="font-bold">License No:</span> {outlineFields.coSellingAgentLicense || '—'}</p>
          </div>

          <div>
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Selling Agency</p>
            <p><span className="font-bold">Agency:</span> {outlineFields.sellingAgencyName || '—'}</p>
            <p><span className="font-bold">Address:</span> {outlineFields.sellingAgencyAddress || '—'}</p>
            <p><span className="font-bold">Phone:</span> {outlineFields.sellingAgencyPhone || '—'}</p>
            <p><span className="font-bold">License No:</span> {outlineFields.sellingAgencyLicense || '—'}</p>
          </div>

          <div className="pt-2">
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Outline Administration</p>
            <p><span className="font-bold">Prepared By:</span> {outlineFields.preparedBy || '—'}</p>
            <p><span className="font-bold">Date:</span> {outlineFields.date || '—'}</p>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          <div>
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Seller Information</p>
            <p><span className="font-bold">Seller(s):</span> {getSellersList().map(s => s.name).filter(Boolean).join(', ') || '—'}</p>
            <p><span className="font-bold">Address(es):</span> {getSellersList().map(s => s.address).filter(Boolean).join('; ') || '—'}</p>
          </div>

          <div>
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Seller's Attorney</p>
            <p><span className="font-bold">Attorney:</span> {outlineFields.sellerAttorneyName || '—'}</p>
            <p><span className="font-bold">Address:</span> {outlineFields.sellerAttorneyAddress || '—'}</p>
            <p><span className="font-bold">Email:</span> {outlineFields.sellerAttorneyEmail || '—'}</p>
            <p><span className="font-bold">Phone:</span> {outlineFields.sellerAttorneyPhone || '—'}</p>
            <p><span className="font-bold">Fax:</span> {outlineFields.sellerAttorneyFax || '—'}</p>
          </div>

          <div>
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Listing Agent Details</p>
            <p><span className="font-bold">Listing Agent:</span> {outlineFields.listingAgentName || '—'}</p>
            <p><span className="font-bold">Cell:</span> {outlineFields.listingAgentCell || '—'}</p>
            <p><span className="font-bold">Email:</span> {outlineFields.listingAgentEmail || '—'}</p>
            <p><span className="font-bold">License No:</span> {outlineFields.listingAgentLicense || '—'}</p>
          </div>

          <div>
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Co-Listing Agent</p>
            <p><span className="font-bold">Agent:</span> {outlineFields.coListingAgentName || '—'}</p>
            <p><span className="font-bold">Cell:</span> {outlineFields.coListingAgentCell || '—'}</p>
            <p><span className="font-bold">Email:</span> {outlineFields.coListingAgentEmail || '—'}</p>
            <p><span className="font-bold">License No:</span> {outlineFields.coListingAgentLicense || '—'}</p>
          </div>

          <div>
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Listing Agency</p>
            <p><span className="font-bold">Agency:</span> {outlineFields.listingAgencyName || '—'}</p>
            <p><span className="font-bold">Address:</span> {outlineFields.listingAgencyAddress || '—'}</p>
            <p><span className="font-bold">Phone:</span> {outlineFields.listingAgencyPhone || '—'}</p>
            <p><span className="font-bold">License No:</span> {outlineFields.listingAgencyLicense || '—'}</p>
          </div>

          <div>
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Terms of the Sale</p>
            <p><span className="font-bold">Selling Price:</span> {outlineFields.sellingPrice ? `$${parseFloat(outlineFields.sellingPrice).toLocaleString()}` : '—'}</p>
            <p><span className="font-bold">Deposit at signing contract:</span> {outlineFields.depositAmount ? `$${parseFloat(outlineFields.depositAmount).toLocaleString()}` : '—'}</p>
            <p><span className="font-bold">Mortgage Amount:</span> {outlineFields.mortgageAmount ? `$${parseFloat(outlineFields.mortgageAmount).toLocaleString()}` : '—'}</p>
            <p><span className="font-bold">Cash at Closing:</span> {outlineFields.cashAtClosing ? `$${parseFloat(outlineFields.cashAtClosing).toLocaleString()}` : '—'}</p>
          </div>

          <div>
            <p className="font-bold border-b border-gray-200 pb-0.5 mb-1 uppercase text-[10px] text-gray-500">Finance Information</p>
            <p><span className="font-bold">Loan/Exchange Officer:</span> {outlineFields.loanOfficerName || '—'}</p>
            <p><span className="font-bold">Phone:</span> {outlineFields.loanOfficerPhone || '—'}</p>
            <p><span className="font-bold">Email:</span> {outlineFields.loanOfficerEmail || '—'}</p>
            <p><span className="font-bold">1031 Exchange / Finance Institute:</span> {outlineFields.financeInstitute || '—'}</p>
          </div>
        </div>
      </div>

      {outlineFields.notes && (
        <div className="mt-6 border-t border-gray-300 pt-4 text-xs">
          <p className="font-bold uppercase text-[10px] text-gray-500 mb-1">Additional Notes</p>
          <p className="whitespace-pre-line text-gray-700">{outlineFields.notes}</p>
        </div>
      )}

      {(() => {
        const buyersList = getBuyersList()
        const sellersList = getSellersList()
        const hasOverflowParties = buyersList.length > 2 || sellersList.length > 2
        if (!hasOverflowParties) return null

        return (
          <div className="mt-12 pt-8 border-t border-gray-300 text-xs" style={{ pageBreakBefore: 'always' }}>
            <h2 className="text-lg font-black underline mb-6 text-center tracking-wide uppercase">ADDITIONAL PARTIES ADDENDUM</h2>

            {buyersList.length > 2 && (
              <div className="mb-8">
                <p className="font-bold border-b border-gray-300 pb-1 mb-3 uppercase text-[10px] text-gray-500">All Buyers</p>
                <div className="space-y-4">
                  {buyersList.map((b: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-2 gap-4 text-xs bg-gray-50/50 p-3 rounded-xl border border-gray-150">
                      <div>
                        <p><span className="font-bold">Buyer #{idx + 1} Name:</span> {b.name || '—'}</p>
                        <p><span className="font-bold">Address:</span> {b.address || '—'}</p>
                      </div>
                      <div>
                        <p><span className="font-bold">Email:</span> {b.email || '—'}</p>
                        <p><span className="font-bold">Phone:</span> {b.phone || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sellersList.length > 2 && (
              <div>
                <p className="font-bold border-b border-gray-300 pb-1 mb-3 uppercase text-[10px] text-gray-500">All Sellers</p>
                <div className="space-y-4">
                  {sellersList.map((s: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-2 gap-4 text-xs bg-gray-50/50 p-3 rounded-xl border border-gray-150">
                      <div>
                        <p><span className="font-bold">Seller #{idx + 1} Name:</span> {s.name || '—'}</p>
                        <p><span className="font-bold">Address:</span> {s.address || '—'}</p>
                      </div>
                      <div>
                        <p><span className="font-bold">Email:</span> {s.email || '—'}</p>
                        <p><span className="font-bold">Phone:</span> {s.phone || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
