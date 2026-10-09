import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useTransactionDetail } from './TransactionContext'
import { Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { getLocalDateString } from '@/utils/date'

interface TransactionOutlineModalProps {
  isOpen: boolean
  onClose: () => void
}

export function TransactionOutlineModal({ isOpen, onClose }: TransactionOutlineModalProps) {
  const { user, branding } = useAuth()
  const { data, handleUpdateOutline } = useTransactionDetail()
  const tx = data?.transaction
  const parties = data?.parties || []

  const [outlineFields, setOutlineFields] = useState<any>({})
  const [activeOutlineTab, setActiveOutlineTab] = useState<'parties' | 'attorneys' | 'agents' | 'financials' | 'notes'>('parties')

  useEffect(() => {
    let fields: any = {}
    if (tx?.parties_involved) {
      try {
        if (typeof tx.parties_involved === 'object') {
          fields = { ...tx.parties_involved }
        } else if (tx.parties_involved.startsWith('{')) {
          fields = JSON.parse(tx.parties_involved)
        } else {
          fields = { notes: tx.parties_involved }
        }
      } catch (e) {
        fields = { notes: tx.parties_involved }
      }
    }

    // Default fallbacks from transaction / workspace data
    if (!fields.sellingPrice && tx?.price) {
      fields.sellingPrice = String(tx.price)
    }
    if (!fields.preparedBy && user?.name) {
      fields.preparedBy = user.name
    }
    if (!fields.date) {
      fields.date = getLocalDateString()
    }
    if (!fields.buyerName) {
      const b = parties.find((p: any) => p.role === 'buyer')
      if (b) {
        fields.buyerName = `${b.first_name || ''} ${b.last_name || ''}`.trim()
        fields.buyerEmail = b.email || ''
        fields.buyerPhone = b.phone || ''
        fields.buyerAddress = b.poi || b.address || ''
      }
    }
    if (!fields.sellerName) {
      const s = parties.find((p: any) => p.role === 'seller')
      if (s) {
        fields.sellerName = `${s.first_name || ''} ${s.last_name || ''}`.trim()
        fields.sellerEmail = s.email || ''
        fields.sellerPhone = s.phone || ''
        fields.sellerAddress = s.poi || s.address || ''
      }
    }

    setOutlineFields(fields)
  }, [tx, user, parties])

  if (!isOpen) return null

  const updateField = (key: string, value: any) => {
    setOutlineFields((prev: any) => ({ ...prev, [key]: value }))
  }

  const getBuyersList = () => {
    const list = [...(outlineFields.additionalBuyers || [])]
    list.unshift({
      name: outlineFields.buyerName || '',
      email: outlineFields.buyerEmail || '',
      phone: outlineFields.buyerPhone || '',
      address: outlineFields.buyerAddress || ''
    })
    return list
  }

  const handleUpdateBuyerField = (index: number, key: string, val: string) => {
    setOutlineFields((prev: any) => {
      const next = { ...prev }
      if (index === 0) {
        const fieldName = key === 'name' ? 'buyerName' : key === 'email' ? 'buyerEmail' : key === 'phone' ? 'buyerPhone' : 'buyerAddress'
        next[fieldName] = val
      } else {
        const arr = [...(next.additionalBuyers || [])]
        arr[index - 1] = { ...(arr[index - 1] || {}), [key]: val }
        next.additionalBuyers = arr
      }
      return next
    })
  }

  const handleAddBuyerField = () => {
    setOutlineFields((prev: any) => ({
      ...prev,
      additionalBuyers: [...(prev.additionalBuyers || []), { name: '', email: '', phone: '', address: '' }]
    }))
  }

  const handleRemoveBuyerField = (index: number) => {
    setOutlineFields((prev: any) => {
      const next = { ...prev }
      if (index === 0) {
        next.buyerName = ''
        next.buyerEmail = ''
        next.buyerPhone = ''
        next.buyerAddress = ''
      } else {
        const arr = [...(next.additionalBuyers || [])]
        arr.splice(index - 1, 1)
        next.additionalBuyers = arr
      }
      return next
    })
  }

  const getSellersList = () => {
    const list = [...(outlineFields.additionalSellers || [])]
    list.unshift({
      name: outlineFields.sellerName || '',
      email: outlineFields.sellerEmail || '',
      phone: outlineFields.sellerPhone || '',
      address: outlineFields.sellerAddress || ''
    })
    return list
  }

  const handleUpdateSellerField = (index: number, key: string, val: string) => {
    setOutlineFields((prev: any) => {
      const next = { ...prev }
      if (index === 0) {
        const fieldName = key === 'name' ? 'sellerName' : key === 'email' ? 'sellerEmail' : key === 'phone' ? 'sellerPhone' : 'sellerAddress'
        next[fieldName] = val
      } else {
        const arr = [...(next.additionalSellers || [])]
        arr[index - 1] = { ...(arr[index - 1] || {}), [key]: val }
        next.additionalSellers = arr
      }
      return next
    })
  }

  const handleAddSellerField = () => {
    setOutlineFields((prev: any) => ({
      ...prev,
      additionalSellers: [...(prev.additionalSellers || []), { name: '', email: '', phone: '', address: '' }]
    }))
  }

  const handleRemoveSellerField = (index: number) => {
    setOutlineFields((prev: any) => {
      const next = { ...prev }
      if (index === 0) {
        next.sellerName = ''
        next.sellerEmail = ''
        next.sellerPhone = ''
        next.sellerAddress = ''
      } else {
        const arr = [...(next.additionalSellers || [])]
        arr.splice(index - 1, 1)
        next.additionalSellers = arr
      }
      return next
    })
  }

  const applyWorkspaceAgentData = (side: 'buyer' | 'seller', isRepresenting: boolean) => {
    setOutlineFields((prev: any) => {
      const next = { ...prev }
      if (side === 'buyer') {
        next.isRepresentingBuyer = isRepresenting
      } else {
        next.isRepresentingSeller = isRepresenting
      }

      if (!isRepresenting || !user) return next
      const userAny = user as any

      if (side === 'buyer') {
        next.sellingAgentName = user.name || ''
        next.sellingAgentEmail = user.email || ''
        next.sellingAgentCell = userAny.phone || ''
        next.sellingAgentLicense = user.licenseNumber || ''
        next.sellingAgencyName = branding.companyName || 'Prime America Real Estate'
      } else {
        next.listingAgentName = user.name || ''
        next.listingAgentEmail = user.email || ''
        next.listingAgentCell = userAny.phone || ''
        next.listingAgentLicense = user.licenseNumber || ''
        next.listingAgencyName = branding.companyName || 'Prime America Real Estate'
      }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const success = await handleUpdateOutline(outlineFields)
    if (success) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 p-6 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edit Printable Deal Outline</h2>
            <p className="text-xs text-gray-400 mt-0.5">All inputs map directly to the printed Deal Outline Sheet.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 font-bold text-lg">✕</button>
        </div>

        <div className="flex border-b border-gray-100 px-6 text-sm font-semibold text-gray-500 overflow-x-auto">
          {(['parties', 'attorneys', 'agents', 'financials', 'notes'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveOutlineTab(tab)}
              className={clsx(
                "py-3 border-b-2 px-4 capitalize flex-shrink-0 transition-colors",
                activeOutlineTab === tab ? "border-blue-600 text-blue-600 font-bold" : "border-transparent hover:text-gray-700"
              )}
            >
              {tab === 'parties' ? 'Buyers & Sellers' : tab === 'attorneys' ? 'Attorneys' : tab === 'agents' ? 'Agents & Agencies' : tab === 'financials' ? 'Financials & Terms' : 'Notes'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
          {activeOutlineTab === 'parties' && (
            <div className="space-y-6">
              {/* Buyers */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-bold text-gray-800 text-sm">Buyers ({getBuyersList().length})</h4>
                  <button type="button" onClick={handleAddBuyerField} className="text-xs text-blue-600 font-bold flex items-center gap-1 hover:text-blue-800">
                    <Plus className="h-3.5 w-3.5" /> Add Additional Buyer
                  </button>
                </div>
                {getBuyersList().map((buyer, index) => (
                  <div key={index} className="bg-gray-50/70 p-4 rounded-xl border border-gray-200 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-700">Buyer #{index + 1} {index === 0 && '(Primary)'}</span>
                      {(index > 0 || getBuyersList().length > 1) && (
                        <button type="button" onClick={() => handleRemoveBuyerField(index)} className="text-xs text-red-500 font-semibold flex items-center gap-1 hover:text-red-700">
                          <Trash2 className="h-3 w-3" /> Clear / Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">Name</label>
                        <input value={buyer.name || ''} onChange={e => handleUpdateBuyerField(index, 'name', e.target.value)} placeholder="Full Name" className="border p-2 text-xs rounded-lg bg-white w-full" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">Email</label>
                        <input value={buyer.email || ''} onChange={e => handleUpdateBuyerField(index, 'email', e.target.value)} placeholder="Email Address" className="border p-2 text-xs rounded-lg bg-white w-full" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">Phone</label>
                        <input value={buyer.phone || ''} onChange={e => handleUpdateBuyerField(index, 'phone', e.target.value)} placeholder="Phone Number" className="border p-2 text-xs rounded-lg bg-white w-full" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">Address</label>
                        <input value={buyer.address || ''} onChange={e => handleUpdateBuyerField(index, 'address', e.target.value)} placeholder="Full Address" className="border p-2 text-xs rounded-lg bg-white w-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sellers */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-bold text-gray-800 text-sm">Sellers ({getSellersList().length})</h4>
                  <button type="button" onClick={handleAddSellerField} className="text-xs text-blue-600 font-bold flex items-center gap-1 hover:text-blue-800">
                    <Plus className="h-3.5 w-3.5" /> Add Additional Seller
                  </button>
                </div>
                {getSellersList().map((seller, index) => (
                  <div key={index} className="bg-gray-50/70 p-4 rounded-xl border border-gray-200 space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-700">Seller #{index + 1} {index === 0 && '(Primary)'}</span>
                      {(index > 0 || getSellersList().length > 1) && (
                        <button type="button" onClick={() => handleRemoveSellerField(index)} className="text-xs text-red-500 font-semibold flex items-center gap-1 hover:text-red-700">
                          <Trash2 className="h-3 w-3" /> Clear / Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">Name</label>
                        <input value={seller.name || ''} onChange={e => handleUpdateSellerField(index, 'name', e.target.value)} placeholder="Full Name" className="border p-2 text-xs rounded-lg bg-white w-full" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">Email</label>
                        <input value={seller.email || ''} onChange={e => handleUpdateSellerField(index, 'email', e.target.value)} placeholder="Email Address" className="border p-2 text-xs rounded-lg bg-white w-full" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">Phone</label>
                        <input value={seller.phone || ''} onChange={e => handleUpdateSellerField(index, 'phone', e.target.value)} placeholder="Phone Number" className="border p-2 text-xs rounded-lg bg-white w-full" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 block mb-1">Address</label>
                        <input value={seller.address || ''} onChange={e => handleUpdateSellerField(index, 'address', e.target.value)} placeholder="Full Address" className="border p-2 text-xs rounded-lg bg-white w-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeOutlineTab === 'attorneys' && (
            <div className="space-y-6">
              {/* Buyer's Attorney */}
              <div className="space-y-3 bg-blue-50/40 p-4 rounded-xl border border-blue-100">
                <h4 className="text-xs font-bold text-blue-700 uppercase tracking-wide">Buyer's Attorney</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Attorney Name</label>
                    <input placeholder="Attorney / Law Firm Name" value={outlineFields.buyerAttorneyName || ''} onChange={e => updateField('buyerAttorneyName', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Address</label>
                    <input placeholder="Office Address" value={outlineFields.buyerAttorneyAddress || ''} onChange={e => updateField('buyerAttorneyAddress', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Email</label>
                    <input placeholder="Email" value={outlineFields.buyerAttorneyEmail || ''} onChange={e => updateField('buyerAttorneyEmail', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Phone</label>
                    <input placeholder="Phone" value={outlineFields.buyerAttorneyPhone || ''} onChange={e => updateField('buyerAttorneyPhone', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Fax</label>
                    <input placeholder="Fax Number" value={outlineFields.buyerAttorneyFax || ''} onChange={e => updateField('buyerAttorneyFax', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                </div>
              </div>

              {/* Seller's Attorney */}
              <div className="space-y-3 bg-amber-50/40 p-4 rounded-xl border border-amber-100">
                <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wide">Seller's Attorney</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Attorney Name</label>
                    <input placeholder="Attorney / Law Firm Name" value={outlineFields.sellerAttorneyName || ''} onChange={e => updateField('sellerAttorneyName', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Address</label>
                    <input placeholder="Office Address" value={outlineFields.sellerAttorneyAddress || ''} onChange={e => updateField('sellerAttorneyAddress', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Email</label>
                    <input placeholder="Email" value={outlineFields.sellerAttorneyEmail || ''} onChange={e => updateField('sellerAttorneyEmail', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Phone</label>
                    <input placeholder="Phone" value={outlineFields.sellerAttorneyPhone || ''} onChange={e => updateField('sellerAttorneyPhone', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Fax</label>
                    <input placeholder="Fax Number" value={outlineFields.sellerAttorneyFax || ''} onChange={e => updateField('sellerAttorneyFax', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeOutlineTab === 'agents' && (
            <div className="space-y-6">
              <div className="flex gap-6 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={!!outlineFields.isRepresentingBuyer} onChange={e => applyWorkspaceAgentData('buyer', e.target.checked)} className="rounded text-blue-600" />
                  Representing Buyer (Auto-fill Selling Agent)
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={!!outlineFields.isRepresentingSeller} onChange={e => applyWorkspaceAgentData('seller', e.target.checked)} className="rounded text-blue-600" />
                  Representing Seller (Auto-fill Listing Agent)
                </label>
              </div>

              {/* Selling Agent & Agency */}
              <div className="space-y-4 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide border-b pb-1">Selling Side (Buyer Agent & Agency)</h4>

                <div>
                  <p className="text-[11px] font-bold text-blue-700 mb-2">Selling Agent Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Selling Agent Name" value={outlineFields.sellingAgentName || ''} onChange={e => updateField('sellingAgentName', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Cell / Phone" value={outlineFields.sellingAgentCell || ''} onChange={e => updateField('sellingAgentCell', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Email" value={outlineFields.sellingAgentEmail || ''} onChange={e => updateField('sellingAgentEmail', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="License No" value={outlineFields.sellingAgentLicense || ''} onChange={e => updateField('sellingAgentLicense', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-[11px] font-bold text-blue-700 mb-2">Co-Selling Agent</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Co-Selling Agent Name" value={outlineFields.coSellingAgentName || ''} onChange={e => updateField('coSellingAgentName', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Cell / Phone" value={outlineFields.coSellingAgentCell || ''} onChange={e => updateField('coSellingAgentCell', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Email" value={outlineFields.coSellingAgentEmail || ''} onChange={e => updateField('coSellingAgentEmail', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="License No" value={outlineFields.coSellingAgentLicense || ''} onChange={e => updateField('coSellingAgentLicense', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-[11px] font-bold text-blue-700 mb-2">Selling Agency</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Agency Name" value={outlineFields.sellingAgencyName || ''} onChange={e => updateField('sellingAgencyName', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Agency Address" value={outlineFields.sellingAgencyAddress || ''} onChange={e => updateField('sellingAgencyAddress', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Agency Phone" value={outlineFields.sellingAgencyPhone || ''} onChange={e => updateField('sellingAgencyPhone', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Agency License No" value={outlineFields.sellingAgencyLicense || ''} onChange={e => updateField('sellingAgencyLicense', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                  </div>
                </div>
              </div>

              {/* Listing Agent & Agency */}
              <div className="space-y-4 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide border-b pb-1">Listing Side (Seller Agent & Agency)</h4>

                <div>
                  <p className="text-[11px] font-bold text-amber-700 mb-2">Listing Agent Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Listing Agent Name" value={outlineFields.listingAgentName || ''} onChange={e => updateField('listingAgentName', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Cell / Phone" value={outlineFields.listingAgentCell || ''} onChange={e => updateField('listingAgentCell', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Email" value={outlineFields.listingAgentEmail || ''} onChange={e => updateField('listingAgentEmail', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="License No" value={outlineFields.listingAgentLicense || ''} onChange={e => updateField('listingAgentLicense', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-[11px] font-bold text-amber-700 mb-2">Co-Listing Agent</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Co-Listing Agent Name" value={outlineFields.coListingAgentName || ''} onChange={e => updateField('coListingAgentName', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Cell / Phone" value={outlineFields.coListingAgentCell || ''} onChange={e => updateField('coListingAgentCell', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Email" value={outlineFields.coListingAgentEmail || ''} onChange={e => updateField('coListingAgentEmail', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="License No" value={outlineFields.coListingAgentLicense || ''} onChange={e => updateField('coListingAgentLicense', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                  </div>
                </div>

                <div className="pt-2">
                  <p className="text-[11px] font-bold text-amber-700 mb-2">Listing Agency</p>
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Agency Name" value={outlineFields.listingAgencyName || ''} onChange={e => updateField('listingAgencyName', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Agency Address" value={outlineFields.listingAgencyAddress || ''} onChange={e => updateField('listingAgencyAddress', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Agency Phone" value={outlineFields.listingAgencyPhone || ''} onChange={e => updateField('listingAgencyPhone', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                    <input placeholder="Agency License No" value={outlineFields.listingAgencyLicense || ''} onChange={e => updateField('listingAgencyLicense', e.target.value)} className="border p-2 text-xs rounded-lg bg-white" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeOutlineTab === 'financials' && (
            <div className="space-y-6">
              {/* Terms of Sale */}
              <div className="space-y-3 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide border-b pb-1">Terms of the Sale</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Selling Price ($)</label>
                    <input type="number" placeholder="Selling Price" value={outlineFields.sellingPrice || ''} onChange={e => updateField('sellingPrice', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Deposit at Signing ($)</label>
                    <input type="number" placeholder="Contract Deposit" value={outlineFields.depositAmount || ''} onChange={e => updateField('depositAmount', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Mortgage Amount ($)</label>
                    <input type="number" placeholder="Mortgage Amount" value={outlineFields.mortgageAmount || ''} onChange={e => updateField('mortgageAmount', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Cash at Closing ($)</label>
                    <input type="number" placeholder="Cash at Closing" value={outlineFields.cashAtClosing || ''} onChange={e => updateField('cashAtClosing', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Mortgage Contingency Date</label>
                    <input type="date" value={outlineFields.mortgageContingencyDate || ''} onChange={e => updateField('mortgageContingencyDate', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Target Closing Date</label>
                    <input type="date" value={outlineFields.targetClosingDate || tx?.target_close_date || ''} onChange={e => updateField('targetClosingDate', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                </div>
              </div>

              {/* Finance Information */}
              <div className="space-y-3 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide border-b pb-1">Finance Information</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Loan / Exchange Officer</label>
                    <input placeholder="Loan Officer Name" value={outlineFields.loanOfficerName || ''} onChange={e => updateField('loanOfficerName', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Officer Phone</label>
                    <input placeholder="Phone" value={outlineFields.loanOfficerPhone || ''} onChange={e => updateField('loanOfficerPhone', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Officer Email</label>
                    <input placeholder="Email" value={outlineFields.loanOfficerEmail || ''} onChange={e => updateField('loanOfficerEmail', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">1031 Exchange / Financial Institution</label>
                    <input placeholder="Bank / Lending Institute Name" value={outlineFields.financeInstitute || ''} onChange={e => updateField('financeInstitute', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                </div>
              </div>

              {/* Building Management / Managing Agent */}
              <div className="space-y-3 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide border-b pb-1">Building Management / Managing Agent</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Management Company</label>
                    <input placeholder="Management Company Name" value={outlineFields.managementCompany || ''} onChange={e => updateField('managementCompany', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Managing Agent Name</label>
                    <input placeholder="Managing Agent Name" value={outlineFields.managingAgentName || ''} onChange={e => updateField('managingAgentName', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Managing Agent Phone</label>
                    <input placeholder="Phone" value={outlineFields.managingAgentPhone || ''} onChange={e => updateField('managingAgentPhone', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Managing Agent Email</label>
                    <input placeholder="Email" value={outlineFields.managingAgentEmail || ''} onChange={e => updateField('managingAgentEmail', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                </div>
              </div>

              {/* Outline Administration */}
              <div className="space-y-3 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide border-b pb-1">Outline Administration</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Prepared By</label>
                    <input placeholder="Preparer Name" value={outlineFields.preparedBy || ''} onChange={e => updateField('preparedBy', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 block mb-1">Date Prepared</label>
                    <input type="date" value={outlineFields.date || ''} onChange={e => updateField('date', e.target.value)} className="border p-2 text-xs rounded-lg bg-white w-full" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeOutlineTab === 'notes' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 block">Additional Notes / Special Provisions</label>
              <textarea rows={8} value={outlineFields.notes || ''} onChange={e => updateField('notes', e.target.value)} placeholder="Type any extra terms, contingencies, or notes..." className="border p-3 text-xs rounded-xl bg-white w-full" />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button type="submit" className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-sm transition-colors">Save Outline</button>
          </div>
        </form>
      </div>
    </div>
  )
}
