import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { useAuth } from '@/context/AuthContext'
import {
  ArrowLeft, Loader2, CalendarDays,
  CheckCircle2, Circle, Trash2, Printer, Edit3, X, Check, FileText, Upload, Plus,
  Folder, FolderPlus, Move, ChevronRight, Lock, Unlock,
  ChevronDown, ChevronUp, MoreHorizontal, Mail, ExternalLink,
  Search, Tag
} from 'lucide-react'
import confetti from 'canvas-confetti'
import clsx from 'clsx'
import { StageGateModal } from '@/components/transactions/StageGateModal'

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

export function TransactionDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, branding } = useAuth()
  
  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Edit form states
  const [editType, setEditType] = useState('sale')
  const [editPrice, setEditPrice] = useState('')
  const [editCommAmount, setEditCommAmount] = useState('')
  const [editCommRate, setEditCommRate] = useState('')
  const [editCloseDate, setEditCloseDate] = useState('')
  const [editAgreementType, setEditAgreementType] = useState('')
  const [editAgreementExpiry, setEditAgreementExpiry] = useState('')
  const [networkAttorneys, setNetworkAttorneys] = useState<any[]>([])
  const [networkLenders, setNetworkLenders] = useState<any[]>([])
  const [networkContacts, setNetworkContacts] = useState<any[]>([])

  // Outline Sheet states
  const [isOutlineEditOpen, setIsOutlineEditOpen] = useState(false)
  const [outlineFields, setOutlineFields] = useState<any>({})
  const [activeOutlineTab, setActiveOutlineTab] = useState<'parties' | 'attorneys' | 'agents' | 'financials' | 'notes'>('parties')
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [historyDeals, setHistoryDeals] = useState<any[]>([])
  
  const [directoryUsers, setDirectoryUsers] = useState<any[]>([])
  const [teamSearchQuery, setTeamSearchQuery] = useState('')
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false)
  const [isAddingTeam, setIsAddingTeam] = useState(false)
  
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskGroup, setNewTaskGroup] = useState('')
  const [newTaskReqAttach, setNewTaskReqAttach] = useState(false)
  const [newTaskReqBroker, setNewTaskReqBroker] = useState(false)
  const [isAddingTask, setIsAddingTask] = useState(false)

  const [mainTab, setMainTab] = useState<'tasks' | 'documents' | 'offers' | 'outcomes' | 'timeline' | 'settings'>('tasks')
  const [settingName, setSettingName] = useState('')
  const [listedDate, setListedDate] = useState('')
  const [expireDate, setExpireDate] = useState('')
  const [offerDate, setOfferDate] = useState('')
  const [pendingDate, setPendingDate] = useState('')
  const [homeInspectionDate, setHomeInspectionDate] = useState('')
  const [possessionDate, setPossessionDate] = useState('')
  const [escrowDate, setEscrowDate] = useState('')
  const [inspectionDeadline, setInspectionDeadline] = useState('')
  const [appraisalDate, setAppraisalDate] = useState('')
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [newOutcomeMessage, setNewOutcomeMessage] = useState('')
  const [isOutcomeAdvice, setIsOutcomeAdvice] = useState(false)
  const [isPostingOutcome, setIsPostingOutcome] = useState(false)
  const [outcomeTemplates, setOutcomeTemplates] = useState<any[]>([])

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [movingDocId, setMovingDocId] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<any[]>([])
  const [stageGateTarget, setStageGateTarget] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [docUploadProgress, setDocUploadProgress] = useState<number | null>(null)

  // PRESET AGENCIES & DYNAMIC LOOKUP CACHE
  const PRESET_AGENCIES = [
    { name: 'Prime America Real Estate, Inc.', address: '6123 Fresh Pond Road, Queens, NY 11379', phone: '347-725-3142', license: '1099120489' },
    { name: 'Prime America Real Estate', address: '6123 Fresh Pond Road, Queens, NY 11379', phone: '347-725-3142', license: '1099120489' },
    { name: 'Douglas Elliman Real Estate', address: '575 Madison Ave, New York, NY 10022', phone: '212-891-7000', license: '1099120001' },
    { name: 'Compass Real Estate', address: '90 Fifth Ave, New York, NY 10011', phone: '212-913-9058', license: '1099120002' },
    { name: 'Coldwell Banker Realty', address: '1 Wall Street, New York, NY 10005', phone: '212-555-0199', license: '1099120003' },
    { name: 'Corcoran Group', address: '660 Madison Ave, New York, NY 10065', phone: '212-355-3550', license: '1099120004' },
    { name: 'Keller Williams Realty', address: '115 E 57th St, New York, NY 10022', phone: '212-838-3700', license: '1099120005' },
  ]

  const lookupAgencyInfo = (term: string) => {
    if (!term || !term.trim()) return null
    const q = term.toLowerCase().trim()
    try {
      const customRaw = localStorage.getItem('agency_lookup_cache')
      if (customRaw) {
        const customArr = JSON.parse(customRaw)
        if (Array.isArray(customArr)) {
          const match = customArr.find((a: any) => a.name?.toLowerCase().includes(q) || q.includes(a.name?.toLowerCase()))
          if (match) return match
        }
      }
    } catch (e) {}
    return PRESET_AGENCIES.find((a) => a.name.toLowerCase().includes(q) || q.includes(a.name.toLowerCase())) || null
  }

  const saveCustomAgencyToCache = (agencyObj: { name: string; address?: string; phone?: string; license?: string }) => {
    if (!agencyObj.name) return
    try {
      const customRaw = localStorage.getItem('agency_lookup_cache')
      const customArr = customRaw ? JSON.parse(customRaw) : []
      const idx = customArr.findIndex((a: any) => a.name?.toLowerCase() === agencyObj.name.toLowerCase())
      if (idx !== -1) customArr[idx] = { ...customArr[idx], ...agencyObj }
      else customArr.push(agencyObj)
      localStorage.setItem('agency_lookup_cache', JSON.stringify(customArr))
    } catch (e) {}
  }

  // OFFERS MANAGEMENT STATE
  const [offers, setOffers] = useState<any[]>(() => {
    try {
      const stored = localStorage.getItem(`tx_offers_${id}`)
      return stored ? JSON.parse(stored) : []
    } catch (e) {
      return []
    }
  })
  const [showCreateOfferModal, setShowCreateOfferModal] = useState(false)
  const [showPrintOfferModal, setShowPrintOfferModal] = useState(false)
  const [selectedOffer, setSelectedOffer] = useState<any>(null)
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

  // Sync offers to localStorage
  useEffect(() => {
    if (id) {
      localStorage.setItem(`tx_offers_${id}`, JSON.stringify(offers))
    }
  }, [offers, id])

  const handleOpenCreateOfferModal = () => {
    const buyers = typeof getBuyersList === 'function' ? getBuyersList() : []
    const sellers = typeof getSellersList === 'function' ? getSellersList() : []
    const defaultPrice = Number(tx?.price || tx?.offerAmount || outlineFields?.sellingPrice || 2000000)
    const defaultDown = Math.round(defaultPrice * 0.50)
    const defaultMortgage = Math.max(0, defaultPrice - defaultDown)

    setOfferForm({
      id: `offer_${Date.now()}`,
      offerType: 'sales_agreement',
      offerDate: new Date().toISOString().substring(0, 10),
      purchaserName: buyers[0]?.name || tx?.clientName || tx?.buyerName || outlineFields?.buyerName || 'Surya Shrestha',
      purchaserAddress: buyers[0]?.address || outlineFields?.buyerAddress || 'Queens, NY 11379',
      sellerName: sellers[0]?.name || tx?.sellerName || outlineFields?.sellerName || 'Prime America Real Estate',
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
      loanOfficerName: outlineFields?.loanOfficerName || outlineFields?.mortgageOfficerName || 'Maura Crowley',
      loanOfficerCompany: outlineFields?.financeInstitute || outlineFields?.mortgageBankerName || 'LenJen Corp',
      loanOfficerPhone: outlineFields?.loanOfficerPhone || outlineFields?.mortgageOfficerPhone || '(516) 687-6738',
      loanOfficerEmail: outlineFields?.loanOfficerEmail || outlineFields?.mortgageOfficerEmail || 'Maura@Lendgen.com',
      loanOfficerAddress: outlineFields?.mortgageOfficerAddress || '6851 Jericho Turnpike, Syosset, New York 11791',
      attorneyName: outlineFields?.buyerAttorneyName || 'John A Colonna',
      attorneyFirm: outlineFields?.buyerAttorneyAddress ? 'Law Office Of John A. Colonna' : 'Law Office Of John A. Colonna',
      attorneyPhone: outlineFields?.buyerAttorneyPhone || '(718) 894-4600',
      attorneyEmail: outlineFields?.buyerAttorneyEmail || 'John@Colonna-Law.com',
      attorneyAddress: outlineFields?.buyerAttorneyAddress || '73-15 Metropolitan Avenue Middle Village NY 11379',
      buyerAgentName: user?.name || 'Surya Shrestha',
      sellerAgentName: outlineFields?.listingAgentName || 'Listing Agent',
      sellerAgentTel: outlineFields?.listingAgentCell || outlineFields?.listingAgentPhone || '(347) 725-3142',
      buyerBrokerCommission: 'Seller to pay Buyer Broker 2% of purchase price, payable to Prime America Real Estate upon closing.',
      inspectionDate: tx?.home_inspection_date || '',
      possessionDate: tx?.possession_date || '',
      status: 'submitted'
    })
    setShowCreateOfferModal(true)
  }

  // ── NEW UI STATE ──────────────────────────────────────────────────────────
  // Collapsible left-panel cards
  const [cardCollapsed, setCardCollapsed] = useState<Record<string, boolean>>({})
  const toggleCard = (key: string) => setCardCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  // Export/Print dropdown
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  // Email-to-parties modal
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([])
  const [isSendingEmail, setIsSendingEmail] = useState(false)

  // Task row overflow menus
  const [taskMenuOpen, setTaskMenuOpen] = useState<string | null>(null)

  // Documents sub-tab
  const [docSubTab, setDocSubTab] = useState<'all' | 'checklist'>('all')

  // Lock confirmation modal
  const [lockConfirmOpen, setLockConfirmOpen] = useState(false)

  // Deal stage stepper
  const DEAL_STAGES = ['New Lead', 'Listed', 'Offer Received', 'Under Contract', 'Inspection', 'Closed'] as const
  type DealStage = typeof DEAL_STAGES[number]
  const getStageFromStatus = (status: string): DealStage => {
    if (status === 'closed') return 'Closed'
    if (status === 'under_contract') return 'Under Contract'
    if (status === 'offer_received') return 'Offer Received'
    if (status === 'active') return 'Listed'
    if (status === 'lead') return 'New Lead'
    return 'New Lead'
  }

  // Close export dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mainTab === 'outcomes') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [outcomes, mainTab])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const updateField = (key: string, value: string) => {
    setOutlineFields((prev: any) => ({ ...prev, [key]: value }))
  }

  const getBuyersList = (): any[] => {
    if (Array.isArray(outlineFields.buyers)) return outlineFields.buyers
    return [
      {
        name: outlineFields.buyerName || '',
        email: outlineFields.buyerEmail || '',
        phone: outlineFields.buyerPhone || '',
        address: outlineFields.buyerAddress || ''
      }
    ]
  }

  const getSellersList = (): any[] => {
    if (Array.isArray(outlineFields.sellers)) return outlineFields.sellers
    return [
      {
        name: outlineFields.sellerName || '',
        email: outlineFields.sellerEmail || '',
        phone: outlineFields.sellerPhone || '',
        address: outlineFields.sellerAddress || ''
      }
    ]
  }

  const handleUpdateBuyerField = (index: number, key: string, value: string) => {
    const list = [...getBuyersList()]
    list[index] = { ...list[index], [key]: value }
    setOutlineFields((prev: any) => ({
      ...prev,
      buyers: list,
      ...(index === 0 && {
        buyerName: list[0].name,
        buyerEmail: list[0].email,
        buyerPhone: list[0].phone,
        buyerAddress: list[0].address
      })
    }))
  }

  const handleAddBuyerField = () => {
    const list = [...getBuyersList(), { name: '', email: '', phone: '', address: '' }]
    setOutlineFields((prev: any) => ({ ...prev, buyers: list }))
  }

  const handleRemoveBuyerField = (index: number) => {
    const list = getBuyersList().filter((_, i) => i !== index)
    setOutlineFields((prev: any) => ({
      ...prev,
      buyers: list,
      ...(list.length > 0 && {
        buyerName: list[0].name,
        buyerEmail: list[0].email,
        buyerPhone: list[0].phone,
        buyerAddress: list[0].address
      })
    }))
  }

  const handleUpdateSellerField = (index: number, key: string, value: string) => {
    const list = [...getSellersList()]
    list[index] = { ...list[index], [key]: value }
    setOutlineFields((prev: any) => ({
      ...prev,
      sellers: list,
      ...(index === 0 && {
        sellerName: list[0].name,
        sellerEmail: list[0].email,
        sellerPhone: list[0].phone,
        sellerAddress: list[0].address
      })
    }))
  }

  const handleAddSellerField = () => {
    const list = [...getSellersList(), { name: '', email: '', phone: '', address: '' }]
    setOutlineFields((prev: any) => ({ ...prev, sellers: list }))
  }

  const handleRemoveSellerField = (index: number) => {
    const list = getSellersList().filter((_, i) => i !== index)
    setOutlineFields((prev: any) => ({
      ...prev,
      sellers: list,
      ...(list.length > 0 && {
        sellerName: list[0].name,
        sellerEmail: list[0].email,
        sellerPhone: list[0].phone,
        sellerAddress: list[0].address
      })
    }))
  }

  const [notifyingMilestone, setNotifyingMilestone] = useState<string | null>(null)
  const [creatingTaskMilestone, setCreatingTaskMilestone] = useState<string | null>(null)

  const handleDownloadCalendar = (title: string, dateStr: string) => {
    if (!dateStr) return
    const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, '')
    const date = new Date(dateStr)
    const yyyymmdd = date.toISOString().split('T')[0].replace(/-/g, '')
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Prime America Real Estate//RE Workspace//EN',
      'BEGIN:VEVENT',
      `UID:${cleanTitle}-${Date.now()}@primeamericany.com`,
      `DTSTAMP:${yyyymmdd}T000000Z`,
      `DTSTART;VALUE=DATE:${yyyymmdd}`,
      `SUMMARY:${cleanTitle} for ${data?.transaction?.name || 'Transaction'}`,
      `DESCRIPTION:Milestone Date Alert for: ${cleanTitle}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\n')

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${cleanTitle.toLowerCase().replace(/\s+/g, '_')}_reminder.ics`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleNotifyTeam = async (milestoneKey: string, dateVal: string) => {
    if (!dateVal) return
    setNotifyingMilestone(milestoneKey)
    try {
      const res = await fetch(`/api/transactions/${id}/timeline/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone: milestoneKey, date: dateVal })
      })
      if (res.ok) {
        const json = await res.json()
        alert(`Successfully notified ${json.notifiedCount || 0} team member(s) via email!`)
      } else {
        alert('Failed to send notifications.')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setNotifyingMilestone(null)
    }
  }

  const handleCreateChecklistReminder = async (friendlyName: string, dateVal: string) => {
    if (!dateVal) return
    setCreatingTaskMilestone(friendlyName)
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
      } else {
        alert('Failed to create checklist reminder.')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setCreatingTaskMilestone(null)
    }
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
      const agentName = user.name || ''
      const agentEmail = user.email || ''
      const agentPhone = userAny.phone || ''
      const agentLicense = user.licenseNumber || ''
      const agencyName = branding.companyName || ''

      if (side === 'buyer') {
        next.sellingAgentName = agentName
        next.sellingAgentEmail = agentEmail
        next.sellingAgentCell = agentPhone
        next.sellingAgentLicense = agentLicense
        next.sellingAgencyName = agencyName
      } else {
        next.listingAgentName = agentName
        next.listingAgentEmail = agentEmail
        next.listingAgentCell = agentPhone
        next.listingAgentLicense = agentLicense
        next.listingAgencyName = agencyName
      }

      return next
    })
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

  const autofillAttorneyFromNetwork = (side: 'buyer' | 'seller') => {
    const nameKey = side === 'buyer' ? 'buyerAttorneyName' : 'sellerAttorneyName'
    const emailKey = side === 'buyer' ? 'buyerAttorneyEmail' : 'sellerAttorneyEmail'
    const phoneKey = side === 'buyer' ? 'buyerAttorneyPhone' : 'sellerAttorneyPhone'
    const addressKey = side === 'buyer' ? 'buyerAttorneyAddress' : 'sellerAttorneyAddress'
    const faxKey = side === 'buyer' ? 'buyerAttorneyFax' : 'sellerAttorneyFax'

    setOutlineFields((prev: any) => {
      const typedEmail = String(prev[emailKey] || '').trim().toLowerCase()
      const typedName = String(prev[nameKey] || '').trim().toLowerCase()
      if (!typedEmail && !typedName) return prev

      const match = networkAttorneys.find((c: any) => {
        const candidateEmail = String(c.email || '').trim().toLowerCase()
        const candidateName = String(c.name || '').trim().toLowerCase()
        if (typedEmail && candidateEmail && typedEmail === candidateEmail) return true
        if (typedName && candidateName && typedName === candidateName) return true
        return false
      })

      if (!match) return prev

      return {
        ...prev,
        [nameKey]: prev[nameKey] || match.name || '',
        [emailKey]: prev[emailKey] || match.email || '',
        [phoneKey]: prev[phoneKey] || match.phone || match.telephone || '',
        [addressKey]: prev[addressKey] || match.poi || match.address || '',
        [faxKey]: prev[faxKey] || match.fax || '',
      }
    })
  }

  const autoFillTimelineDates = async (tx: any, listing: any, extraOffer?: any) => {
    if (!tx || !id) return
    const patch: Record<string, string | null> = {}
    const offs = [...offers]
    if (extraOffer) offs.push(extraOffer)
    const sorted = offs.filter((o: any) => o && o.offerDate).sort((a: any, b: any) => String(a.offerDate) > String(b.offerDate) ? 1 : -1)
    const firstOffer = sorted[0] as any

    if (!tx.listed_date && listing) {
      const rawListing = listing?.raw?.data || listing?.raw || {}
      const listingDate = listing.listed_date || listing.listingDate || listing.listedDate || rawListing.ListingContractDate || listing.created_at
      if (listingDate) patch.listed_date = String(listingDate).substring(0, 10)
      const expDate = listing.expire_date || listing.expirationDate || listing.expireDate || rawListing.ExpirationDate
      if (expDate) patch.expire_date = String(expDate).substring(0, 10)
    }
    if (!tx.offer_date && firstOffer?.offerDate) patch.offer_date = String(firstOffer.offerDate).substring(0, 10)
    if (!tx.home_inspection_date && firstOffer?.inspectionDate) patch.home_inspection_date = String(firstOffer.inspectionDate).substring(0, 10)
    if (!tx.possession_date && firstOffer?.possessionDate) patch.possession_date = String(firstOffer.possessionDate).substring(0, 10)

    const changes: Record<string, string | null> = {}
    for (const [k, v] of Object.entries(patch)) {
      if (String(tx[k] ?? '') !== String(v ?? '')) changes[k] = v || null
    }
    if (Object.keys(changes).length === 0) return

    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
      if (res.ok) {
        setData((d: any) => ({ ...d, transaction: { ...d.transaction, ...changes } }))
        if (changes.listed_date !== undefined) setListedDate(String(changes.listed_date || ''))
        if (changes.expire_date !== undefined) setExpireDate(String(changes.expire_date || ''))
        if (changes.offer_date !== undefined) setOfferDate(String(changes.offer_date || ''))
        if (changes.home_inspection_date !== undefined) setHomeInspectionDate(String(changes.home_inspection_date || ''))
        if (changes.possession_date !== undefined) setPossessionDate(String(changes.possession_date || ''))
      }
    } catch (e) {
      console.error('Failed to persist timeline dates', e)
    }
  }

  const fetchTransaction = async () => {
    try {
      const res = await fetch(`/api/transactions/${id}`)
      const json = await res.json()
      if (json.success) {
        setData(json.data)
        setOutcomes(json.data.outcomes || [])
        // Set form defaults
        const tx = json.data.transaction
        setSettingName(tx.name || '')
        setEditType(tx.type || 'sale')
        setEditPrice(tx.price || '')
        setEditCommAmount(tx.commission_amount || '')
        setEditCommRate(tx.commission_rate || '')
        setEditCloseDate(tx.target_close_date || '')
        setEditAgreementType(tx.agreement_type || '')
        setEditAgreementExpiry(tx.agreement_expiration_date || '')
        setListedDate(tx.listed_date || '')
        setExpireDate(tx.expire_date || '')
        setOfferDate(tx.offer_date || '')
        setPendingDate(tx.pending_date || '')
        setHomeInspectionDate(tx.home_inspection_date || '')
        setPossessionDate(tx.possession_date || '')
        setEscrowDate(tx.escrow_date || '')
        setInspectionDeadline(tx.inspection_deadline || '')
        setAppraisalDate(tx.appraisal_date || '')

        // Populate outline fields
        if (tx.parties_involved) {
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
        // Auto-sync Listed Date and Expire Date from linked inventory listing if not yet set
        if (json.data.listing) {
          const lnk = json.data.listing
          const rawListing = lnk?.raw?.data || lnk?.raw || {}
          if (!tx.listed_date) {
            const listingDate = lnk.listed_date || lnk.listingDate || lnk.listedDate || rawListing.ListingContractDate || lnk.created_at
            if (listingDate) setListedDate(String(listingDate).substring(0, 10))
          }
          if (!tx.expire_date) {
            const expDate = lnk.expire_date || lnk.expirationDate || lnk.expireDate || rawListing.ExpirationDate
            if (expDate) setExpireDate(String(expDate).substring(0, 10))
          }
        }
        autoFillTimelineDates(tx, json.data.listing)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchTransaction()
    fetchAvailableTemplates()

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
        const res = await fetch(`/api/directory/users?q=${encodeURIComponent(teamSearchQuery)}`)
        const json = await res.json()
        if (active && (json.success || Array.isArray(json))) {
          setDirectoryUsers(json.data || json)
        }
      } catch(e) {
        console.error(e)
      }
    }
    
    const timer = setTimeout(() => {
      loadDirectory()
    }, 250)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [teamSearchQuery])

  useEffect(() => {
    loadNetworkContacts()
  }, [])

  useEffect(() => {
    if (!id || mainTab !== 'outcomes') return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/api/transactions/${id}/outcomes/ws`
    
    let ws: WebSocket
    let reconnectTimeout: any
    
    function connect() {
      ws = new WebSocket(wsUrl)
      
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type === 'new_outcome') {
            setOutcomes(prev => {
              if (prev.some(o => o.id === msg.data.id)) return prev
              return [...prev, msg.data]
            })
            if (msg.data.user_id !== user?.id) {
              if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                new Notification(`${msg.data.name} (Transaction Chat)`, {
                  body: msg.data.message,
                })
              }
            }
          } else if (msg.type === 'reset_outcomes') {
            setOutcomes([])
          }
        } catch (e) {
          console.error('WS parsing error:', e)
        }
      }
      
      ws.onclose = () => {
        reconnectTimeout = setTimeout(connect, 3000)
      }
    }
    
    connect()

    return () => {
      clearTimeout(reconnectTimeout)
      if (ws) ws.close()
    }
  }, [id, mainTab])

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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

  const { transaction: tx, parties, tasks, listing, team = [], documents = [] } = data
  const isBrokerOrAdmin = user && ['admin', 'broker'].includes(user.role)
  const isLocked = tx.is_locked === 1
  const canEdit = !isLocked || isBrokerOrAdmin
  const compatibleTemplates = availableTemplates.filter((t) => t.type === tx.type)

  const handlePostOutcome = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newOutcomeMessage.trim()) return
    setIsPostingOutcome(true)
    try {
      const res = await fetch(`/api/transactions/${id}/outcomes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newOutcomeMessage, is_broker_advice: isOutcomeAdvice })
      })
      if (res.ok) {
        setNewOutcomeMessage('')
        setIsOutcomeAdvice(false)
        fetchTransaction()
      }
    } catch(e) {
      console.error(e)
    } finally {
      setIsPostingOutcome(false)
    }
  }

  const handleResetOutcomes = async () => {
    if (!window.confirm('Are you sure you want to clear/reset the chat history? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/transactions/${id}/outcomes`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setOutcomes([])
      }
    } catch(e) {
      console.error(e)
    }
  }

  const handleUpdateDetails = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: editType,
          price: editPrice ? parseFloat(editPrice) : null,
          commission_amount: editCommAmount ? parseFloat(editCommAmount) : null,
          commission_rate: editCommRate ? parseFloat(editCommRate) : null,
          target_close_date: editCloseDate || null,
          agreement_type: editAgreementType || null,
          agreement_expiration_date: editAgreementExpiry || null
        })
      })
      if (res.ok) {
        setIsEditOpen(false)
        fetchTransaction()
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleAddTeamMember = async (userId: string) => {
    if (team.length >= 4) {
      alert('Maximum 4 team members allowed per deal.')
      return
    }
    setIsAddingTeam(true)
    try {
      const res = await fetch(`/api/transactions/${id}/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, role: 'co-agent' })
      })
      if (res.ok) {
        setTeamSearchQuery('')
        setIsTeamDropdownOpen(false)
        fetchTransaction()
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to add team member')
      }
    } catch(e) {
      console.error(e)
    } finally {
      setIsAddingTeam(false)
    }
  }

  const handleRemoveTeamMember = async (userId: string) => {
    if (!confirm('Remove this member from the deal team?')) return
    try {
      const res = await fetch(`/api/transactions/${id}/team/${userId}`, { method: 'DELETE' })
      if (res.ok) fetchTransaction()
    } catch(e) {
      console.error(e)
    }
  }

  const filteredDirectory = directoryUsers.filter(u => {
    const q = teamSearchQuery.toLowerCase()
    return u.id !== user?.id && !team.some((t: any) => t.user_id === u.id) && 
      ((u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.license_number || '').toLowerCase().includes(q))
  })

  const handleUpdateOutline = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const partiesJson = JSON.stringify(outlineFields)
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parties_involved: partiesJson
        })
      })
      if (res.ok) {
        setIsOutlineEditOpen(false)
        fetchTransaction()
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleDeleteDeal = async () => {
    if (!confirm('Are you absolutely sure you want to delete this transaction/deal? This action is permanent.')) return
    setIsDeleting(true)
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
    } finally {
      setIsDeleting(false)
    }
  }

  const applyTemplate = async (templateId: string, isTemplate: boolean = true) => {
    try {
      const res = await fetch(`/api/transactions/${id}/apply-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isTemplate ? { template_id: templateId } : { template: templateId })
      })
      if (res.ok) fetchTransaction()
    } catch(e) {
      console.error(e)
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    setIsAddingTask(true)
    try {
      const res = await fetch(`/api/transactions/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle,
          document_required: newTaskReqAttach,
          attachment_required: newTaskReqAttach,
          broker_approval_required: newTaskReqBroker,
          group_name: newTaskGroup || null
        })
      })
      if (res.ok) {
        setNewTaskTitle('')
        setNewTaskGroup('')
        setNewTaskReqAttach(false)
        setNewTaskReqBroker(false)
        fetchTransaction()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsAddingTask(false)
    }
  }

  const toggleTask = async (taskId: string, currentStatus: string) => {
    const task = tasks.find((item: any) => item.id === taskId)
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
        if (nextStatus === 'completed') {
          const groupTasks = tasks.filter((t: any) => t.group_name === task.group_name)
          const allOthersCompleted = groupTasks.filter((t: any) => t.id !== taskId).every((t: any) => t.status === 'completed')
          if (allOthersCompleted && groupTasks.length > 0) {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } })
          }
        }
        fetchTransaction()
      }
    } catch (e) {
      console.error(e)
    }
  }



  const uploadFileWithProgress = (file: File, entityType: string, entityId: string, onProgress: (pct: number) => void, parentId?: string | null) => {
    return new Promise<{ success: boolean; data: { key: string; id: string } }>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      const formData = new FormData()
      formData.append('file', file)
      formData.append('entity_type', entityType)
      formData.append('entity_id', entityId)
      if (parentId) {
        formData.append('parent_id', parentId)
      }

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          onProgress(pct)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText))
          } catch {
            reject(new Error('Failed to parse response'))
          }
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`))
        }
      })

      xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
      xhr.open('POST', '/api/documents/upload')
      xhr.send(formData)
    })
  }

  const handleUploadTaskDocWithProgress = async (taskId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setUploadProgress(prev => ({ ...prev, [taskId]: 0 }))
    
    try {
      const uploadJson = await uploadFileWithProgress(file, 'transaction_task', taskId, (pct) => {
        setUploadProgress(prev => ({ ...prev, [taskId]: pct }))
      })
      
      if (uploadJson.success) {
        await fetch(`/api/transactions/${id}/tasks/${taskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ document_key: uploadJson.data.key })
        })
        fetchTransaction()
        alert('Document uploaded and linked successfully!')
      }
    } catch (err: any) {
      console.error(err)
      alert(err.message || 'Upload failed')
    } finally {
      setUploadProgress(prev => {
        const next = { ...prev }
        delete next[taskId]
        return next
      })
    }
  }

  const handleDeleteTaskDoc = async (taskId: string, documentKey: string) => {
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
      alert('Failed to delete document')
    }
  }

  const handleUpdateTaskApproval = async (taskId: string, approvalStatus: 'approved' | 'rejected', notes?: string) => {
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
    if (!confirm('Delete this checklist item?')) return
    try {
      const res = await fetch(`/api/transactions/${id}/tasks/${taskId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        fetchTransaction()
      }
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
      if (res.ok) {
        setRenamingDocId(null)
        fetchTransaction()
      }
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
      if (res.ok) {
        setMovingDocId(null)
        fetchTransaction()
      }
    } catch (err) {
      console.error(err)
    }
  }

  // Calculated commission if rate is used
  const calculatedCommission = tx.price && tx.commission_rate ? tx.price * (tx.commission_rate / 100) : null

  const getPartyRecipients = () => {
    const list: { name: string; email: string; role: string }[] = []
    
    getBuyersList().forEach((b: any, idx: number) => {
      if (b.email) list.push({ name: b.name || `Buyer #${idx + 1}`, email: b.email, role: 'Buyer' })
    })
    getSellersList().forEach((s: any, idx: number) => {
      if (s.email) list.push({ name: s.name || `Seller #${idx + 1}`, email: s.email, role: 'Seller' })
    })
    if (outlineFields.buyerAttorneyEmail) {
      list.push({ name: outlineFields.buyerAttorneyName || "Buyer's Attorney", email: outlineFields.buyerAttorneyEmail, role: "Buyer's Attorney" })
    }
    if (outlineFields.sellerAttorneyEmail) {
      list.push({ name: outlineFields.sellerAttorneyName || "Seller's Attorney", email: outlineFields.sellerAttorneyEmail, role: "Seller's Attorney" })
    }
    if (outlineFields.sellingAgentEmail) {
      list.push({ name: outlineFields.sellingAgentName || "Selling Agent", email: outlineFields.sellingAgentEmail, role: "Selling Agent" })
    }
    if (outlineFields.coSellingAgentEmail) {
      list.push({ name: outlineFields.coSellingAgentName || "Co-Selling Agent", email: outlineFields.coSellingAgentEmail, role: "Co-Selling Agent" })
    }
    if (outlineFields.listingAgentEmail) {
      list.push({ name: outlineFields.listingAgentName || "Listing Agent", email: outlineFields.listingAgentEmail, role: "Listing Agent" })
    }
    if (outlineFields.coListingAgentEmail) {
      list.push({ name: outlineFields.coListingAgentName || "Co-Listing Agent", email: outlineFields.coListingAgentEmail, role: "Co-Listing Agent" })
    }
    if (outlineFields.loanOfficerEmail) {
      list.push({ name: outlineFields.loanOfficerName || "Loan Officer", email: outlineFields.loanOfficerEmail, role: "Loan Officer" })
    }

    if (Array.isArray(parties)) {
      parties.forEach((p: any) => {
        if (p.email && !list.some(item => item.email.toLowerCase() === p.email.toLowerCase())) {
          list.push({ name: p.name || 'Party', email: p.email, role: p.role || 'Party' })
        }
      })
    }
    return list
  }

  return (
    <Layout title={tx.name}>
      {isLocked && (
        <div className="mb-4 bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-xs font-semibold flex items-center gap-2 no-print">
          <Lock className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span>This transaction is locked by a broker or administrator. Standard details, documents, and tasks cannot be modified by agents.</span>
        </div>
      )}
      {/* Print custom stylesheet */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-deal-sheet, #printable-deal-sheet * {
            visibility: visible !important;
          }
          #printable-deal-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            font-family: Georgia, serif !important;
            color: black !important;
            background: white !important;
            font-size: 11px !important;
            line-height: 1.4 !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

      {/* Top Navigation */}
      <div className="mb-4 no-print">
        {/* Row 1: Back + Address + Badges + Actions */}
        <div className="flex items-start justify-between gap-4 mb-3">
          {/* Left: Back + Address */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <Link to="/transactions/pipeline" className="rounded-lg p-2 text-gray-400 hover:bg-white hover:text-gray-900 transition-colors shadow-sm bg-white border border-gray-200 flex-shrink-0 mt-0.5">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1
                  className="text-xl font-bold text-gray-900 truncate max-w-[320px] md:max-w-[500px]"
                  title={tx.name}
                >
                  {tx.name}
                </h1>
                {/* Status pill (editable dropdown styled as badge) */}
                <select
                  value={tx.status}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const nextStage = e.target.value
                    if (nextStage === 'under_contract' || nextStage === 'closed') {
                      setStageGateTarget(nextStage)
                    } else {
                      ;(async () => {
                        try {
                          const res = await fetch(`/api/transactions/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: nextStage })
                          })
                          if (res.ok) fetchTransaction()
                          else { const d = await res.json(); alert(d.error || 'Failed to update status') }
                        } catch (err) { console.error(err) }
                      })()
                    }
                  }}
                  className={clsx(
                    "px-2.5 py-1 rounded-full text-xs font-bold border focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer",
                    tx.status === 'active' ? "bg-blue-100 text-blue-700 border-blue-200" :
                    tx.status === 'offer_received' ? "bg-purple-100 text-purple-700 border-purple-200" :
                    tx.status === 'under_contract' ? "bg-amber-100 text-amber-700 border-amber-200" :
                    tx.status === 'closed' ? "bg-emerald-100 text-emerald-700 border-emerald-200" :
                    tx.status === 'fallen_through' ? "bg-red-100 text-red-700 border-red-200" :
                    "bg-gray-100 text-gray-700 border-gray-200"
                  )}
                >
                  <option value="lead">Lead</option>
                  <option value="active">Active</option>
                  <option value="offer_received">Offer Received</option>
                  <option value="under_contract">Under Contract</option>
                  <option value="closed">Closed</option>
                  <option value="fallen_through">Fallen Through</option>
                </select>
                {/* Type badge */}
                <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                  {tx.type}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {/* Linked listing chip */}
                {tx.inventory_listing_id && (
                  <Link
                    to={`/inventory/listings/${tx.inventory_listing_id}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {listing?.name || listing?.address || `Listing ${tx.inventory_listing_id.slice(0, 8)}`}
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Right: Completion donut + Export dropdown + Edit button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Deal Completion Donut */}
            {(() => {
              const total = tasks?.length || 0
              const done = tasks?.filter((t: any) => t.status === 'completed').length || 0
              const pct = total > 0 ? Math.round((done / total) * 100) : 0
              const r = 16, c = 2 * Math.PI * r
              return (
                <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 shadow-sm" title={`${done}/${total} tasks done`}>
                  <svg width="36" height="36" className="rotate-[-90deg]">
                    <circle cx="18" cy="18" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3.5" />
                    <circle
                      cx="18" cy="18" r={r}
                      fill="none"
                      stroke={pct === 100 ? '#10b981' : '#3b82f6'}
                      strokeWidth="3.5"
                      strokeDasharray={`${(pct / 100) * c} ${c}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="text-xs font-bold text-gray-700">{pct}%</span>
                </div>
              )
            })()}

            {/* Export Dropdown */}
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setExportDropdownOpen(o => !o)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-white border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 shadow-sm text-gray-700"
              >
                <Printer className="h-4 w-4" />
                Export
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </button>
              {exportDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-40 overflow-hidden">
                  <button
                    onClick={() => { window.print(); setExportDropdownOpen(false); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left"
                  >
                    <Printer className="h-4 w-4 text-gray-500" /> Print Outline
                  </button>
                  <button
                    onClick={() => {
                      const partyList = getPartyRecipients()
                      setSelectedRecipients(partyList.map(p => p.email))
                      setEmailSubject(`Deal Outline: ${tx.name}`)
                      setEmailBody(`Hi,\n\nPlease review the deal outline details for: ${tx.name}\n\nStatus: ${tx.status}\nPrice: ${tx.price ? `$${tx.price.toLocaleString()}` : 'TBD'}\n\nBest regards,\n${user?.name || 'Prime America Real Estate'}`)
                      setEmailModalOpen(true)
                      setExportDropdownOpen(false)
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 text-left border-t border-gray-100"
                  >
                    <Mail className="h-4 w-4 text-gray-500" /> Email to Parties
                  </button>
                </div>
              )}
            </div>

            {/* Edit Details CTA */}
            <button
              onClick={() => setIsEditOpen(true)}
              disabled={!canEdit}
              className="inline-flex items-center gap-1.5 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white border-0 px-4 py-2 rounded-xl shadow-sm transition-colors disabled:opacity-50"
            >
              <Edit3 className="h-4 w-4" /> Edit Details
            </button>
          </div>
        </div>

        {/* Row 2: Deal Stage Stepper Bar */}
        {(() => {
          const activeStage = getStageFromStatus(tx.status)
          const activeIdx = DEAL_STAGES.indexOf(activeStage)
          return (
            <div className="flex items-center bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-2.5 overflow-x-auto gap-1">
              {DEAL_STAGES.map((stage, idx) => {
                const isActive = stage === activeStage
                const isPast = idx < activeIdx
                return (
                  <div key={stage} className="flex items-center gap-1 flex-shrink-0">
                    <div className={clsx(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all",
                      isActive ? "bg-blue-600 text-white shadow-sm" :
                      isPast ? "bg-emerald-100 text-emerald-700" :
                      "text-gray-400"
                    )}>
                      {isPast && <CheckCircle2 className="h-3 w-3" />}
                      {stage}
                    </div>
                    {idx < DEAL_STAGES.length - 1 && (
                      <ChevronRight className={clsx("h-3.5 w-3.5 flex-shrink-0", idx < activeIdx ? "text-emerald-400" : "text-gray-300")} />
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* Print view formal title */}
      <div className="hidden print:block mb-8 border-b-2 border-gray-300 pb-4">
        <h1 className="text-3xl font-bold text-gray-900">Transaction Summary Sheet</h1>
        <p className="text-sm text-gray-500 mt-1">Prime America Real Estate Workspace</p>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print-grid">
        {/* Left Column: Details & Parties */}
        <div className="lg:col-span-1 space-y-3">

          {/* Financials & Dates - Collapsible */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              onClick={() => toggleCard('financials')}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors rounded-t-xl"
            >
              <h3 className="text-sm font-bold text-gray-900">Deal Financials</h3>
              {cardCollapsed['financials'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
            </button>
            {!cardCollapsed['financials'] && (
              <div className="px-5 pb-5 space-y-4 border-t border-gray-100">
                <div className="pt-3">
                  <p className="text-xs text-gray-500 mb-1">Target Price</p>
                  <p className="font-bold text-gray-900 text-xl">
                    {tx.price ? `$${tx.price.toLocaleString()}` : '—'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Commission Rate</p>
                    <p className="font-semibold text-gray-900">
                      {tx.commission_rate ? `${tx.commission_rate}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Commission Amount</p>
                    <p className="font-semibold text-gray-900">
                      {tx.commission_amount ? `$${tx.commission_amount.toLocaleString()}` : calculatedCommission ? `$${calculatedCommission.toLocaleString()}` : '—'}
                    </p>
                  </div>
                </div>
                {/* Net-to-Seller calculation */}
                {tx.price && (tx.commission_amount || calculatedCommission) && (
                  <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-100">
                    <p className="text-xs text-emerald-700 font-bold mb-1">Est. Net to Seller</p>
                    <p className="font-bold text-emerald-800 text-base">
                      ${(tx.price - (tx.commission_amount || calculatedCommission || 0)).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-emerald-600 mt-0.5">Price minus commission (before other closing costs)</p>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Target Close</p>
                    <div className="flex items-center gap-1 text-gray-700 font-medium text-sm">
                      <CalendarDays className="h-3.5 w-3.5 text-gray-400 no-print" />
                      <span className="text-xs">{tx.target_close_date || '—'}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Actual Close</p>
                    <div className="flex items-center gap-1 text-gray-700 font-medium text-sm">
                      <CalendarDays className="h-3.5 w-3.5 text-gray-400 no-print" />
                      <span className="text-xs">{tx.actual_close_date || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Agreement Section - Collapsible */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              onClick={() => toggleCard('agreements')}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors rounded-t-xl"
            >
              <h3 className="text-sm font-bold text-gray-900">Representation & Agreements</h3>
              {cardCollapsed['agreements'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
            </button>
            {!cardCollapsed['agreements'] && (
              <div className="px-5 pb-5 space-y-3 text-sm border-t border-gray-100 pt-3">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Agreement Type</p>
                  <p className="font-semibold text-gray-900 text-sm">{tx.agreement_type || 'No signed agreement logged'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Agreement Expiration</p>
                  <p className="font-semibold text-gray-900 text-sm">{tx.agreement_expiration_date || '—'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Deal Outline Sheet Data Card - Collapsible */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm no-print">
            <button
              onClick={() => toggleCard('outline')}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors rounded-t-xl"
            >
              <h3 className="text-sm font-bold text-gray-900">Printable Deal Outline</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); setIsOutlineEditOpen(true) }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                >
                  Edit
                </button>
                {cardCollapsed['outline'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
              </div>
            </button>
            {!cardCollapsed['outline'] && (
              <div className="px-5 pb-5 border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-500 mb-3">Key parties and financial terms for the printable sheet.</p>
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2 border-b border-gray-50 pb-2">
                    <div>
                      <p className="text-gray-400 font-medium">Buyer</p>
                      <p className="font-semibold text-gray-800 truncate">{outlineFields.buyerName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 font-medium">Seller</p>
                      <p className="font-semibold text-gray-800 truncate">{outlineFields.sellerName || '—'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-b border-gray-50 pb-2">
                    <div>
                      <p className="text-gray-400 font-medium">Selling Agent</p>
                      <p className="font-semibold text-gray-800 truncate">{outlineFields.sellingAgentName || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 font-medium">Listing Agent</p>
                      <p className="font-semibold text-gray-800 truncate">{outlineFields.listingAgentName || '—'}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-gray-400 font-medium">Selling Price</p>
                      <p className="font-semibold text-gray-800">{outlineFields.sellingPrice ? `$${parseFloat(outlineFields.sellingPrice).toLocaleString()}` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 font-medium">Mortgage Amt</p>
                      <p className="font-semibold text-gray-800">{outlineFields.mortgageAmount ? `$${parseFloat(outlineFields.mortgageAmount).toLocaleString()}` : '—'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Parties - Collapsible 2x2 grid */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <button
              onClick={() => toggleCard('parties')}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors rounded-t-xl"
            >
              <h3 className="text-sm font-bold text-gray-900">Involved Parties</h3>
              <div className="flex items-center gap-1.5">
                {parties.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">{parties.length}</span>
                )}
                {cardCollapsed['parties'] ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
              </div>
            </button>
            {!cardCollapsed['parties'] && (
              <div className="px-5 pb-5 border-t border-gray-100 pt-3">
                <div className="grid grid-cols-2 gap-2">
                  {parties.map((p: any) => (
                    <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 bg-gray-50/50">
                      <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-[10px] flex-shrink-0">
                        {(p.first_name?.[0] || '')}{(p.last_name?.[0] || '')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate">
                          {p.first_name} {p.last_name}
                        </p>
                        <p className="text-[10px] text-gray-500 capitalize">{p.role}</p>
                        {p.is_primary === 1 && (
                          <span className="text-[9px] font-bold text-blue-700">● Primary</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {parties.length === 0 && (
                    <p className="col-span-2 text-xs text-gray-500 text-center py-3">No primary client linked.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* History Deals */}
          {historyDeals.length > 0 && (

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm no-print mt-6">
              <h3 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 mb-4">Past Deals for this Property</h3>
              <div className="space-y-3">
                {historyDeals.map((h: any) => (
                  <Link
                    key={h.id}
                    to={`/transactions/${h.id}`}
                    className="block p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{h.name}</p>
                      <span className={clsx(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize",
                        h.status === 'closed' ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-700"
                      )}>
                        {h.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{h.target_close_date || h.created_at.split(' ')[0]}</span>
                      <span className="font-medium text-gray-700">{h.price ? `$${h.price.toLocaleString()}` : ''}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Dynamic Tabs */}
        <div className="lg:col-span-2 space-y-6 font-sans">
          {/* Main Tabs Navigation */}
          <div className="flex bg-white rounded-2xl border border-gray-200 p-1 shadow-sm overflow-x-auto no-print">
            {(['tasks', 'documents', 'offers', 'outcomes', 'timeline', 'settings'] as const).map((tab) => {
              const badge = tab === 'tasks' ? (tasks?.filter((t: any) => !t.is_completed).length || 0) :
                            tab === 'documents' ? (documents?.length || 0) :
                            tab === 'offers' ? (offers?.length || 0) : 0
              return (
                <button
                  key={tab}
                  onClick={() => setMainTab(tab as any)}
                  className={clsx(
                    "flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 whitespace-nowrap capitalize",
                    mainTab === (tab as any)
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                  )}
                >
                  {tab === 'tasks' ? 'Tasks' :
                   tab === 'documents' ? 'Documents' :
                   tab === 'offers' ? 'Offers' :
                   tab === 'outcomes' ? 'Outcomes' :
                   tab === 'timeline' ? 'Timeline' :
                   'Settings'}
                  {badge > 0 && (
                    <span className={clsx(
                      "inline-flex items-center justify-center rounded-full text-[10px] font-bold min-w-[16px] h-4 px-1",
                      mainTab === (tab as any) ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                    )}>
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {mainTab === 'documents' && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-gray-900">Documents Manager</h3>
                  {/* Sub-tabs */}
                  <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs font-semibold">
                    <button
                      onClick={() => setDocSubTab('all')}
                      className={clsx("px-3 py-1 rounded-md transition-colors", docSubTab === 'all' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                    >
                      All Files
                    </button>
                    <button
                      onClick={() => setDocSubTab('checklist')}
                      className={clsx("px-3 py-1 rounded-md transition-colors flex items-center gap-1", docSubTab === 'checklist' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                    >
                      Checklist
                      {tasks?.filter((t: any) => t.document_required && !t.document_key).length > 0 && (
                        <span className="bg-red-100 text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          {tasks.filter((t: any) => t.document_required && !t.document_key).length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 no-print">
                  {/* Create Folder Button */}
                  <button
                    onClick={() => setIsCreatingFolder(true)}
                    disabled={!canEdit}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-xs font-semibold text-gray-700 bg-white disabled:opacity-50"
                  >
                    <FolderPlus className="h-4 w-4 text-gray-500" /> New Folder
                  </button>

                  {/* Upload File Input */}
                  {canEdit ? (
                    <div className="flex flex-col gap-1 items-end">
                      <label className={clsx(
                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white cursor-pointer shadow-sm",
                        docUploadProgress !== null && "opacity-50 pointer-events-none"
                      )}>
                        <Upload className="h-4 w-4" />
                        <span>{docUploadProgress !== null ? `Uploading ${docUploadProgress}%` : 'Upload File'}</span>
                        <input
                          type="file"
                          className="hidden"
                          disabled={docUploadProgress !== null}
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setDocUploadProgress(0)
                            try {
                              const uploadJson = await uploadFileWithProgress(
                                file,
                                'transaction',
                                id || '',
                                (pct) => setDocUploadProgress(pct),
                                currentFolderId
                              )
                              if (uploadJson.success) {
                                fetchTransaction()
                              } else {
                                alert('Upload failed')
                              }
                            } catch (err: any) {
                              console.error(err)
                              alert(err.message || 'Upload failed')
                            } finally {
                              setDocUploadProgress(null)
                            }
                          }}
                        />
                      </label>
                      {docUploadProgress !== null && (
                        <div className="w-28 bg-gray-200 h-1 rounded-full overflow-hidden">
                          <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${docUploadProgress}%` }} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-xs font-semibold text-gray-400 border border-gray-200 shadow-sm cursor-not-allowed">
                      <Upload className="h-4 w-4" />
                      <span>Upload Locked</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Folder Creation Modal/Row */}
              {isCreatingFolder && (
                <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg border border-gray-150 no-print">
                  <input
                    type="text"
                    required
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:outline-none focus:border-blue-500 bg-white"
                  />
                  <button
                    onClick={async () => {
                      if (!newFolderName.trim()) return
                      try {
                        const res = await fetch('/api/documents', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            is_folder: 1,
                            entity_type: 'transaction',
                            entity_id: id,
                            file_name: newFolderName,
                            parent_id: currentFolderId
                          })
                        })
                        if (res.ok) {
                          setNewFolderName('')
                          setIsCreatingFolder(false)
                          fetchTransaction()
                        }
                      } catch (err) {
                        console.error(err)
                      }
                    }}
                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setIsCreatingFolder(false)
                      setNewFolderName('')
                    }}
                    className="border border-gray-350 text-gray-700 hover:bg-gray-100 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* ALL FILES SUB-TAB */}
              {docSubTab === 'all' && (
                <>
                  {/* Breadcrumbs */}
                  <div className="flex items-center gap-1 text-xs text-gray-500 py-1 bg-gray-50 px-3 rounded-lg border border-gray-100">
                    <button
                      onClick={() => setCurrentFolderId(null)}
                      className="font-semibold text-blue-600 hover:underline"
                    >
                      Home
                    </button>
                    {(() => {
                      const crumbs: any[] = []
                      let folderId = currentFolderId
                      while (folderId) {
                        const folder = documents.find((d: any) => d.id === folderId)
                        if (!folder) break
                        crumbs.unshift(folder)
                        folderId = folder.parent_id
                      }
                      return crumbs.map((crumb, idx) => (
                        <span key={crumb.id} className="flex items-center gap-1">
                          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                          <button
                            onClick={() => setCurrentFolderId(crumb.id)}
                            className={clsx(
                              "font-semibold hover:underline",
                              idx === crumbs.length - 1 ? "text-gray-700 font-bold" : "text-blue-600"
                            )}
                          >
                            {crumb.file_name || crumb.original_name}
                          </button>
                        </span>
                      ))
                    })()}
                  </div>

              {/* Folder list and items grid */}
              {(() => {
                const currentDocs = documents.filter((d: any) => d.parent_id === currentFolderId)
                if (currentDocs.length === 0) {
                  return (
                    <div className="text-center py-12 text-sm text-gray-500">
                      This folder is empty.
                    </div>
                  )
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentDocs.map((doc: any) => {
                      const isFolder = doc.is_folder === 1
                      const fileName = doc.file_name || doc.original_name
                      const fileKey = doc.file_key || doc.storage_key

                      return (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50/50 transition-all group"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {isFolder ? (
                              <button
                                onClick={() => setCurrentFolderId(doc.id)}
                                className="flex items-center gap-3 text-left w-full hover:text-blue-600"
                              >
                                <Folder className="h-9 w-9 text-amber-500 flex-shrink-0" />
                                <div className="min-w-0">
                                  {renamingDocId === doc.id ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={renameName}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => setRenameName(e.target.value)}
                                      onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                          await handleRename(doc.id, renameName)
                                        }
                                      }}
                                      onBlur={() => setRenamingDocId(null)}
                                      className="rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:border-blue-500 bg-white text-gray-800"
                                    />
                                  ) : (
                                    <p className="text-sm font-bold truncate">{fileName}</p>
                                  )}
                                  <p className="text-[10px] text-gray-400">Folder</p>
                                </div>
                              </button>
                            ) : (
                              <a
                                href={`/api/documents/download?key=${fileKey}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-3 text-left w-full hover:text-blue-600"
                              >
                                <FileText className="h-9 w-9 text-blue-500 flex-shrink-0" />
                                <div className="min-w-0">
                                  {renamingDocId === doc.id ? (
                                    <input
                                      type="text"
                                      autoFocus
                                      value={renameName}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => setRenameName(e.target.value)}
                                      onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                          await handleRename(doc.id, renameName)
                                        }
                                      }}
                                      onBlur={() => setRenamingDocId(null)}
                                      className="rounded border border-gray-300 px-2 py-0.5 text-xs focus:outline-none focus:border-blue-500 bg-white text-gray-800"
                                    />
                                  ) : (
                                    <p className="text-sm font-bold truncate">{fileName}</p>
                                  )}
                                  <p className="text-[10px] text-gray-400">
                                    {doc.size_bytes ? `${(doc.size_bytes / 1024).toFixed(1)} KB` : '0 KB'} • {new Date(doc.created_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </a>
                            )}
                          </div>

                          {/* Quick Actions (Rename, Move, Delete) */}
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity no-print">
                            <button
                              onClick={() => {
                                setRenamingDocId(doc.id)
                                setRenameName(fileName)
                              }}
                              title="Rename"
                              className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>

                            {/* Move trigger */}
                            <button
                              onClick={() => setMovingDocId(doc.id)}
                              title="Move"
                              className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-800"
                            >
                              <Move className="h-3.5 w-3.5" />
                            </button>

                            <button
                              onClick={async () => {
                                if (confirm(`Are you sure you want to delete this ${isFolder ? 'folder and all its contents' : 'file'}?`)) {
                                  try {
                                    const res = await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
                                    if (res.ok) fetchTransaction()
                                  } catch (err) {
                                    console.error(err)
                                  }
                                }
                              }}
                              title="Delete"
                              className="p-1 rounded hover:bg-red-50 text-red-500 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Move Destination Modal Overlay */}
              {movingDocId && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-xl max-w-sm w-full p-5 border border-gray-100 shadow-xl space-y-4">
                    <h4 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                      <Move className="h-4.5 w-4.5 text-blue-600" /> Move to Folder
                    </h4>
                    <p className="text-xs text-gray-500">Select where to move this document:</p>
                    
                    <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-100 rounded-lg p-2 bg-gray-50/50">
                      <button
                        onClick={() => handleMove(movingDocId, 'ROOT')}
                        className="w-full text-left text-xs font-semibold py-1.5 px-2 hover:bg-blue-50 rounded hover:text-blue-700 flex items-center gap-2"
                      >
                        <Folder className="h-4 w-4 text-amber-500" /> [Root Folder]
                      </button>
                      
                      {documents
                        .filter((d: any) => d.is_folder === 1 && d.id !== movingDocId)
                        .map((folder: any) => (
                          <button
                            key={folder.id}
                            onClick={() => handleMove(movingDocId, folder.id)}
                            className="w-full text-left text-xs font-semibold py-1.5 px-2 hover:bg-blue-50 rounded hover:text-blue-700 flex items-center gap-2"
                          >
                            <Folder className="h-4 w-4 text-amber-500" /> {folder.file_name || folder.original_name}
                          </button>
                        ))
                      }
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => setMovingDocId(null)}
                        className="border border-gray-350 text-gray-700 bg-white hover:bg-gray-100 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
                </>
              )}
              {/* CHECKLIST SUB-TAB */}
              {docSubTab === 'checklist' && (
              <>{/* Checklist Document Requirements */}
              {(() => {
                const requiredTasks = tasks.filter((t: any) => t.document_required)
                if (requiredTasks.length === 0) return (
                  <div className="text-center py-12 text-sm text-gray-500">
                    <p className="font-medium">No checklist document requirements yet.</p>
                    <p className="text-xs text-gray-400 mt-1">Tasks with document requirements will appear here.</p>
                  </div>
                )

                return (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-bold text-gray-900 text-sm">Checklist Document Uploads</h4>
                      <p className="text-xs text-gray-500">Upload or link documents required for checklist completion.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {requiredTasks.map((task: any) => {
                        const isUploading = uploadProgress[task.id] !== undefined
                        const progress = uploadProgress[task.id] || 0

                        return (
                          <div key={task.id} className="rounded-xl border border-gray-150 p-4 bg-gray-50/50 space-y-3">
                            <div className="flex items-start justify-between">
                              <div>
                                <h5 className="font-bold text-gray-800 text-xs">{task.title}</h5>
                                <p className="text-[10px] text-gray-400 mt-0.5">Group: {task.group_name || 'General'}</p>
                              </div>
                              <span className={clsx(
                                "text-[10px] px-2 py-0.5 rounded-full font-semibold",
                                task.status === 'completed' 
                                  ? "bg-emerald-100 text-emerald-700" 
                                  : "bg-amber-100 text-amber-700"
                              )}>
                                {task.status === 'completed' ? 'Completed' : 'Pending'}
                              </span>
                            </div>

                            {task.document_key ? (
                              <div className="bg-white rounded-lg p-2.5 border border-gray-200 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                                  <a
                                    href={`/api/documents/download?key=${task.document_key}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 hover:underline font-semibold truncate"
                                  >
                                    View Submitted File
                                  </a>
                                </div>
                                <div className="flex items-center gap-2">
                                  {task.approval_status && (
                                    <span className={clsx(
                                      "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase",
                                      task.approval_status === 'approved' ? "bg-emerald-100 text-emerald-700" :
                                      task.approval_status === 'rejected' ? "bg-red-100 text-red-750" : "bg-amber-100 text-amber-700"
                                    )}>
                                      {task.approval_status === 'approved' ? 'Compliance OK' : task.approval_status === 'rejected' ? 'Rejected' : 'Pending Review'}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleDeleteTaskDoc(task.id, task.document_key)}
                                    className="text-red-500 hover:text-red-700 font-bold"
                                  >
                                    Unlink
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  {/* Direct upload */}
                                  <label className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 shadow-sm">
                                    <Upload className="h-3 w-3" />
                                    {isUploading ? `Uploading ${progress}%` : 'Upload & Link File'}
                                    <input
                                      type="file"
                                      disabled={isUploading}
                                      className="hidden"
                                      onChange={(e) => handleUploadTaskDocWithProgress(task.id, e)}
                                    />
                                  </label>

                                  {/* Dropdown to link an existing file */}
                                  {documents.filter((d: any) => d.is_folder === 0).length > 0 && (
                                    <select
                                      onChange={async (e) => {
                                        const fileKey = e.target.value
                                        if (!fileKey) return
                                        try {
                                          await fetch(`/api/transactions/${id}/tasks/${task.id}`, {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ document_key: fileKey })
                                          })
                                          fetchTransaction()
                                        } catch (err) {
                                          console.error(err)
                                        }
                                      }}
                                      className="text-xs bg-white border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500 flex-1 max-w-[180px]"
                                    >
                                      <option value="">Link Existing File...</option>
                                      {documents
                                        .filter((d: any) => d.is_folder === 0)
                                        .map((d: any) => (
                                          <option key={d.id} value={d.file_key}>{d.file_name || d.original_name}</option>
                                        ))}
                                    </select>
                                  )}
                                </div>

                                {isUploading && (
                                  <div className="w-full bg-gray-250 h-1.5 rounded-full overflow-hidden">
                                    <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
                                  </div>
                                )}
                              </div>
                            )}

                            {task.approval_status === 'rejected' && task.approval_notes && (
                              <p className="text-[10px] text-red-600 bg-red-50 p-1.5 rounded-lg border border-red-100 mt-1">
                                <strong>Rejection reason:</strong> {task.approval_notes}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
              </>
              )}
            </div>
          )}

          {mainTab === 'outcomes' && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4 flex flex-col h-[650px]">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3 flex-shrink-0">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Outcomes & Next Steps</h3>
                  <p className="text-xs text-gray-500">Real-time discussion and transaction logs</p>
                </div>
                {isBrokerOrAdmin && (
                  <button
                    onClick={handleResetOutcomes}
                    className="text-xs font-bold text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg border border-red-100 transition-colors"
                  >
                    Reset Chat History
                  </button>
                )}
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3.5 pr-1.5 min-h-0">
                {outcomes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 py-8">
                    <p className="text-sm font-semibold">No outcomes or advice recorded yet.</p>
                    <p className="text-xs text-gray-400 mt-1">Start the conversation by posting a message below.</p>
                  </div>
                ) : (
                  outcomes.map((o: any) => {
                    const isCurrentUser = o.user_id === user?.id
                    return (
                      <div key={o.id} className={clsx("flex flex-col max-w-[80%]", isCurrentUser ? "ml-auto items-end" : "mr-auto items-start")}>
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1 px-1">
                          {!isCurrentUser && <span className="font-bold text-gray-800">{o.first_name} {o.last_name}</span>}
                          {o.is_broker_advice === 1 && <span className="text-[9px] uppercase font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Broker Advice</span>}
                          <span>{new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className={clsx(
                          "px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm",
                          isCurrentUser
                            ? "bg-brand-navy text-white rounded-tr-none"
                            : o.is_broker_advice
                              ? "bg-amber-50 border border-amber-100 text-amber-900 rounded-tl-none"
                              : "bg-gray-100 text-gray-850 rounded-tl-none"
                        )}>
                          <p className="whitespace-pre-line">{o.message}</p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handlePostOutcome} className="flex flex-col gap-3 pt-4 border-t border-gray-100">
                <textarea 
                  required
                  value={newOutcomeMessage}
                  onChange={e => setNewOutcomeMessage(e.target.value)}
                  placeholder="Record a next step, update, or ask for advice..."
                  className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none min-h-[100px]"
                />
                
                {isBrokerOrAdmin && (
                  <label className="flex items-center gap-2 cursor-pointer w-fit">
                    <input type="checkbox" checked={isOutcomeAdvice} onChange={e => setIsOutcomeAdvice(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-600" />
                    <span className="text-sm font-semibold text-gray-700">Mark as Broker Advice</span>
                  </label>
                )}
                
                <div className="flex justify-between items-center">
                  <div className="flex gap-2">
                    {outcomeTemplates.length > 0 && (
                      <select 
                        onChange={e => {
                          if (e.target.value) {
                            setNewOutcomeMessage(prev => prev ? prev + '\n\n' + e.target.value : e.target.value)
                            e.target.value = ''
                          }
                        }}
                        className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none"
                      >
                        <option value="">Insert Template...</option>
                        {outcomeTemplates.map(t => (
                          <option key={t.id} value={t.message}>{t.title}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <button type="submit" disabled={isPostingOutcome || !newOutcomeMessage.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                    Post Outcome
                  </button>
                </div>
              </form>
            </div>
          )}

          {mainTab === 'offers' && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div>
                  <h3 className="font-extrabold text-gray-900 text-lg flex items-center gap-2">
                    <Tag className="h-5 w-5 text-blue-600" /> Offers Management ({offers.length})
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Track, submit, and generate printable letterhead offers for this transaction</p>
                </div>

                <button
                  onClick={handleOpenCreateOfferModal}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-colors"
                >
                  <Plus className="h-4 w-4" /> Create New Offer
                </button>
              </div>

              {offers.length === 0 ? (
                <div className="text-center py-12 bg-gray-50/60 rounded-2xl border border-dashed border-gray-200 p-8 space-y-3">
                  <Tag className="h-10 w-10 text-gray-300 mx-auto" />
                  <h4 className="font-bold text-gray-800 text-sm">No Offers Tracked Yet</h4>
                  <p className="text-xs text-gray-500 max-w-md mx-auto">
                    Create an offer to auto-fill property, buyer, seller, and financing details, then generate official letterhead Sales Agreements or Letters of Intent (LOI).
                  </p>
                  <button
                    onClick={handleOpenCreateOfferModal}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-navy hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-colors mt-2"
                  >
                    <Plus className="h-3.5 w-3.5" /> + Create First Offer
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {offers.map((off: any, idx: number) => (
                    <div key={off.id || idx} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs hover:border-blue-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={clsx(
                            "px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase",
                            off.offerType === 'sales_agreement' ? "bg-amber-100 text-amber-800 border border-amber-200" : "bg-blue-100 text-blue-800 border border-blue-200"
                          )}>
                            {off.offerType === 'sales_agreement' ? 'Sales Agreement (Co-Broke)' : 'Letter of Intent (LOI)'}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                            {off.status || 'Submitted'}
                          </span>
                          <span className="text-xs text-gray-400 font-medium">• {off.offerDate}</span>
                        </div>

                        <div className="pt-1">
                          <p className="font-black text-xl text-gray-900">${Number(off.purchasePrice || 0).toLocaleString()}</p>
                          <p className="text-xs text-gray-600 font-medium">
                            Down Payment: <strong>${Number(off.downPaymentAmount || 0).toLocaleString()} ({off.downPaymentPercent || 50}%)</strong> • Mortgage: <strong>${Number(off.mortgageAmount || 0).toLocaleString()}</strong>
                          </p>
                        </div>

                        <p className="text-xs text-gray-500">
                          Purchaser: <strong className="text-gray-800">{off.purchaserName || 'N/A'}</strong> | Seller: <strong className="text-gray-800">{off.sellerName || 'N/A'}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap flex-shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100">
                        <button
                          onClick={() => {
                            setSelectedOffer(off)
                            setShowPrintOfferModal(true)
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-sm transition-colors"
                        >
                          <Printer className="h-3.5 w-3.5" /> View / Print Letterhead
                        </button>
                        <button
                          onClick={() => {
                            const recipients = [off.loanOfficerEmail, off.attorneyEmail].filter(Boolean)
                            setSelectedRecipients(recipients)
                            setEmailSubject(`Offer Document (${off.offerType === 'sales_agreement' ? 'Sales Agreement' : 'LOI'}): ${off.propertyAddress}`)
                            setEmailBody(`Hi,\n\nPlease find attached/reviewed offer details for ${off.propertyAddress}.\n\nOffer Price: $${Number(off.purchasePrice).toLocaleString()}\nDown Payment: $${Number(off.downPaymentAmount).toLocaleString()}\n\nBest regards,\n${user?.name || 'Prime America Real Estate'}`)
                            setEmailModalOpen(true)
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-bold shadow-sm"
                        >
                          <Mail className="h-3.5 w-3.5 text-blue-600" /> Email
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this offer record?')) {
                              setOffers(prev => prev.filter((_, i) => i !== idx))
                            }
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Checklist */}
          {mainTab === 'tasks' && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between bg-gray-50/50 no-print">
              <h3 className="font-semibold text-gray-900">Compliance & Tasks Journey</h3>
              <div className="flex gap-2">
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg text-gray-700"
                >
                  <option value="">Select template...</option>
                  {compatibleTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (selectedTemplateId) {
                      applyTemplate(selectedTemplateId, true)
                    }
                  }}
                  disabled={!selectedTemplateId}
                  className="text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply Template
                </button>
              </div>
            </div>

            <div className="border-b border-gray-100 px-6 py-4 bg-white no-print">
              <form onSubmit={handleCreateTask} className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <input
                  type="text"
                  placeholder="Manual task name..."
                  className="w-full sm:w-1/4 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  disabled={isAddingTask}
                />
                <select
                  value={newTaskGroup}
                  onChange={e => setNewTaskGroup(e.target.value)}
                  className="w-full sm:w-1/4 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none bg-white"
                  disabled={isAddingTask}
                >
                  <option value="">No Group</option>
                  {Array.from(new Set(tasks.map((t: any) => t.group_name).filter(Boolean))).map(g => (
                    <option key={g as string} value={g as string}>{g as string}</option>
                  ))}
                </select>
                <div className="flex gap-4 items-center flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTaskReqAttach}
                      onChange={e => setNewTaskReqAttach(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span className="text-xs font-medium text-gray-700">Require Attachment</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTaskReqBroker}
                      onChange={e => setNewTaskReqBroker(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                    />
                    <span className="text-xs font-medium text-gray-700">Require Broker Approval</span>
                  </label>
                  <button
                    type="submit"
                    disabled={isAddingTask || !newTaskTitle.trim()}
                    className="text-sm font-medium text-white bg-gray-900 border border-gray-900 px-3 py-1.5 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <Plus className="h-4 w-4" /> Add Task
                  </button>
                </div>
              </form>
            </div>
            
            <div className="hidden print:block px-6 py-3 bg-gray-100 font-bold text-sm">
              Compliance Checklist Status
            </div>

            {/* Task Groups */}
            {(() => {
              if (tasks.length === 0) {
                return (
                  <div className="text-center py-12 px-4">
                    <h4 className="text-sm font-medium text-gray-900">No journey tasks assigned.</h4>
                  </div>
                )
              }

              const groups = Array.from(new Set(tasks.map((t: any) => t.group_name || 'Ungrouped Tasks')))
              
              return (
                <div className="flex flex-col gap-6 pt-4">
                  {groups.map(groupName => {
                    const groupTasks = tasks.filter((t: any) => (t.group_name || 'Ungrouped Tasks') === groupName)
                    const completedTasks = groupTasks.filter((t: any) => t.status === 'completed')
                    const progress = Math.round((completedTasks.length / groupTasks.length) * 100)

                    return (
                      <div key={groupName as string} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-col gap-3">
                          <div className="flex justify-between items-center">
                            <h3 className="font-bold text-gray-900">{groupName as string}</h3>
                            <span className="text-xs font-bold text-gray-900">{progress}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full transition-all duration-500 ease-out" 
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                          {progress === 100 && (
                            <p className="text-emerald-600 text-xs font-bold animate-pulse flex items-center gap-1">
                              <CheckCircle2 className="h-4 w-4" /> All tasks completed successfully!
                            </p>
                          )}
                        </div>
                        <ul className="divide-y divide-gray-100">
                          {groupTasks.map((task: any) => (
                            <li key={task.id} className="px-6 py-4 hover:bg-gray-50/30">
                              <div className="flex items-start gap-4 justify-between">
                                <div className="flex items-start gap-3">
                                  <button 
                                    onClick={() => toggleTask(task.id, task.status)}
                                    className="text-gray-300 hover:text-blue-600 transition-colors mt-0.5 no-print"
                                  >
                                    {task.status === 'completed' ? (
                                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                    ) : (
                                      <Circle className="h-5 w-5" />
                                    )}
                                  </button>
                                  <div>
                                    <p className={clsx(
                                      "text-sm font-semibold",
                                      task.status === 'completed' ? "text-gray-400 line-through" : "text-gray-900"
                                    )}>
                                      {task.title}
                                    </p>
                                    {task.description && (
                                      <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
                                    )}
                                  </div>
                                </div>

                                <div className="flex items-center gap-3">
                                  <div className="relative">
                                    <button
                                      onClick={() => setTaskMenuOpen(prev => prev === task.id ? null : task.id)}
                                      className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 no-print"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                    {taskMenuOpen === task.id && (
                                      <div className="absolute right-0 top-full mt-1 bg-white rounded-lg border border-gray-200 shadow-lg z-20 w-32 overflow-hidden">
                                        <button
                                          onClick={() => { setTaskMenuOpen(null); handleDeleteTask(task.id) }}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" /> Delete
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  {task.due_date && (
                                    <span className="text-xs text-gray-400 whitespace-nowrap">
                                      Due: {task.due_date}
                                    </span>
                                  )}
                                  {!task.due_date && (
                                    <span className="text-xs text-amber-600 whitespace-nowrap font-medium">
                                      Due: TBD
                                    </span>
                                  )}

                                  {/* Compliance Status Badge */}
                                  {task.document_key ? (
                                    <span className={clsx(
                                      "text-xs font-semibold px-2 py-0.5 rounded-full capitalize",
                                      task.approval_status === 'approved' ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                                      task.approval_status === 'rejected' ? "bg-red-50 text-red-700 border border-red-200" :
                                      "bg-amber-50 text-amber-700 border border-amber-200"
                                    )}>
                                      {task.approval_status === 'approved' ? 'Compliance OK' : task.approval_status === 'rejected' ? 'Rejected' : 'Pending Review'}
                                    </span>
                                  ) : (
                                    <span className={clsx(
                                      "text-[10px] italic",
                                      task.document_required ? "text-red-600 font-semibold" : "text-gray-400"
                                    )}>
                                      {task.document_required ? 'Document Required' : 'Document Optional'}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Compliance documents & approval area */}
                              <div className="mt-3 pl-8 flex flex-col gap-2">
                                {task.document_key ? (
                                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-gray-400" />
                                      <a 
                                        href={`/api/documents/download?key=${task.document_key}`} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="text-blue-600 hover:underline font-medium"
                                      >
                                        View Submitted Compliance File
                                      </a>
                                    </div>

                                    <div className="flex items-center gap-2 no-print">
                                      {task.approval_status !== 'approved' && (
                                        <button
                                          onClick={() => handleDeleteTaskDoc(task.id, task.document_key)}
                                          className="text-red-600 hover:text-red-800 p-1 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 font-semibold"
                                          title="Delete document"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" /> Delete
                                        </button>
                                      )}

                                      {/* Broker actions */}
                                      {isBrokerOrAdmin && task.approval_status === 'pending' && (
                                        <div className="flex gap-1.5">
                                          <button
                                            onClick={() => handleUpdateTaskApproval(task.id, 'approved')}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white p-1 rounded-lg transition-colors flex items-center gap-1"
                                          >
                                            <Check className="h-3 w-3" /> Approve
                                          </button>
                                          <button
                                            onClick={() => {
                                              const note = prompt('Enter rejection reason:')
                                              if (note !== null) handleUpdateTaskApproval(task.id, 'rejected', note)
                                            }}
                                            className="bg-red-50 hover:bg-red-100 text-red-700 p-1 rounded-lg transition-colors flex items-center gap-1 border border-red-200"
                                          >
                                            <X className="h-3 w-3" /> Reject
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (task.document_required !== 0 && task.document_required !== false && task.document_required !== '0') && (() => {
                                  const isUploading = uploadProgress[task.id] !== undefined
                                  const progress = uploadProgress[task.id] || 0
                                  return (
                                    <div className="flex flex-col gap-2">
                                      <label className={clsx(
                                        "inline-flex items-center gap-1.5 text-xs cursor-pointer font-semibold w-fit no-print px-2.5 py-1.5 rounded-lg",
                                        task.document_required
                                          ? "text-red-700 hover:text-red-800 bg-red-50 border border-red-200"
                                          : "text-blue-600 hover:text-blue-800 bg-blue-50",
                                        isUploading && "opacity-50 pointer-events-none"
                                      )}>
                                        <Upload className="h-3.5 w-3.5" />
                                        {isUploading ? `Uploading ${progress}%` : task.document_required ? 'Attach Required Document' : 'Attach Document'}
                                        <input
                                          type="file"
                                          disabled={isUploading}
                                          className="hidden"
                                          onChange={(e) => handleUploadTaskDocWithProgress(task.id, e)}
                                        />
                                      </label>
                                      {isUploading && (
                                        <div className="w-48 bg-gray-200 h-1 rounded-full overflow-hidden">
                                          <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
                                        </div>
                                      )}
                                    </div>
                                  )
                                })()}

                                {task.approval_status === 'rejected' && task.approval_notes && (
                                  <p className="text-xs text-red-600 bg-red-50 p-2 rounded-lg border border-red-100">
                                    <strong>Rejection reason:</strong> {task.approval_notes}
                                  </p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
          )}

          {mainTab === 'timeline' && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Transaction Timeline & Dates</h3>
                <p className="text-xs text-gray-500">Track critical dates, contract milestones, and task reminders.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { label: 'Listed Date', value: listedDate, setter: setListedDate, key: 'listed_date' },
                  { label: 'Expiration Date', value: expireDate, setter: setExpireDate, key: 'expire_date' },
                  { label: 'Offer Date', value: offerDate, setter: setOfferDate, key: 'offer_date' },
                  { label: 'Pending Date', value: pendingDate, setter: setPendingDate, key: 'pending_date' },
                  { label: 'Home Inspection Date', value: homeInspectionDate, setter: setHomeInspectionDate, key: 'home_inspection_date' },
                  { label: 'Possession Date', value: possessionDate, setter: setPossessionDate, key: 'possession_date' },
                  { label: 'Escrow Deposit Date', value: escrowDate, setter: setEscrowDate, key: 'escrow_date' },
                  { label: 'Inspection Contingency Deadline', value: inspectionDeadline, setter: setInspectionDeadline, key: 'inspection_deadline' },
                  { label: 'Appraisal Contingency Date', value: appraisalDate, setter: setAppraisalDate, key: 'appraisal_date' },
                ].map((item) => (
                  <div key={item.key} className="bg-gray-50/50 p-4 rounded-xl border border-gray-150 space-y-3 flex flex-col justify-between">
                    <div>
                      <span className="text-xs font-bold text-gray-700 block mb-1.5">{item.label}</span>
                      <input
                        type="date"
                        value={item.value}
                        disabled={!canEdit}
                        onChange={e => item.setter(e.target.value)}
                        className="w-full rounded-lg border border-gray-305 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white"
                      />
                    </div>
                    {item.value && (
                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 mt-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadCalendar(item.label, item.value)}
                          className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 text-[10px] font-bold px-2 py-1.5 rounded-lg flex items-center gap-1"
                        >
                          <CalendarDays className="h-3.5 w-3.5 text-gray-500" />
                          Add to Cal
                        </button>
                        <button
                          type="button"
                          disabled={notifyingMilestone !== null}
                          onClick={() => handleNotifyTeam(item.key, item.value)}
                          className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 text-[10px] font-bold px-2 py-1.5 rounded-lg flex items-center gap-1"
                        >
                          {notifyingMilestone === item.key ? 'Notifying...' : 'Notify Team'}
                        </button>
                        <button
                          type="button"
                          disabled={creatingTaskMilestone !== null}
                          onClick={() => handleCreateChecklistReminder(item.label, item.value)}
                          className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 text-[10px] font-bold px-2 py-1.5 rounded-lg flex items-center gap-1"
                        >
                          {creatingTaskMilestone === item.label ? 'Creating...' : 'Create Reminder'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {canEdit && (
                <div className="flex justify-end pt-4 border-t border-gray-100">
                  <button
                    onClick={async () => {
                      setIsSavingSettings(true)
                      try {
                        const res = await fetch(`/api/transactions/${id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            listed_date: listedDate || null,
                            expire_date: expireDate || null,
                            offer_date: offerDate || null,
                            pending_date: pendingDate || null,
                            home_inspection_date: homeInspectionDate || null,
                            possession_date: possessionDate || null,
                            escrow_date: escrowDate || null,
                            inspection_deadline: inspectionDeadline || null,
                            appraisal_date: appraisalDate || null,
                          })
                        })
                        if (res.ok) {
                          fetchTransaction()
                          alert('Timeline dates updated successfully!')
                        } else {
                          const err = await res.json()
                          alert(err.error || 'Failed to update timeline')
                        }
                      } catch (err) {
                        console.error(err)
                      } finally {
                        setIsSavingSettings(false)
                      }
                    }}
                    disabled={isSavingSettings}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-sm shadow-sm"
                  >
                    {isSavingSettings ? 'Saving...' : 'Save Timeline'}
                  </button>
                </div>
              )}
            </div>
          )}

          {mainTab === 'settings' && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-6">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Transaction Settings</h3>
                <p className="text-xs text-gray-500">Manage transaction details, team collaboration, permissions, and status.</p>
              </div>

              {/* General Settings */}
              <div className="space-y-4">
                <h4 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2">General Info</h4>
                <div className="max-w-md space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Transaction Name</label>
                    <input
                      type="text"
                      value={settingName}
                      disabled={!canEdit}
                      onChange={e => setSettingName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  {canEdit && (
                    <button
                      onClick={async () => {
                        if (!settingName.trim()) {
                          alert('Transaction name cannot be empty')
                          return
                        }
                        setIsSavingSettings(true)
                        try {
                          const res = await fetch(`/api/transactions/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: settingName })
                          })
                          if (res.ok) {
                            fetchTransaction()
                            alert('Transaction name updated successfully!')
                          } else {
                            const err = await res.json()
                            alert(err.error || 'Failed to update name')
                          }
                        } catch (err) {
                          console.error(err)
                        } finally {
                          setIsSavingSettings(false)
                        }
                      }}
                      disabled={isSavingSettings}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-2 rounded-lg"
                    >
                      Update Name
                    </button>
                  )}
                </div>
              </div>

              {/* Lock Deal Settings (Broker/Admin only) */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h4 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2">Lock Status</h4>
                <div className="flex items-start justify-between bg-gray-50/50 p-4 rounded-xl border border-gray-150">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      {isLocked ? (
                        <>
                          <Lock className="h-4 w-4 text-amber-600" /> Locked
                        </>
                      ) : (
                        <>
                          <Unlock className="h-4 w-4 text-emerald-600" /> Unlocked
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500 leading-relaxed max-w-md">
                      Locking this transaction prevents agents from modifying compliance checklists, deal outline fields, uploads, and outcomes. Only brokers/admins can change details of locked transactions.
                    </p>
                  </div>
                  {isBrokerOrAdmin ? (
                    <button
                      onClick={() => setLockConfirmOpen(true)}
                      className={clsx(
                        "text-xs font-bold px-3 py-1.5 rounded-lg border",
                        isLocked 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" 
                          : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                      )}
                    >
                      {isLocked ? 'Unlock Transaction' : 'Lock Transaction'}
                    </button>
                  ) : (
                    <span className="text-[10px] text-gray-400 bg-gray-150 px-2.5 py-1.5 rounded-lg font-semibold">
                      Requires Broker Privilege
                    </span>
                  )}
                </div>
              </div>

              {/* Collaboration & Sharing Settings */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h4 className="font-bold text-gray-800 text-sm border-b border-gray-100 pb-2">Deal Sharing & Collaboration</h4>
                <p className="text-xs text-gray-500">
                  Share access to this transaction with other workspace members (up to 4 members).
                </p>

                {/* Team Members List */}
                <div className="space-y-3 mb-4">
                  {team.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-150 bg-gray-50/50 max-w-xl">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs flex-shrink-0">
                          {t.first_name?.[0] || t.name?.[0]}{t.last_name?.[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {t.first_name || t.name} {t.last_name || ''}
                          </p>
                          <p className="text-xs text-gray-500 capitalize">{t.role?.replace('-', ' ')} {t.license_number ? `• Lic: ${t.license_number}` : ''}</p>
                        </div>
                      </div>
                      {t.user_id !== user?.id && canEdit && (
                        <button
                          onClick={() => handleRemoveTeamMember(t.user_id)}
                          className="text-red-500 hover:text-red-700 text-xs font-semibold"
                          title="Remove from team"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  {team.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No workspace members co-assigned to this deal.</p>
                  )}
                </div>

                {/* Search & Add member input */}
                {canEdit && team.length < 4 && (
                  <div className="relative max-w-sm mt-2">
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Add workspace member</label>
                    <div className="relative">
                      <input
                        type="text"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                        placeholder="Search name, email or license..."
                        value={teamSearchQuery}
                          onChange={(e) => {
                            setTeamSearchQuery(e.target.value)
                            setIsTeamDropdownOpen(true)
                          }}
                          onFocus={() => setIsTeamDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setIsTeamDropdownOpen(false), 200)}
                        />
                        {isAddingTeam && (
                          <div className="absolute right-3 top-2.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                          </div>
                        )}
                        {isTeamDropdownOpen && filteredDirectory.length > 0 && (
                          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                            {filteredDirectory.map(u => (
                              <li
                                key={u.id}
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  handleAddTeamMember(u.id)
                                }}
                                className="cursor-pointer px-4 py-2 text-xs hover:bg-gray-50 flex flex-col justify-center text-left"
                              >
                                <span className="font-medium text-gray-900">{u.name || (u.first_name + ' ' + u.last_name)}</span>
                                <span className="text-[10px] text-gray-500 truncate">
                                  {u.email} {u.license_number ? `• Lic: ${u.license_number}` : ''}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    <p className="mt-1.5 text-[10px] text-gray-400">Search to add team members to this deal (Max 4).</p>
                  </div>
                )}
              </div>

              {/* Danger Zone */}
              {isBrokerOrAdmin && (
                <div className="space-y-4 pt-4 border-t border-red-100 bg-red-50/30 p-4 rounded-xl border border-red-200">
                  <h4 className="font-bold text-red-800 text-sm">Danger Zone</h4>
                  <p className="text-xs text-gray-600">
                    Deleting a deal deletes all task lists, comments, real-time Outcomes history, and files forever. This action cannot be undone.
                  </p>
                  <button
                    onClick={async () => {
                      if (confirm('CRITICAL: Are you sure you want to delete this transaction? All linked compliance records and conversation logs will be permanently deleted.')) {
                        await handleDeleteDeal()
                      }
                    }}
                    disabled={isDeleting}
                    className="inline-flex items-center gap-1.5 text-xs font-bold bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg shadow-sm"
                  >
                    <Trash2 className="h-4 w-4" /> {isDeleting ? 'Deleting...' : 'Delete Transaction'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* ── Email to Parties Modal ─────────────────────────────────────── */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 p-5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                <h2 className="text-base font-bold text-gray-900">Email to Parties</h2>
              </div>
              <button onClick={() => setEmailModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Party Selection Checkboxes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Select Recipients ({selectedRecipients.length})
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedRecipients(getPartyRecipients().map(p => p.email))}
                      className="text-blue-600 hover:underline font-semibold"
                    >
                      Select All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedRecipients([])}
                      className="text-gray-500 hover:underline font-semibold"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                {getPartyRecipients().length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
                    No party emails configured for this deal. Enter party email addresses in Edit Details to select recipients.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto bg-gray-50 p-3 rounded-xl border border-gray-200">
                    {getPartyRecipients().map((party, idx) => {
                      const isSelected = selectedRecipients.includes(party.email)
                      return (
                        <label key={idx} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-white cursor-pointer transition-colors">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedRecipients(prev => [...prev, party.email])
                                } else {
                                  setSelectedRecipients(prev => prev.filter(em => em !== party.email))
                                }
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="font-semibold text-gray-800">{party.name}</span>
                            <span className="text-[10px] text-gray-400">({party.role})</span>
                          </div>
                          <span className="text-[11px] text-gray-500 font-mono">{party.email}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Subject</label>
                <input
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Message</label>
                <textarea
                  rows={5}
                  value={emailBody}
                  onChange={e => setEmailBody(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setEmailModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
              <button
                disabled={isSendingEmail || selectedRecipients.length === 0 || !emailSubject.trim()}
                onClick={async () => {
                  setIsSendingEmail(true)
                  try {
                    await fetch(`/api/transactions/${id}/email-parties`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ subject: emailSubject, body: emailBody, recipients: selectedRecipients })
                    })
                    setEmailModalOpen(false)
                    alert(`Email sent successfully to ${selectedRecipients.length} recipient(s)!`)
                  } catch (e) {
                    console.error(e)
                    alert('Failed to send email.')
                  } finally {
                    setIsSendingEmail(false)
                  }
                }}
                className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {isSendingEmail ? 'Sending...' : `Send Email (${selectedRecipients.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lock Confirmation Modal ─────────────────────────────────────── */}
      {lockConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              {isLocked ? <Unlock className="h-6 w-6 text-emerald-600" /> : <Lock className="h-6 w-6 text-amber-600" />}
              <h2 className="text-base font-bold text-gray-900">{isLocked ? 'Unlock Transaction?' : 'Lock Transaction?'}</h2>
            </div>
            <p className="text-sm text-gray-600">
              {isLocked
                ? 'Unlocking will allow agents to modify this transaction again.'
                : 'Locking prevents agents from modifying compliance checklists, documents, and outcomes. Only brokers/admins can make changes.'}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setLockConfirmOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/transactions/${id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ is_locked: !isLocked })
                    })
                    if (res.ok) { setLockConfirmOpen(false); fetchTransaction() }
                    else { const err = await res.json(); alert(err.error || 'Failed to update lock status') }
                  } catch (err) { console.error(err) }
                }}
                className={clsx(
                  "rounded-lg px-4 py-2 text-sm font-bold text-white",
                  isLocked ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
                )}
              >
                {isLocked ? 'Unlock' : 'Lock'} Transaction
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Details Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 p-6 flex-shrink-0">
              <h2 className="text-lg font-bold text-gray-900">Edit Deal Details</h2>
              <button onClick={() => setIsEditOpen(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>
            
            <form onSubmit={handleUpdateDetails} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Type</label>
                <select value={editType} onChange={e => setEditType(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white">
                  <option value="sale">Sale</option>
                  <option value="lease">Lease</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Target Price ($)</label>
                  <input type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Comm Rate (%)</label>
                  <input type="number" step="0.01" value={editCommRate} onChange={e => setEditCommRate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Comm Fixed ($)</label>
                  <input type="number" value={editCommAmount} onChange={e => setEditCommAmount(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Agreement Type</label>
                  <input value={editAgreementType} onChange={e => setEditAgreementType(e.target.value)} placeholder="e.g. Exclusive Right to Sell" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Agreement Expiry</label>
                  <input type="date" value={editAgreementExpiry} onChange={e => setEditAgreementExpiry(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Target Close Date</label>
                <input type="date" value={editCloseDate} onChange={e => setEditCloseDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsEditOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Outline Details Modal */}
      {isOutlineEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 p-6 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Edit Deal Outline Fields</h2>
                <p className="text-xs text-gray-400 mt-0.5">These inputs map directly to the printed Deal Outline Sheet.</p>
              </div>
              <button onClick={() => setIsOutlineEditOpen(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            {/* Modal Tabs Header */}
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
            
            <form onSubmit={handleUpdateOutline} className="p-6 space-y-4 overflow-y-auto flex-1">

              {/* TAB 1: Parties */}
              {activeOutlineTab === 'parties' && (
                <div className="space-y-6">
                  {/* Buyers Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <h4 className="font-bold text-gray-800 text-sm">Buyers ({getBuyersList().length})</h4>
                      <button
                        type="button"
                        onClick={handleAddBuyerField}
                        className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Buyer
                      </button>
                    </div>
                    {getBuyersList().map((buyer: any, index: number) => (
                      <div key={index} className="bg-gray-50/50 p-4 rounded-xl border border-gray-150 space-y-3 relative">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-700">Buyer #{index + 1}</span>
                          {index > 0 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveBuyerField(index)}
                              className="text-[10px] text-red-500 hover:text-red-700 font-semibold"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Name</label>
                            <input
                              value={buyer.name || ''}
                              onChange={e => handleUpdateBuyerField(index, 'name', e.target.value)}
                              placeholder="Jane Doe"
                              className="w-full rounded-lg border border-gray-350 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none bg-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Email</label>
                            <input
                              type="email"
                              value={buyer.email || ''}
                              onChange={e => handleUpdateBuyerField(index, 'email', e.target.value)}
                              placeholder="buyer@email.com"
                              className="w-full rounded-lg border border-gray-350 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none bg-white"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Phone</label>
                            <input
                              value={buyer.phone || ''}
                              onChange={e => handleUpdateBuyerField(index, 'phone', e.target.value)}
                              placeholder="(555) 111-2222"
                              className="w-full rounded-lg border border-gray-350 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none bg-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Address</label>
                            <input
                              value={buyer.address || ''}
                              onChange={e => handleUpdateBuyerField(index, 'address', e.target.value)}
                              placeholder="123 Buyer St, New York, NY"
                              className="w-full rounded-lg border border-gray-350 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Sellers Section */}
                  <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                      <h4 className="font-bold text-gray-800 text-sm">Sellers ({getSellersList().length})</h4>
                      <button
                        type="button"
                        onClick={handleAddSellerField}
                        className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Seller
                      </button>
                    </div>
                    {getSellersList().map((seller: any, index: number) => (
                      <div key={index} className="bg-gray-50/50 p-4 rounded-xl border border-gray-150 space-y-3 relative">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-700">Seller #{index + 1}</span>
                          {index > 0 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSellerField(index)}
                              className="text-[10px] text-red-500 hover:text-red-700 font-semibold"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Name</label>
                            <input
                              value={seller.name || ''}
                              onChange={e => handleUpdateSellerField(index, 'name', e.target.value)}
                              placeholder="John Smith"
                              className="w-full rounded-lg border border-gray-355 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none bg-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Email</label>
                            <input
                              type="email"
                              value={seller.email || ''}
                              onChange={e => handleUpdateSellerField(index, 'email', e.target.value)}
                              placeholder="seller@email.com"
                              className="w-full rounded-lg border border-gray-355 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none bg-white"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Phone</label>
                            <input
                              value={seller.phone || ''}
                              onChange={e => handleUpdateSellerField(index, 'phone', e.target.value)}
                              placeholder="(555) 333-4444"
                              className="w-full rounded-lg border border-gray-355 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none bg-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Address</label>
                            <input
                              value={seller.address || ''}
                              onChange={e => handleUpdateSellerField(index, 'address', e.target.value)}
                              placeholder="456 Seller St, Brooklyn, NY"
                              className="w-full rounded-lg border border-gray-355 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 2: Attorneys */}
              {activeOutlineTab === 'attorneys' && (
                <div className="space-y-6">
                  {/* Buyer Attorney */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider">Buyer's Attorney</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Attorney Name</label>
                        <input
                          value={outlineFields.buyerAttorneyName || ''}
                          onChange={e => updateField('buyerAttorneyName', e.target.value)}
                          onBlur={() => autofillAttorneyFromNetwork('buyer')}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Attorney Address</label>
                        <input value={outlineFields.buyerAttorneyAddress || ''} onChange={e => updateField('buyerAttorneyAddress', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Email</label>
                        <input
                          type="email"
                          value={outlineFields.buyerAttorneyEmail || ''}
                          onChange={e => updateField('buyerAttorneyEmail', e.target.value)}
                          onBlur={() => autofillAttorneyFromNetwork('buyer')}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Phone</label>
                        <input value={outlineFields.buyerAttorneyPhone || ''} onChange={e => updateField('buyerAttorneyPhone', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Fax</label>
                        <input value={outlineFields.buyerAttorneyFax || ''} onChange={e => updateField('buyerAttorneyFax', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                  </div>

                  {/* Seller Attorney */}
                  <div className="space-y-3 pt-4 border-t border-gray-100">
                    <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider">Seller's Attorney</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Attorney Name</label>
                        <input
                          value={outlineFields.sellerAttorneyName || ''}
                          onChange={e => updateField('sellerAttorneyName', e.target.value)}
                          onBlur={() => autofillAttorneyFromNetwork('seller')}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Attorney Address</label>
                        <input value={outlineFields.sellerAttorneyAddress || ''} onChange={e => updateField('sellerAttorneyAddress', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Email</label>
                        <input
                          type="email"
                          value={outlineFields.sellerAttorneyEmail || ''}
                          onChange={e => updateField('sellerAttorneyEmail', e.target.value)}
                          onBlur={() => autofillAttorneyFromNetwork('seller')}
                          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Phone</label>
                        <input value={outlineFields.sellerAttorneyPhone || ''} onChange={e => updateField('sellerAttorneyPhone', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Fax</label>
                        <input value={outlineFields.sellerAttorneyFax || ''} onChange={e => updateField('sellerAttorneyFax', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: Agents & Agencies */}
              {activeOutlineTab === 'agents' && (
                <div className="space-y-6">
                  <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
                    <p className="text-xs font-semibold text-blue-700 mb-1">Who are you representing on this deal?</p>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!outlineFields.isRepresentingBuyer}
                          onChange={(e) => applyWorkspaceAgentData('buyer', e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700">Buyer</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!outlineFields.isRepresentingSeller}
                          onChange={(e) => applyWorkspaceAgentData('seller', e.target.checked)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-gray-700">Seller</span>
                      </label>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">When checked, agent and company fields auto-fill from your workspace profile.</p>
                  </div>

                  {/* Selling Agent & Agency */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider">Selling Agent / Agency</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Selling Agent Name</label>
                        <input value={outlineFields.sellingAgentName || ''} onChange={e => updateField('sellingAgentName', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Cell</label>
                        <input value={outlineFields.sellingAgentCell || ''} onChange={e => updateField('sellingAgentCell', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Email</label>
                        <input type="email" value={outlineFields.sellingAgentEmail || ''} onChange={e => updateField('sellingAgentEmail', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">License No</label>
                        <input value={outlineFields.sellingAgentLicense || ''} onChange={e => updateField('sellingAgentLicense', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-50">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Co-Selling Agent Name</label>
                        <input value={outlineFields.coSellingAgentName || ''} onChange={e => updateField('coSellingAgentName', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Co-Selling Cell / Contact</label>
                        <input value={outlineFields.coSellingAgentCell || ''} onChange={e => updateField('coSellingAgentCell', e.target.value)} placeholder="(555) 123-4567" className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Co-Selling License No</label>
                        <input value={outlineFields.coSellingAgentLicense || ''} onChange={e => updateField('coSellingAgentLicense', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-gray-50">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-gray-500">Selling Agency Info</label>
                        <button
                          type="button"
                          onClick={() => {
                            const name = outlineFields.sellingAgencyName
                            if (!name) { alert('Please enter Selling Agency Name to lookup.'); return }
                            const match = lookupAgencyInfo(name)
                            if (match) {
                              setOutlineFields((prev: any) => ({
                                ...prev,
                                sellingAgencyName: match.name,
                                sellingAgencyAddress: match.address || prev.sellingAgencyAddress,
                                sellingAgencyPhone: match.phone || prev.sellingAgencyPhone,
                                sellingAgencyLicense: match.license || prev.sellingAgencyLicense,
                              }))
                              alert(`Found record for "${match.name}"! Auto-filled agency address, phone, and license.`)
                            } else {
                              saveCustomAgencyToCache({
                                name,
                                address: outlineFields.sellingAgencyAddress,
                                phone: outlineFields.sellingAgencyPhone,
                                license: outlineFields.sellingAgencyLicense,
                              })
                              alert(`Agency details cached for future auto-fill lookups!`)
                            }
                          }}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          <Search className="h-3 w-3" /> Auto-Lookup Agency
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Selling Agency Name</label>
                          <input value={outlineFields.sellingAgencyName || ''} onChange={e => updateField('sellingAgencyName', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Agency Address</label>
                          <input value={outlineFields.sellingAgencyAddress || ''} onChange={e => updateField('sellingAgencyAddress', e.target.value)} placeholder="Full street, city, state, zip" className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Agency Phone</label>
                          <input value={outlineFields.sellingAgencyPhone || ''} onChange={e => updateField('sellingAgencyPhone', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Agency License No</label>
                          <input value={outlineFields.sellingAgencyLicense || ''} onChange={e => updateField('sellingAgencyLicense', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Listing Agent & Agency */}
                  <div className="space-y-3 pt-4 border-t border-gray-100">
                    <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider">Listing Agent / Agency</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Listing Agent Name</label>
                        <input value={outlineFields.listingAgentName || ''} onChange={e => updateField('listingAgentName', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Cell</label>
                        <input value={outlineFields.listingAgentCell || ''} onChange={e => updateField('listingAgentCell', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Email</label>
                        <input type="email" value={outlineFields.listingAgentEmail || ''} onChange={e => updateField('listingAgentEmail', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">License No</label>
                        <input value={outlineFields.listingAgentLicense || ''} onChange={e => updateField('listingAgentLicense', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-50">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Co-Listing Agent Name</label>
                        <input value={outlineFields.coListingAgentName || ''} onChange={e => updateField('coListingAgentName', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Co-Listing Cell / Contact</label>
                        <input value={outlineFields.coListingAgentCell || ''} onChange={e => updateField('coListingAgentCell', e.target.value)} placeholder="(555) 987-6543" className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Co-Listing License No</label>
                        <input value={outlineFields.coListingAgentLicense || ''} onChange={e => updateField('coListingAgentLicense', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-gray-50">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-semibold text-gray-500">Listing Agency Info</label>
                        <button
                          type="button"
                          onClick={() => {
                            const name = outlineFields.listingAgencyName
                            if (!name) { alert('Please enter Listing Agency Name to lookup.'); return }
                            const match = lookupAgencyInfo(name)
                            if (match) {
                              setOutlineFields((prev: any) => ({
                                ...prev,
                                listingAgencyName: match.name,
                                listingAgencyAddress: match.address || prev.listingAgencyAddress,
                                listingAgencyPhone: match.phone || prev.listingAgencyPhone,
                                listingAgencyLicense: match.license || prev.listingAgencyLicense,
                              }))
                              alert(`Found record for "${match.name}"! Auto-filled agency address, phone, and license.`)
                            } else {
                              saveCustomAgencyToCache({
                                name,
                                address: outlineFields.listingAgencyAddress,
                                phone: outlineFields.listingAgencyPhone,
                                license: outlineFields.listingAgencyLicense,
                              })
                              alert(`Agency details cached for future auto-fill lookups!`)
                            }
                          }}
                          className="text-[10px] font-bold text-amber-600 hover:text-amber-800 flex items-center gap-1"
                        >
                          <Search className="h-3 w-3" /> Auto-Lookup Agency
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Listing Agency Name</label>
                          <input value={outlineFields.listingAgencyName || ''} onChange={e => updateField('listingAgencyName', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Agency Address</label>
                          <input value={outlineFields.listingAgencyAddress || ''} onChange={e => updateField('listingAgencyAddress', e.target.value)} placeholder="Full street, city, state, zip" className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Agency Phone</label>
                          <input value={outlineFields.listingAgencyPhone || ''} onChange={e => updateField('listingAgencyPhone', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Agency License No</label>
                          <input value={outlineFields.listingAgencyLicense || ''} onChange={e => updateField('listingAgencyLicense', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: Financials & Loan */}
              {activeOutlineTab === 'financials' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Selling Price ($)</label>
                      <input type="number" value={outlineFields.sellingPrice || ''} onChange={e => updateField('sellingPrice', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Contract Deposit ($)</label>
                      <input type="number" value={outlineFields.depositAmount || ''} onChange={e => updateField('depositAmount', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Mortgage Amount ($)</label>
                      <input type="number" value={outlineFields.mortgageAmount || ''} onChange={e => updateField('mortgageAmount', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Cash at Closing ($)</label>
                      <input type="number" value={outlineFields.cashAtClosing || ''} onChange={e => updateField('cashAtClosing', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 space-y-3">
                    <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Lending & Finance Info</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Loan Officer Name</label>
                        <input value={outlineFields.loanOfficerName || ''} onChange={e => updateField('loanOfficerName', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Loan Officer Phone</label>
                        <input value={outlineFields.loanOfficerPhone || ''} onChange={e => updateField('loanOfficerPhone', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">Loan Officer Email</label>
                        <input type="email" value={outlineFields.loanOfficerEmail || ''} onChange={e => updateField('loanOfficerEmail', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-gray-500 mb-0.5 block">1031 Exchange / Institute</label>
                        <input value={outlineFields.financeInstitute || ''} onChange={e => updateField('financeInstitute', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-blue-500 focus:outline-none" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: Notes & Prep */}
              {activeOutlineTab === 'notes' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Prepared By (Name)</label>
                      <input value={outlineFields.preparedBy || ''} onChange={e => updateField('preparedBy', e.target.value)} placeholder="Broker Name" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-500 mb-1 block">Date</label>
                      <input type="date" value={outlineFields.date || ''} onChange={e => updateField('date', e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 mb-1 block">Additional Notes</label>
                    <textarea rows={4} value={outlineFields.notes || ''} onChange={e => updateField('notes', e.target.value)} placeholder="Enter any extra deal outlines or notes here..." className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 flex-shrink-0">
                <button type="button" onClick={() => setIsOutlineEditOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">Cancel</button>
                <button type="submit" className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white">Save Outline</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Printable Deal Outline Sheet (Hidden on Screen, Visible on Print) ── */}
      <div id="printable-deal-sheet" className="hidden print:block bg-white p-8 font-serif text-black leading-relaxed max-w-[800px] mx-auto">
        {/* Printable Header */}
        <div className="flex items-center justify-between border-b border-gray-300 pb-4 mb-6">
          <div className="flex items-center gap-3">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="Company Logo" className="h-16 w-auto object-contain" />
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

      {/* CREATE OFFER MODAL */}
      {showCreateOfferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto no-print">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-auto overflow-hidden font-sans border border-gray-200" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                  <Tag className="h-5 w-5 text-blue-600" /> Create Official Offer Document
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Auto-filled from deal metadata. Review and customize details.</p>
              </div>
              <button onClick={() => setShowCreateOfferModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const newOff = { ...offerForm, id: `offer_${Date.now()}` }
                setOffers(prev => [newOff, ...prev])
                setSelectedOffer(newOff)
                setShowCreateOfferModal(false)
                setShowPrintOfferModal(true)
                autoFillTimelineDates(data?.transaction, data?.listing, newOff)
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
                    <label className="font-bold text-gray-700 block mb-1">Offer Date</label>
                    <input
                      type="date"
                      value={offerForm.offerDate}
                      onChange={(e) => setOfferForm((f: any) => ({ ...f, offerDate: e.target.value }))}
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

                <div className="p-4 bg-gray-50 border-t border-gray-100 text-right flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateOfferModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md"
                  >
                    Generate Letterhead Document 🖨️
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* PRINTABLE OFFER LETTERHEAD MODAL */}
        {showPrintOfferModal && selectedOffer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto no-print" onClick={() => setShowPrintOfferModal(false)}>
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl my-auto overflow-hidden font-sans border border-gray-200" onClick={(e) => e.stopPropagation()}>
              <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 no-print">
                <span className="text-xs font-bold text-gray-700">
                  Official Document Preview: {selectedOffer.offerType === 'sales_agreement' ? 'Sales Agreement' : 'Letter of Intent / Purchase Offer'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const prevTitle = document.title
                      const fileLabel = selectedOffer.offerType === 'sales_agreement' ? 'Sales_Agreement' : 'Letter_of_Intent'
                      document.title = `${fileLabel}_${selectedOffer.purchaserName || 'Purchaser'}_${data?.transaction?.name || 'Deal'}.pdf`
                      window.print()
                      setTimeout(() => { document.title = prevTitle }, 1000)
                    }}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-sm flex items-center gap-1.5"
                  >
                    <Printer className="h-4 w-4" /> Print / Save PDF
                  </button>
                  <button onClick={() => setShowPrintOfferModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="p-8 max-h-[80vh] overflow-y-auto">
                {selectedOffer.offerType === 'sales_agreement' ? (
                  /* SALES AGREEMENT DOCUMENT VIEW */
                  <div id="printable-sales-agreement" className="p-6 bg-white text-gray-900 font-serif leading-relaxed text-xs space-y-4">
                    <div className="flex justify-between items-start border-b border-gray-300 pb-4 mb-4">
                      <div className="flex items-center gap-3">
                        <p className="font-extrabold text-sm text-gray-900 tracking-wider">PRIME AMERICA REAL ESTATE, INC.</p>
                      </div>
                      <div className="text-right text-[11px] text-gray-600 font-sans">
                        <p className="font-bold text-gray-800">6123 Fresh Pond Road Queens, NY 11379</p>
                        <p>info@PrimeAmericaNY.com | 347-725-3142</p>
                      </div>
                    </div>

                    <h2 className="text-center font-bold text-lg tracking-widest uppercase mb-4 font-sans text-gray-900">SALES AGREEMENT</h2>
                    <p><strong>Date:</strong> <u>{selectedOffer.offerDate}</u></p>
                    <div className="grid grid-cols-2 gap-4">
                      <p><strong>Purchaser:</strong> <u>{selectedOffer.purchaserName}</u></p>
                      <p><strong>Seller:</strong> <u>{selectedOffer.sellerName}</u></p>
                    </div>

                    <div className="pt-4 grid grid-cols-2 gap-x-8 gap-y-4 text-[11px] font-sans border-t border-gray-300 mt-6">
                       <div>
                         <p className="border-b border-gray-400 pb-1"><strong>BUYER'S SIGN:</strong> <u>{selectedOffer.purchaserName}</u></p>
                         <p className="mt-2"><strong>BUYER ATTORNEY:</strong> {selectedOffer.buyerAttorneyName || 'N/A'}</p>
                         <p><strong>FIRM:</strong> {selectedOffer.buyerAttorneyFirm || 'Law Firm'}</p>
                         <p><strong>TEL:</strong> {selectedOffer.buyerAttorneyPhone || 'N/A'} <strong>EMAIL:</strong> {selectedOffer.buyerAttorneyEmail || 'N/A'}</p>
                       </div>
                       <div>
                         <p className="border-b border-gray-400 pb-1"><strong>SELLER'S SIGN:</strong> <u>{selectedOffer.sellerName}</u></p>
                         <p className="mt-2"><strong>SELLER ATTORNEY:</strong> {selectedOffer.sellerAttorneyName || 'To Be Nominated'}</p>
                         <p><strong>FIRM:</strong> {selectedOffer.sellerAttorneyFirm || 'Law Firm'}</p>
                         <p><strong>TEL:</strong> {selectedOffer.sellerAttorneyPhone || 'N/A'} <strong>EMAIL:</strong> {selectedOffer.sellerAttorneyEmail || 'N/A'}</p>
                       </div>
                    </div>
                  </div>
                ) : (
                  /* LETTER OF INTENT DOCUMENT VIEW */
                  <div id="printable-loi-agreement" className="p-6 bg-white text-gray-900 font-sans leading-relaxed text-xs space-y-4">
                    <div className="flex flex-col items-center justify-center mb-6">
                      <p className="font-extrabold text-base text-gray-900 tracking-wider">PRIME AMERICA REAL ESTATE, INC.</p>
                      <h2 className="text-center font-bold text-base tracking-wider uppercase mt-3 text-gray-900">LETTER OF INTENT TO PURCHASE PROPERTY</h2>
                    </div>

                    <p><strong>Dear {selectedOffer.sellerName || 'Seller'},</strong></p>
                    <p>I am writing to formally present my offer to purchase your property located at<br />
                    <strong>{selectedOffer.propertyAddress}</strong>. After thorough evaluation, I am pleased to propose the following terms:</p>

                    <ul className="space-y-1.5 pl-6 font-semibold">
                      <li>• <strong>Purchase Price:</strong> ${Number(selectedOffer.purchasePrice).toLocaleString()}</li>
                      <li>• <strong>Down Payment:</strong> ${Number(selectedOffer.downPaymentAmount).toLocaleString()} ({selectedOffer.downPaymentPercent || 50}%)</li>
                      <li>• <strong>Mortgage Amount:</strong> ${Number(selectedOffer.mortgageAmount).toLocaleString()}</li>
                      <li>• <strong>Closing Date:</strong> {selectedOffer.closingDate}</li>
                    </ul>

                    {/* Buyer Legal Counsel */}
                    {selectedOffer.buyerAttorneyName && (
                      <div className="space-y-1 pt-2 border-t border-gray-200">
                        <p>
                          For purchaser legal representation, please send the contract of sale to Purchaser's Counsel:{' '}
                          <strong>{selectedOffer.buyerAttorneyName}</strong>
                          {selectedOffer.buyerAttorneyFirm && selectedOffer.buyerAttorneyFirm !== selectedOffer.buyerAttorneyName ? (
                            <> at <strong>{selectedOffer.buyerAttorneyFirm}</strong></>
                          ) : null}
                        </p>
                        <ul className="pl-6 space-y-0.5 text-[11px]">
                          {selectedOffer.buyerAttorneyPhone && (
                            <li>• <strong>Phone:</strong> {selectedOffer.buyerAttorneyPhone}</li>
                          )}
                          {selectedOffer.buyerAttorneyEmail && (
                            <li>• <strong>Email:</strong> {selectedOffer.buyerAttorneyEmail}</li>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Seller Legal Counsel */}
                    {selectedOffer.sellerAttorneyName && (
                      <div className="space-y-1 pt-2 border-t border-gray-200">
                        <p>
                          <strong>Seller's Legal Counsel:</strong>{' '}
                          <strong>{selectedOffer.sellerAttorneyName}</strong>
                          {selectedOffer.sellerAttorneyFirm && selectedOffer.sellerAttorneyFirm !== selectedOffer.sellerAttorneyName ? (
                            <> ({selectedOffer.sellerAttorneyFirm})</>
                          ) : null}
                        </p>
                        <ul className="pl-6 space-y-0.5 text-[11px]">
                          {selectedOffer.sellerAttorneyPhone && (
                            <li>• <strong>Phone:</strong> {selectedOffer.sellerAttorneyPhone}</li>
                          )}
                          {selectedOffer.sellerAttorneyEmail && (
                            <li>• <strong>Email:</strong> {selectedOffer.sellerAttorneyEmail}</li>
                          )}
                        </ul>
                      </div>
                    )}

                    <p className="pt-2">Sincerely,</p>
                    <div className="pt-8 grid grid-cols-2 gap-8 text-xs font-bold border-t border-gray-300 mt-6">
                      <div>
                        <p className="border-b border-gray-400 pb-1">{selectedOffer.purchaserName || 'Purchaser'}</p>
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
          </div>
        )}

        {/* Stage Gate Compliance Modal */}
        {stageGateTarget && (
          <StageGateModal
            isOpen={!!stageGateTarget}
            targetStage={stageGateTarget}
            transactionName={tx.name}
            initialValues={{
              escrowDate,
              inspectionDeadline,
              appraisalDate,
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
