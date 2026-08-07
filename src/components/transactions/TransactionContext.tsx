import React, { createContext, useContext, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

export interface TransactionContextType {
  id: string | undefined
  data: any
  isLoading: boolean
  outcomes: any[]
  offers: any[]
  historyDeals: any[]
  availableTemplates: any[]
  outcomeTemplates: any[]
  directoryUsers: any[]
  networkContacts: any[]
  networkAttorneys: any[]
  networkLenders: any[]

  // State Setters & Refs
  setData: React.Dispatch<React.SetStateAction<any>>
  setOffers: React.Dispatch<React.SetStateAction<any[]>>
  setOutcomes: React.Dispatch<React.SetStateAction<any[]>>
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>

  // Handlers / API Methods
  fetchTransaction: () => Promise<void>
  fetchOffers: () => Promise<void>
  handleSaveOffer: (offerToSave: any) => Promise<any>
  handlePostOutcome: (message: string, isAdvice: boolean) => Promise<void>
  handleResetOutcomes: () => Promise<void>
  handleUpdateDetails: (payload: any) => Promise<boolean>
  handleAddTeamMember: (userId: string) => Promise<boolean>
  handleRemoveTeamMember: (userId: string) => Promise<void>
  handleUpdateOutline: (outlineFields: any) => Promise<boolean>
  handleDeleteDeal: () => Promise<void>
  applyTemplate: (templateId: string, isTemplate?: boolean) => Promise<void>
  handleCreateTask: (taskPayload: { title: string; attachment_required: boolean; broker_approval_required: boolean; group_name: string | null; due_date: string | null }) => Promise<boolean>
  toggleTask: (taskId: string, currentStatus: string) => Promise<void>
  handleUploadTaskDocWithProgress: (taskId: string, file: File, onProgress: (pct: number) => void) => Promise<void>
  handleDeleteTaskDoc: (taskId: string, documentKey: string) => Promise<void>
  handleUpdateTaskApproval: (taskId: string, approvalStatus: 'approved' | 'rejected', notes?: string) => Promise<void>
  handleDeleteTask: (taskId: string) => Promise<void>
  handleRename: (docId: string, newName: string) => Promise<void>
  handleMove: (docId: string, destFolderId: string) => Promise<void>
  handleNotifyTeam: (milestoneKey: string, dateVal: string) => Promise<void>
  handleCreateChecklistReminder: (friendlyName: string, dateVal: string) => Promise<void>
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined)

export function useTransactionDetail() {
  const context = useContext(TransactionContext)
  if (!context) {
    throw new Error('useTransactionDetail must be used within a TransactionProvider')
  }
  return context
}

export function TransactionProvider({ children }: { children: React.ReactNode }) {
  const { id } = useParams()
  const navigate = useNavigate()

  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [outcomes, setOutcomes] = useState<any[]>([])
  const [offers, setOffers] = useState<any[]>([])
  const [historyDeals, setHistoryDeals] = useState<any[]>([])
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([])
  const [outcomeTemplates, setOutcomeTemplates] = useState<any[]>([])
  const [directoryUsers, setDirectoryUsers] = useState<any[]>([])
  const [networkContacts, setNetworkContacts] = useState<any[]>([])
  const [networkAttorneys, setNetworkAttorneys] = useState<any[]>([])
  const [networkLenders, setNetworkLenders] = useState<any[]>([])

  const fetchTransaction = async () => {
    if (!id) return
    try {
      const res = await fetch(`/api/transactions/${id}`)
      const json = await res.json()
      if (json.success) {
        setData(json.data)
        setOutcomes(json.data.outcomes || [])

        const tx = json.data.transaction
        if (tx.inventory_listing_id) {
          try {
            const histRes = await fetch(`/api/transactions?inventory_listing_id=${tx.inventory_listing_id}`)
            const histJson = await histRes.json()
            if (histJson.success) {
              setHistoryDeals(histJson.data.filter((d: any) => d.id !== tx.id))
            }
          } catch (e) {
            console.error('Failed to load history deals', e)
          }
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchOffers = async () => {
    if (!id) return
    try {
      const res = await fetch(`/api/transactions/${id}/offers`)
      const json = await res.json()
      if (json.success) {
        setOffers(json.data || [])
      }
    } catch (e) {
      console.error('Failed to fetch offers', e)
    }
  }

  const fetchAvailableTemplates = async () => {
    try {
      const res = await fetch('/api/transactions/templates')
      const json = await res.json()
      if (Array.isArray(json.data)) {
        setAvailableTemplates(json.data)
      } else if (Array.isArray(json)) {
        setAvailableTemplates(json)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const loadNetworkContacts = async () => {
    try {
      const res = await fetch('/api/network')
      const json = await res.json()
      if (!json.success || !Array.isArray(json.data)) return
      const contacts = json.data
      setNetworkContacts(contacts)
      setNetworkAttorneys(contacts.filter((c: any) => String(c.type || '').toLowerCase() === 'attorney'))
      setNetworkLenders(contacts.filter((c: any) =>
        ['mortgage', 'lender', 'loan officer', 'loan_officer'].includes(String(c.type || '').toLowerCase())
      ))
    } catch (e) {
      console.error('Failed to load network contacts', e)
    }
  }

  useEffect(() => {
    fetchTransaction()
    fetchOffers()
    fetchAvailableTemplates()
    loadNetworkContacts()

    async function loadOutcomeTemplates() {
      try {
        const res = await fetch('/api/transactions/outcomes/templates')
        const json = await res.json()
        if (Array.isArray(json)) setOutcomeTemplates(json)
      } catch (e) {
        console.error(e)
      }
    }
    loadOutcomeTemplates()
  }, [id])

  useEffect(() => {
    let active = true
    async function loadDirectory() {
      try {
        const res = await fetch(`/api/directory/users`)
        const json = await res.json()
        if (active && Array.isArray(json.data)) {
          setDirectoryUsers(json.data)
        }
      } catch (e) {
        console.error(e)
      }
    }
    loadDirectory()
    return () => { active = false }
  }, [])

  const handleSaveOffer = async (offerToSave: any) => {
    if (!id) return null
    try {
      const res = await fetch(`/api/transactions/${id}/offers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offer: offerToSave })
      })
      const json = await res.json()
      if (json.success) {
        setOffers(prev => {
          const exists = prev.some(o => o.id === json.data.id)
          if (exists) {
            return prev.map(o => o.id === json.data.id ? json.data : o)
          } else {
            return [json.data, ...prev]
          }
        })
        return json.data
      } else {
        alert(json.error || 'Failed to save offer')
      }
    } catch (e) {
      console.error('Error saving offer:', e)
      alert('An error occurred while saving the offer')
    }
    return null
  }

  const handlePostOutcome = async (message: string, isAdvice: boolean) => {
    if (!id) return
    try {
      const res = await fetch(`/api/transactions/${id}/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, is_broker_advice: isAdvice })
      })
      if (res.ok) {
        fetchTransaction()
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleResetOutcomes = async () => {
    if (!id) return
    if (!window.confirm('Are you sure you want to clear/reset the chat history? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/transactions/${id}/outcomes`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setOutcomes([])
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleUpdateDetails = async (payload: any) => {
    if (!id) return false
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (res.ok) {
        fetchTransaction()
        return true
      }
    } catch (e) {
      console.error(e)
    }
    return false
  }

  const handleAddTeamMember = async (targetUserId: string) => {
    if (!id) return false
    try {
      const res = await fetch(`/api/transactions/${id}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: targetUserId, role: 'co-agent' })
      })
      if (res.ok) {
        fetchTransaction()
        return true
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to add team member')
      }
    } catch (e) {
      console.error(e)
    }
    return false
  }

  const handleRemoveTeamMember = async (targetUserId: string) => {
    if (!id) return
    if (!confirm('Remove this member from the deal team?')) return
    try {
      const res = await fetch(`/api/transactions/${id}/team/${targetUserId}`, { method: 'DELETE' })
      if (res.ok) fetchTransaction()
    } catch (e) {
      console.error(e)
    }
  }

  const handleUpdateOutline = async (outlineFields: any) => {
    if (!id) return false
    try {
      const partiesJson = JSON.stringify(outlineFields)
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parties_involved: partiesJson })
      })
      if (res.ok) {
        fetchTransaction()
        return true
      }
    } catch (e) {
      console.error(e)
    }
    return false
  }

  const handleDeleteDeal = async () => {
    if (!id) return
    if (!confirm('Are you absolutely sure you want to delete this transaction/deal? This action is permanent.')) return
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        navigate('/transactions/pipeline')
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to delete deal')
      }
    } catch (e) {
      console.error(e)
    }
  }

  const applyTemplate = async (templateId: string, isTemplate = true) => {
    if (!id) return
    try {
      const res = await fetch(`/api/transactions/${id}/apply-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isTemplate ? { template_id: templateId } : { template: templateId })
      })
      if (res.ok) fetchTransaction()
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreateTask = async (taskPayload: { title: string; attachment_required: boolean; broker_approval_required: boolean; group_name: string | null; due_date: string | null }) => {
    if (!id) return false
    try {
      const res = await fetch(`/api/transactions/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskPayload)
      })
      if (res.ok) {
        fetchTransaction()
        return true
      }
    } catch (e) {
      console.error(e)
    }
    return false
  }

  const toggleTask = async (taskId: string, currentStatus: string) => {
    if (!id) return
    const task = data?.tasks?.find((item: any) => item.id === taskId)
    const nextStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    if (nextStatus === 'completed' && task?.document_required && !task?.document_key) {
      alert('This checklist item requires a document attachment before it can be completed.')
      return
    }

    try {
      const res = await fetch(`/api/transactions/${id}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      })
      if (res.ok) {
        fetchTransaction()
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleUploadTaskDocWithProgress = async (taskId: string, file: File, onProgress: (pct: number) => void) => {
    if (!id) return
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('entity_type', 'transaction_task')
      formData.append('entity_id', taskId)

      const xhr = new XMLHttpRequest()
      const uploadJson = await new Promise<any>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100))
          }
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            reject(new Error('Upload failed'))
          }
        })
        xhr.open('POST', '/api/documents/upload')
        xhr.send(formData)
      })

      if (uploadJson.success) {
        await fetch(`/api/transactions/${id}/tasks/${taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_key: uploadJson.data.key })
        })
        fetchTransaction()
      }
    } catch (e) {
      console.error(e)
      alert('Upload failed')
    }
  }

  const handleDeleteTaskDoc = async (taskId: string, documentKey: string) => {
    if (!id) return
    if (!confirm('Are you sure you want to delete this compliance document?')) return
    try {
      const listRes = await fetch(`/api/documents?entity_type=transaction_task&entity_id=${taskId}`)
      const docsJson = await listRes.json()
      const docs = docsJson?.data ?? docsJson
      if (Array.isArray(docs)) {
        const docToDelete = docs.find((d: any) => d.file_key === documentKey)
        if (docToDelete) {
          await fetch(`/api/documents/${docToDelete.id}`, { method: 'DELETE' })
        }
      }
      await fetch(`/api/transactions/${id}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_key: null, approval_status: 'pending', approval_notes: '' })
      })
      fetchTransaction()
    } catch (e) {
      console.error(e)
    }
  }

  const handleUpdateTaskApproval = async (taskId: string, approvalStatus: 'approved' | 'rejected', notes?: string) => {
    if (!id) return
    try {
      await fetch(`/api/transactions/${id}/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approval_status: approvalStatus, approval_notes: notes || '' })
      })
      fetchTransaction()
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!id) return
    if (!confirm('Delete this checklist item?')) return
    try {
      const res = await fetch(`/api/transactions/${id}/tasks/${taskId}`, {
        method: 'DELETE'
      })
      if (res.ok) fetchTransaction()
    } catch (e) {
      console.error(e)
    }
  }

  const handleRename = async (docId: string, newName: string) => {
    if (!newName.trim()) return
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: newName })
      })
      if (res.ok) fetchTransaction()
    } catch (err) {
      console.error(err)
    }
  }

  const handleMove = async (docId: string, destFolderId: string) => {
    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: destFolderId })
      })
      if (res.ok) fetchTransaction()
    } catch (err) {
      console.error(err)
    }
  }

  const handleNotifyTeam = async (milestoneKey: string, dateVal: string) => {
    if (!id || !dateVal) return
    try {
      const res = await fetch(`/api/transactions/${id}/timeline/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone: milestoneKey, date: dateVal })
      })
      if (res.ok) {
        const json = await res.ok ? await res.json() : {}
        alert(`Successfully notified ${json.notifiedCount || 0} team member(s) via email!`)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreateChecklistReminder = async (friendlyName: string, dateVal: string) => {
    if (!id || !dateVal) return
    try {
      const res = await fetch(`/api/transactions/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Milestone Reminder: ${friendlyName}`,
          description: `Automatically created task reminder for milestone "${friendlyName}" scheduled on ${dateVal}.`,
          due_date: dateVal,
          group_name: 'Milestones & Dates',
          broker_approval_required: false
        })
      })
      if (res.ok) {
        fetchTransaction()
        alert(`Successfully added a new compliance task reminder to your Tasks tab: "Milestone Reminder: ${friendlyName}" due on ${dateVal}!`)
      }
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <TransactionContext.Provider
      value={{
        id,
        data,
        isLoading,
        outcomes,
        offers,
        historyDeals,
        availableTemplates,
        outcomeTemplates,
        directoryUsers,
        networkContacts,
        networkAttorneys,
        networkLenders,
        setData,
        setOffers,
        setOutcomes,
        setIsLoading,
        fetchTransaction,
        fetchOffers,
        handleSaveOffer,
        handlePostOutcome,
        handleResetOutcomes,
        handleUpdateDetails,
        handleAddTeamMember,
        handleRemoveTeamMember,
        handleUpdateOutline,
        handleDeleteDeal,
        applyTemplate,
        handleCreateTask,
        toggleTask,
        handleUploadTaskDocWithProgress,
        handleDeleteTaskDoc,
        handleUpdateTaskApproval,
        handleDeleteTask,
        handleRename,
        handleMove,
        handleNotifyTeam,
        handleCreateChecklistReminder,
      }}
    >
      {children}
    </TransactionContext.Provider>
  )
}
