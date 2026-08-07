import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useTransactionDetail } from './TransactionContext'
import { Plus } from 'lucide-react'
import clsx from 'clsx'

interface TransactionOutlineModalProps {
  isOpen: boolean
  onClose: () => void
}

export function TransactionOutlineModal({ isOpen, onClose }: TransactionOutlineModalProps) {
  const { user, branding } = useAuth()
  const { data, handleUpdateOutline } = useTransactionDetail()
  const { transaction: tx } = data

  const [outlineFields, setOutlineFields] = useState<any>({})
  const [activeOutlineTab, setActiveOutlineTab] = useState<'parties' | 'attorneys' | 'agents' | 'financials' | 'notes'>('parties')

  useEffect(() => {
    if (tx?.parties_involved) {
      try {
        if (tx.parties_involved.startsWith('{')) {
          setOutlineFields(JSON.parse(tx.parties_involved))
        } else {
          setOutlineFields({ notes: tx.parties_involved })
        }
      } catch (e) {
        setOutlineFields({ notes: tx.parties_involved })
      }
    } else {
      setOutlineFields({})
    }
  }, [tx])

  if (!isOpen) return null

  const updateField = (key: string, value: any) => {
    setOutlineFields((prev: any) => ({ ...prev, [key]: value }))
  }

  const getBuyersList = () => {
    const list = [...(outlineFields.additionalBuyers || [])]
    if (outlineFields.buyerName) {
      list.unshift({ name: outlineFields.buyerName, address: outlineFields.buyerAddress, email: outlineFields.buyerEmail, phone: outlineFields.buyerPhone })
    }
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
        arr[index - 1] = { ...arr[index - 1], [key]: val }
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
    if (outlineFields.sellerName) {
      list.unshift({ name: outlineFields.sellerName, address: outlineFields.sellerAddress, email: outlineFields.sellerEmail, phone: outlineFields.sellerPhone })
    }
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
        arr[index - 1] = { ...arr[index - 1], [key]: val }
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
        next.sellingAgencyName = branding.companyName || ''
      } else {
        next.listingAgentName = user.name || ''
        next.listingAgentEmail = user.email || ''
        next.listingAgentCell = userAny.phone || ''
        next.listingAgentLicense = user.licenseNumber || ''
        next.listingAgencyName = branding.companyName || ''
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
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 p-6 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Edit Deal Outline Fields</h2>
            <p className="text-xs text-gray-400 mt-0.5">These inputs map directly to the printed Deal Outline Sheet.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex border-b border-gray-100 px-6 text-sm font-semibold text-gray-500 overflow-x-auto">
          {(['parties', 'attorneys', 'agents', 'financials', 'notes'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveOutlineTab(tab)}
              className={clsx(
                "py-3 border-b-2 px-3 capitalize flex-shrink-0",
                activeOutlineTab === tab ? "border-blue-600 text-blue-600" : "border-transparent hover:text-gray-700"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {activeOutlineTab === 'parties' && (
            <div className="space-y-6">
              {/* Buyers */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-bold text-gray-800 text-sm">Buyers ({getBuyersList().length})</h4>
                  <button type="button" onClick={handleAddBuyerField} className="text-xs text-blue-600 font-bold flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add Buyer
                  </button>
                </div>
                {getBuyersList().map((buyer, index) => (
                  <div key={index} className="bg-gray-50/50 p-4 rounded-xl border space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-700">Buyer #{index + 1}</span>
                      {index > 0 && (
                        <button type="button" onClick={() => handleRemoveBuyerField(index)} className="text-[10px] text-red-500 font-semibold">Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <input value={buyer.name || ''} onChange={e => handleUpdateBuyerField(index, 'name', e.target.value)} placeholder="Name" className="border p-1.5 text-xs rounded bg-white" />
                      <input value={buyer.email || ''} onChange={e => handleUpdateBuyerField(index, 'email', e.target.value)} placeholder="Email" className="border p-1.5 text-xs rounded bg-white" />
                    </div>
                  </div>
                ))}
              </div>

              {/* Sellers */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <h4 className="font-bold text-gray-800 text-sm">Sellers ({getSellersList().length})</h4>
                  <button type="button" onClick={handleAddSellerField} className="text-xs text-blue-600 font-bold flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" /> Add Seller
                  </button>
                </div>
                {getSellersList().map((seller, index) => (
                  <div key={index} className="bg-gray-50/50 p-4 rounded-xl border space-y-3 relative">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-700">Seller #{index + 1}</span>
                      {index > 0 && (
                        <button type="button" onClick={() => handleRemoveSellerField(index)} className="text-[10px] text-red-500 font-semibold">Remove</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <input value={seller.name || ''} onChange={e => handleUpdateSellerField(index, 'name', e.target.value)} placeholder="Name" className="border p-1.5 text-xs rounded bg-white" />
                      <input value={seller.email || ''} onChange={e => handleUpdateSellerField(index, 'email', e.target.value)} placeholder="Email" className="border p-1.5 text-xs rounded bg-white" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeOutlineTab === 'attorneys' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-blue-600 uppercase">Buyer's Attorney</h4>
                <div className="grid grid-cols-2 gap-4">
                  <input placeholder="Name" value={outlineFields.buyerAttorneyName || ''} onChange={e => updateField('buyerAttorneyName', e.target.value)} className="border p-2 text-xs rounded" />
                  <input placeholder="Address" value={outlineFields.buyerAttorneyAddress || ''} onChange={e => updateField('buyerAttorneyAddress', e.target.value)} className="border p-2 text-xs rounded" />
                </div>
              </div>
              <div className="space-y-3 pt-4 border-t">
                <h4 className="text-xs font-bold text-amber-600 uppercase">Seller's Attorney</h4>
                <div className="grid grid-cols-2 gap-4">
                  <input placeholder="Name" value={outlineFields.sellerAttorneyName || ''} onChange={e => updateField('sellerAttorneyName', e.target.value)} className="border p-2 text-xs rounded" />
                  <input placeholder="Address" value={outlineFields.sellerAttorneyAddress || ''} onChange={e => updateField('sellerAttorneyAddress', e.target.value)} className="border p-2 text-xs rounded" />
                </div>
              </div>
            </div>
          )}

          {activeOutlineTab === 'agents' && (
            <div className="space-y-6">
              <div className="flex gap-4 mb-4">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={!!outlineFields.isRepresentingBuyer} onChange={e => applyWorkspaceAgentData('buyer', e.target.checked)} /> Representing Buyer
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={!!outlineFields.isRepresentingSeller} onChange={e => applyWorkspaceAgentData('seller', e.target.checked)} /> Representing Seller
                </label>
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-blue-600 uppercase">Selling Agent</h4>
                <input placeholder="Agent Name" value={outlineFields.sellingAgentName || ''} onChange={e => updateField('sellingAgentName', e.target.value)} className="border p-2 text-xs rounded w-full" />
              </div>
            </div>
          )}

          {activeOutlineTab === 'financials' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs block mb-1">Selling Price ($)</label>
                  <input type="number" value={outlineFields.sellingPrice || ''} onChange={e => updateField('sellingPrice', e.target.value)} className="border p-2 text-xs rounded w-full" />
                </div>
                <div>
                  <label className="text-xs block mb-1">Contract Deposit ($)</label>
                  <input type="number" value={outlineFields.depositAmount || ''} onChange={e => updateField('depositAmount', e.target.value)} className="border p-2 text-xs rounded w-full" />
                </div>
              </div>
            </div>
          )}

          {activeOutlineTab === 'notes' && (
            <div>
              <label className="text-xs block mb-1">Additional Notes</label>
              <textarea rows={6} value={outlineFields.notes || ''} onChange={e => updateField('notes', e.target.value)} className="border p-2 text-xs rounded w-full" />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
            <button type="submit" className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-bold">Save Outline</button>
          </div>
        </form>
      </div>
    </div>
  )
}
