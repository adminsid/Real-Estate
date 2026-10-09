import { ShowingSchedulerModal } from '@/components/marketing/ShowingSchedulerModal'
import { ListingInquiriesPanel } from '@/components/marketing/ListingInquiriesPanel'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { SkeletonBlock, SkeletonCard } from '@/components/common/SkeletonLoader'
import { useAuth } from '@/context/AuthContext'
import { resolveMediaUrl } from '@/utils/media'
import { createPrintExcerpt, selectListingPrintLayout } from '@/lib/listingPrintLayout'
import { getListingPresentation } from '@/domain/listingPresentation'
import clsx from 'clsx'
import {
  ArrowLeft, Loader2, MapPin, Maximize2,
  Printer, Send, Phone, Mail, Plus, Calendar, Clock, Video, ExternalLink,
  Calculator, BadgeInfo, Building2, Edit3,
  ChevronLeft, ChevronRight, X, Compass, Smartphone, Grid,
  QrCode, Share2, Copy, Check, MessageSquare
} from 'lucide-react'

function firstNonEmpty(...values: Array<string | number | null | undefined>) {
  return values.find((v) => v !== undefined && v !== null && String(v).trim() !== '') ?? null
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function escapePrintHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getListingAgentInfo(listing: any, agent: any, fallbackCompanyName: string) {
  const name = firstNonEmpty(
    listing?.listing_agent_name,
    listing?.listingAgentName,
    listing?.listAgentName,
    listing?.raw?.listingAgentName,
    listing?.raw?.data?.listingAgentName,
    listing?.raw?.data?.listAgentName,
    agent?.name,
  )
  const email = firstNonEmpty(
    listing?.listing_agent_email,
    listing?.listingAgentEmail,
    listing?.listAgentEmail,
    listing?.raw?.listingAgentEmail,
    listing?.raw?.data?.listingAgentEmail,
    listing?.raw?.data?.listAgentEmail,
    agent?.email,
  )
  const phone = firstNonEmpty(
    listing?.listing_agent_phone,
    listing?.listingAgentPhone,
    listing?.listAgentPhone,
    listing?.raw?.listingAgentPhone,
    listing?.raw?.data?.listingAgentPhone,
    listing?.raw?.data?.listAgentPhone,
    agent?.phone,
  )
  const brokerage = firstNonEmpty(
    listing?.listing_agent_brokerage,
    listing?.listingAgentBrokerage,
    listing?.raw?.listingAgentBrokerage,
    listing?.raw?.data?.listOfficeName,
    fallbackCompanyName,
  )

  return {
    name: name ? String(name) : '',
    email: email ? String(email) : '',
    phone: phone ? String(phone) : '',
    brokerage: brokerage ? String(brokerage) : '',
  }
}

function isMyListing(listing: any, user: any) {
  if (!user || !listing) return false
  const userEmail = (user.email || '').toLowerCase()
  const userName = (user.name || '').toLowerCase()
  const userId = String(user.id || '')

  const agentInfo = getListingAgentInfo(listing, null, '')
  const listEmail = (agentInfo.email || listing.listingAgentEmail || listing.listing_agent_email || listing.agent_email || listing.data?.listAgentEmail || '').toLowerCase()
  const listName = (agentInfo.name || listing.listingAgentName || listing.listing_agent_name || listing.agent_name || listing.data?.listAgentFullName || '').toLowerCase()
  const coListEmail = (listing.data?.coListAgentEmail || '').toLowerCase()
  const coListName = (listing.data?.coListAgentFullName || '').toLowerCase()
  const assignedId = String(listing.assigned_to || listing.userId || listing.user_id || listing.createdBy || listing.created_by || '')

  return (
    (Boolean(userEmail) && (listEmail.includes(userEmail) || coListEmail.includes(userEmail))) ||
    (Boolean(userName) && (listName.includes(userName) || coListName.includes(userName))) ||
    (Boolean(userId) && assignedId === userId)
  )
}

function getListingSourceCoords(listing: any) {
  const latRaw = firstNonEmpty(
    listing?.latitude,
    listing?.lat,
    listing?.raw?.latitude,
    listing?.raw?.lat,
    listing?.raw?.data?.latitude,
    listing?.raw?.data?.lat,
  )
  const lngRaw = firstNonEmpty(
    listing?.longitude,
    listing?.lng,
    listing?.raw?.longitude,
    listing?.raw?.lng,
    listing?.raw?.data?.longitude,
    listing?.raw?.data?.lng,
  )
  const lat = latRaw !== null ? Number(latRaw) : NaN
  const lng = lngRaw !== null ? Number(lngRaw) : NaN
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng }
  }
  return null
}

function getPresentedByInfo(agent: any, listingAgent: { name: string; email: string; phone: string; brokerage: string }, companyName: string, isSharedLeadView: boolean) {
  if (!isSharedLeadView) return listingAgent
  return {
    name: String(firstNonEmpty(agent?.name, listingAgent.name, '') || ''),
    email: String(firstNonEmpty(agent?.email, listingAgent.email, '') || ''),
    phone: String(firstNonEmpty(agent?.phone, listingAgent.phone, '') || ''),
    brokerage: String(firstNonEmpty(agent?.companyName, listingAgent.brokerage, companyName) || ''),
  }
}

function getComplianceDisclaimer(identity: { companyName: string; address: string; telephone: string; fax?: string }) {
  const parts = [
    `Listing courtesy of ${identity.companyName}.`,
    `Main Office: ${identity.address}.`,
    `Phone: ${identity.telephone}.`,
  ]
  if (identity.fax) {
    parts.push(`Fax: ${identity.fax}.`)
  }
  parts.push('Licensed Real Estate Broker.')
  parts.push('All broker advertisements are regulated under Article 12-A of NY State Real Property Law.')
  return parts.join(' ')
}

export function ListingDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, branding } = useAuth()
  const [searchParams] = useSearchParams()
  const sharedById = searchParams.get('sharedBy')
  const inviteToken = searchParams.get('inviteToken')
  const isPreview = searchParams.get('preview') === 'true'

  const [listing, setListing] = useState<any>(null)
  const [agent, setAgent] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmittingLead, setIsSubmittingLead] = useState(false)
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null)
  const [openHouses, setOpenHouses] = useState<any[]>([])

  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [mobileViewMode, setMobileViewMode] = useState<'story' | 'feed'>('story')
  const [activeStorySlide, setActiveStorySlide] = useState(0)
  const [allListings, setAllListings] = useState<any[]>([])
  const [isStoryPaused, setIsStoryPaused] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [forceDesktopLayout, setForceDesktopLayout] = useState(false)

  const [showShowingHistory, setShowShowingHistory] = useState(false)
  const [showShowingModal, setShowShowingModal] = useState(false)
  const [downpaymentType, setDownpaymentType] = useState<'percent' | 'dollar'>('percent')
  const [downpaymentValue, setDownpaymentValue] = useState(20)
  const [interestRate, setInterestRate] = useState(6.75)
  const [propertyTaxes, setPropertyTaxes] = useState(0)
  const [commonCharges, setCommonCharges] = useState(0)
  const [loanType, setLoanType] = useState<'conventional' | 'fha' | 'va' | 'usda'>('conventional')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareTab, setShareTab] = useState<'quick' | 'email' | 'qr'>('quick')
  const [shareCopied, setShareCopied] = useState(false)
  const [htmlEmailCopied, setHtmlEmailCopied] = useState(false)
  const [showingVirtualTour, setShowingVirtualTour] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)

  const [mapSettings, setMapSettings] = useState<{ lat: number | null, lng: number | null, categories: string[] | null } | null>(null)

  const lightboxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Auto-progress stories on mobile
  useEffect(() => {
    if (mobileViewMode !== 'story' || isStoryPaused) return
    const timer = setTimeout(() => {
      setActiveStorySlide((prev) => (prev < 5 ? prev + 1 : 0))
    }, 5000)
    return () => clearTimeout(timer)
  }, [mobileViewMode, activeStorySlide, isStoryPaused])

  // Auto-sync taxes and HOA from listing raw data with bounds checking
  useEffect(() => {
    if (!listing) return
    const r = listing?.raw?.data || listing?.raw || {}
    // Sync annual property taxes → store as annual, bounded safely
    const taxAnnualRaw = Number(firstNonEmpty(r.TaxAnnualAmount, r.taxAnnualAmount, listing.monthly_taxes ? (listing.monthly_taxes * 12) : 0))
    if (Number.isFinite(taxAnnualRaw) && taxAnnualRaw > 0 && taxAnnualRaw < 200000) {
      setPropertyTaxes(taxAnnualRaw)
    } else {
      setPropertyTaxes(0)
    }
    // Sync HOA/common charges (AssociationFee is already monthly), bounded safely
    const hoaMonthlyRaw = Number(firstNonEmpty(r.AssociationFee, r.hoaFee, r.associationFee, listing.common_charges, 0))
    if (Number.isFinite(hoaMonthlyRaw) && hoaMonthlyRaw > 0 && hoaMonthlyRaw < 10000) {
      setCommonCharges(hoaMonthlyRaw)
    }
  }, [listing])

  // Clean primary street display (strips raw Google Places suffix duplicates like ", Fresh Pond, NY, USA")
  const displayStreet = useMemo(() => {
    if (!listing?.address) return ''
    let street = listing.address.trim()
    street = street.replace(/,\s*(?:USA|United States)$/i, '')
    if (listing.city && street.toLowerCase().includes(listing.city.toLowerCase())) {
      const parts = street.split(',').map((s: string) => s.trim())
      if (parts.length > 1 && parts[0]) {
        return parts[0]
      }
    }
    if (listing.state && street.toLowerCase().includes(listing.state.toLowerCase())) {
      const parts = street.split(',').map((s: string) => s.trim())
      if (parts.length > 1 && parts[0]) {
        return parts[0]
      }
    }
    return street
  }, [listing?.address, listing?.city, listing?.state])

  // Dynamic address & location display from inventory metadata
  const displayLocation = useMemo(() => {
    if (!listing) return ''
    const r = listing?.raw?.data || listing?.raw || {}
    const neighborhood = firstNonEmpty(
      listing.neighborhood,
      r.Neighborhood,
      r.neighborhood,
      r.SubdivisionName,
      r.subdivisionName,
      listing.subdivision,
      listing.county,
      r.CountyOrParish,
    )
    const city = listing.city || r.City || ''
    const state = listing.state || r.StateOrProvince || ''
    const zip = listing.zip || r.PostalCode || ''

    const parts = []
    if (neighborhood && String(neighborhood).trim()) parts.push(String(neighborhood).trim())
    if (city && String(city).trim() && String(city).trim().toLowerCase() !== String(neighborhood).trim().toLowerCase()) {
      parts.push(String(city).trim())
    }
    if (state || zip) parts.push(`${state} ${zip}`.trim())
    return parts.join(', ') || `${city}, ${state} ${zip}`.trim()
  }, [listing])

  // Dynamic school information from inventory metadata
  const listingSchools = useMemo(() => {
    if (!listing) return []
    const r = listing?.raw?.data || listing?.raw || {}
    const schools = [
      { type: 'School District', name: firstNonEmpty(listing.schoolDistrict, r.SchoolDistrict, r.schoolDistrict, r.highSchoolDistrict) },
      { type: 'Public Elementary', name: firstNonEmpty(listing.elementarySchool, r.ElementarySchool, r.elementarySchool, listing.elementary_school) },
      { type: 'Public Middle', name: firstNonEmpty(listing.middleOrJuniorSchool, r.MiddleOrJuniorSchool, r.middleOrJuniorSchool, listing.middle_school) },
      { type: 'Public High', name: firstNonEmpty(listing.highSchool, r.HighSchool, r.highSchool, listing.high_school) },
    ]
    return schools.filter((school) => school.name).map((school) => ({ ...school, name: String(school.name) }))
  }, [listing])

  const listingAreas = useMemo(() => {
    if (!listing) return []
    const r = listing?.raw?.data || listing?.raw || {}
    const candidates = [
      { label: 'Neighborhood', value: firstNonEmpty(listing.neighborhood, r.neighborhood, r.SubdivisionName) },
      { label: 'MLS Area', value: firstNonEmpty(listing.mlsAreaMajor, r.mlsAreaMajor, r.MLSAreaMajor) },
      { label: 'MLS Subarea', value: firstNonEmpty(listing.mlsAreaMinor, r.mlsAreaMinor, r.MLSAreaMinor) },
      { label: 'County', value: firstNonEmpty(listing.county, r.county, r.CountyOrParish) },
    ]
    const seen = new Set<string>()
    return candidates.flatMap((area) => {
      const value = String(area.value || '').trim()
      const key = value.toLowerCase()
      if (!value || seen.has(key)) return []
      seen.add(key)
      return [{ ...area, value }]
    })
  }, [listing])
  const presentation = useMemo(() => getListingPresentation(listing), [listing])

  // Load other listings (active only for Browse Feed)
  useEffect(() => {
    async function fetchOtherListings() {
      try {
        const res = await fetch('/api/public/listings')
        const json = await res.json()
        if (json.success && Array.isArray(json.data)) {
          setAllListings(json.data.filter((l: any) =>
            String(l.id) !== String(id) &&
            String(l.status || 'active').toLowerCase() === 'active'
          ))
        }
      } catch (e) {
        console.error('Failed to load other listings', e)
      }
    }
    if (listing) {
      fetchOtherListings()
    }
  }, [listing, id])

  // SEO & Social Sharing Optimization
  useEffect(() => {
    if (listing) {
      const currentCompanyName = agent?.companyName || branding.companyName || 'Prime America Real Estate'
      document.title = `${listing.address} | ${currentCompanyName}`

      let metaDesc = document.querySelector('meta[name="description"]')
      if (!metaDesc) {
        metaDesc = document.createElement('meta')
        metaDesc.setAttribute('name', 'description')
        document.head.appendChild(metaDesc)
      }
      const primarySummary = presentation.primaryFacts.slice(0, 4).map((item) => `${item.label}: ${item.value}`).join(', ')
      const descVal = `${presentation.label} at ${listing.address}${primarySummary ? ` — ${primarySummary}` : ''}. Learn more at ${currentCompanyName}.`
      metaDesc.setAttribute('content', descVal)

      const localMedia = listing?.media && Array.isArray(listing.media) && listing.media.length > 0
        ? listing.media
        : (listing?.heroMediaUrl ? [{ id: 'hero', mediaUrl: listing.heroMediaUrl }] : [])
      const firstMedia = localMedia[0]?.mediaUrl || ''
      const ogImg = firstMedia.startsWith('http') ? firstMedia : `https://inventory.primeamericarealestate.com${firstMedia}`

      const ogTitle = `${listing.address} - Exclusive Listing`
      const ogDesc = listing.description?.substring(0, 150) || ''

      const metaConfigs = [
        { property: 'og:title', content: ogTitle },
        { property: 'og:description', content: ogDesc },
        { property: 'og:image', content: ogImg },
        { property: 'og:url', content: window.location.href },
        { name: 'twitter:card', content: 'summary_large_image' },
      ]

      metaConfigs.forEach(cfg => {
        const selector = cfg.property
          ? `meta[property="${cfg.property}"]`
          : `meta[name="${cfg.name}"]`
        let el = document.querySelector(selector)
        if (!el) {
          el = document.createElement('meta')
          if (cfg.property) el.setAttribute('property', cfg.property)
          if (cfg.name) el.setAttribute('name', cfg.name)
          document.head.appendChild(el)
        }
        el.setAttribute('content', cfg.content)
      })
    }
  }, [listing, branding.companyName, agent, presentation])

  // Inquiry Form
  const [leadName, setLeadName] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
  const [leadPhone, setLeadPhone] = useState('')
  const [leadMessage, setLeadMessage] = useState('I am interested in learning more about this property.')
  const [showInquiryModal, setShowInquiryModal] = useState(false)
  const [inquirySuccess, setInquirySuccess] = useState(false)
  const [inquiryId, setInquiryId] = useState(() => crypto.randomUUID())
  const [selectedListObj, setSelectedListObj] = useState<any>(null)

  const openInquiry = (l: any) => {
    setSelectedListObj(l)
    setInquirySuccess(false)
    const inquiryPresentation = getListingPresentation(l)
    setLeadMessage(`${inquiryPresentation.inquiryPrompt} ${l?.address ? `Listing: ${l.address}.` : ''}`.trim())
    setShowInquiryModal(true)
  }
  const downPercent = useMemo(() => {
    if (!listing?.price) return 20
    return downpaymentType === 'percent'
      ? downpaymentValue
      : Math.round((downpaymentValue / listing.price) * 100)
  }, [listing?.price, downpaymentType, downpaymentValue])

  const estimatedMonthlyPayment = useMemo(() => {
    if (!listing?.price) return null
    const downPayment = downpaymentType === 'percent'
      ? listing.price * (downpaymentValue / 100)
      : downpaymentValue
    const loanAmount = Math.max(listing.price - downPayment, 0)
    const annualRate = interestRate / 100
    const monthlyRate = annualRate / 12
    const months = 30 * 12
    const monthlyTax = Math.round(propertyTaxes / 12)
    const monthlyHoa = Math.round(commonCharges)
    if (loanAmount <= 0) {
      return { payment: 0, taxes: monthlyTax, hoa: monthlyHoa, pmi: 0, total: monthlyTax + monthlyHoa }
    }
    const factor = Math.pow(1 + monthlyRate, months)
    const payment = Math.round(loanAmount * (monthlyRate * factor) / (factor - 1))
    // PMI: ~0.8%/yr on loan if conventional and < 20% down (not for VA/USDA)
    const hasPmi = loanType === 'conventional' && downPercent < 20
    const pmi = hasPmi ? Math.round((loanAmount * 0.008) / 12) : 0
    const total = payment + monthlyTax + monthlyHoa + pmi
    return { payment, taxes: monthlyTax, hoa: monthlyHoa, pmi, total: Math.round(total) }
  }, [listing?.price, downpaymentType, downpaymentValue, interestRate, propertyTaxes, commonCharges, loanType, downPercent])

  const mediaList = useMemo(() => {
    if (listing?.media && Array.isArray(listing.media) && listing.media.length > 0) {
      return listing.media
    }
    if (listing?.heroMediaUrl) {
      return [{ id: 'hero', mediaUrl: listing.heroMediaUrl }]
    }
    return []
  }, [listing])

  const activeIndex = useMemo(() => {
    if (!activeMediaUrl || mediaList.length === 0) return 0
    const idx = mediaList.findIndex((m: any) => m.mediaUrl === activeMediaUrl)
    return idx === -1 ? 0 : idx
  }, [activeMediaUrl, mediaList])

  const companyLogoUrl = agent?.companyLogoPublicUrl || agent?.companyLogoUrl || branding.logoUrl || '/prime-america-seal.png'
  const companyName = agent?.companyName || branding.companyName || 'Prime America Real Estate'
  const listingAgent = useMemo(() => getListingAgentInfo(listing, agent, companyName), [listing, agent, companyName])
  const isSharedLeadView = !!sharedById
  const presentedBy = useMemo(() => getPresentedByInfo(agent, listingAgent, companyName, isSharedLeadView), [agent, listingAgent, companyName, isSharedLeadView])
  const addressSlug = listing ? slugify(`${listing.address || ''} ${listing.city || ''} ${listing.state || ''}`) : ''

  const sourceCoords = useMemo(() => getListingSourceCoords(listing), [listing])
  const fallbackCoords = useMemo(() => getDeterministicCoords(listing?.address || '', listing?.city || '', listing?.zip || ''), [listing?.address, listing?.city, listing?.zip])
  const effectiveMapCoords = useMemo(() => ({
    lat: mapSettings?.lat ?? sourceCoords?.lat ?? fallbackCoords.lat,
    lng: mapSettings?.lng ?? sourceCoords?.lng ?? fallbackCoords.lng,
  }), [mapSettings?.lat, mapSettings?.lng, sourceCoords?.lat, sourceCoords?.lng, fallbackCoords.lat, fallbackCoords.lng])

  const leadDomainOrigin = useMemo(() => {
    if (branding.leadAppDomain && branding.leadAppDomain.trim() !== '') {
      let domain = branding.leadAppDomain.trim()
      if (!/^https?:\/\//i.test(domain)) {
        domain = 'https://' + domain
      }
      return domain
    }
    return window.location.origin
  }, [branding.leadAppDomain])

  const shareUrl = listing ? `${leadDomainOrigin}/public/listings/${listing.id}/${addressSlug}?${new URLSearchParams({
    ...(listing.inviteOnlyToken ? { inviteToken: listing.inviteOnlyToken } : {}),
    ...((sharedById || user?.id) ? { sharedBy: sharedById || user!.id } : {}),
  }).toString()}` : ''
  const previewUrl = listing ? `${leadDomainOrigin}/public/listings/${listing.id}/${addressSlug}?${new URLSearchParams({
    preview: 'true',
    ...(listing.inviteOnlyToken ? { inviteToken: listing.inviteOnlyToken } : {}),
  }).toString()}` : ''
  const upcomingOpenHouses = useMemo(() => {
    return openHouses.filter((oh) => {
      try {
        const endTime = oh.end_time || oh.endTime || oh.start_time || oh.startTime
        if (!endTime) return true
        return new Date(endTime) >= new Date()
      } catch (e) {
        return true
      }
    })
  }, [openHouses])

  const listingAgentInfo = useMemo(() => getListingAgentInfo(listing, agent, companyName), [listing, agent, companyName])
  const getEmbedTourUrl = () => {
    if (!listing) return null
    const r = listing?.raw?.data || listing?.raw || {}

    // 1. Check raw RESO/MLS standard virtual tour fields first
    const rawTourUrl = (
      r.VirtualTourURLUnbranded ||
      r.virtualTourURLUnbranded ||
      r.VirtualTourURL ||
      r.virtualTourURL ||
      r.virtual_tour_url ||
      r.VideoURL ||
      r.videoUrl ||
      r.video_url ||
      r.TourURL ||
      r.tourURL ||
      r.tour_url ||
      ''
    )
    if (rawTourUrl && typeof rawTourUrl === 'string' && rawTourUrl.startsWith('http')) {
      const url = rawTourUrl.trim()
      if (url.includes('youtube.com/watch') || url.includes('youtube.com/v/')) {
        try { const urlObj = new URL(url); const v = urlObj.searchParams.get('v'); if (v) return `https://www.youtube.com/embed/${v}` } catch { /* Ignore malformed tour URLs and continue fallback handling. */ }
      }
      if (url.includes('youtu.be/')) {
        try { const parts = url.split('youtu.be/'); const id = parts[parts.length - 1].split('?')[0]; return `https://www.youtube.com/embed/${id}` } catch { /* Ignore malformed tour URLs and continue fallback handling. */ }
      }
      if (url.includes('vimeo.com/')) {
        try { const parts = url.split('vimeo.com/'); const id = parts[parts.length - 1].split('?')[0]; return `https://player.vimeo.com/video/${id}` } catch { /* Ignore malformed tour URLs and continue fallback handling. */ }
      }
      if (url.includes('matterport.com/show/') && !url.includes('?m=')) {
        return url.replace('/show/', '/show/?m=')
      }
      return url
    }

    // 2. Fall back to parsing URLs from the description text
    if (!listing.description) return null
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const matches = listing.description.match(urlRegex)
    if (!matches) return null

    const tourKeywords = ['youtube', 'youtu.be', 'vimeo', 'matterport', 'kuula', '3d', 'tour', 'video', 'vtour', 'walkthrough']
    const tourUrl = matches.find((url: string) => tourKeywords.some(keyword => url.toLowerCase().includes(keyword)))
    if (!tourUrl) return null

    if (tourUrl.includes('youtube.com/watch') || tourUrl.includes('youtube.com/v/')) {
      try {
        const urlObj = new URL(tourUrl)
        const v = urlObj.searchParams.get('v')
        if (v) return `https://www.youtube.com/embed/${v}`
      } catch { /* Ignore malformed tour URLs and continue fallback handling. */ }
    }
    if (tourUrl.includes('youtu.be/')) {
      try {
        const parts = tourUrl.split('youtu.be/')
        const id = parts[parts.length - 1].split('?')[0]
        return `https://www.youtube.com/embed/${id}`
      } catch { /* Ignore malformed tour URLs and continue fallback handling. */ }
    }
    if (tourUrl.includes('vimeo.com/')) {
      try {
        const parts = tourUrl.split('vimeo.com/')
        const id = parts[parts.length - 1].split('?')[0]
        return `https://player.vimeo.com/video/${id}`
      } catch { /* Ignore malformed tour URLs and continue fallback handling. */ }
    }
    if (tourUrl.includes('matterport.com/show/') && !tourUrl.includes('?m=')) {
      return tourUrl.replace('/show/', '/show/?m=')
    }
    return tourUrl
  }

  const printFlyer = () => {
    if (!listing) return
    const agentName = presentedBy?.name || agent?.name || 'Listing Agent'
    const agentEmail = presentedBy?.email || agent?.email || ''
    const agentPhone = presentedBy?.phone || agent?.phone || ''
    const agentAvatar = agent?.avatarUrl || ''
    const brokerageName = presentedBy?.brokerage || companyName
    const logoUrl = companyLogoUrl ? (companyLogoUrl.startsWith('http') ? companyLogoUrl : `${window.location.origin}${companyLogoUrl}`) : `${window.location.origin}/prime-america-seal.png`
    const priceStr = presentation.primaryFacts.find((item) => item.id === 'price' || item.id === 'rent')?.value || 'Contact for Price'

    const mediaUrls = mediaList.slice(0, 6).map((m: any) => resolveMediaUrl(m.mediaUrl, listing.id)).filter(Boolean)

    const r = listing?.raw?.data || listing?.raw || {}
    const mlsVal = listing.mlsNumber || r.mlsNumber || r.listingId || 'Exclusive'
    const description = String(listing.description || 'No description available.').trim()
    const printLayout = selectListingPrintLayout(description, mediaUrls.length)
    const printExcerpt = createPrintExcerpt(description)
    const printSpecs = [
      ...presentation.primaryFacts,
      { id: 'mls', label: 'MLS #', value: String(mlsVal) },
    ].slice(0, 8)
    const printSpecsHtml = printSpecs.map(({ label, value }) => `
      <div class="spec-item">
        <div class="spec-label">${escapePrintHtml(label)}</div>
        <div class="spec-value">${escapePrintHtml(value)}</div>
      </div>`).join('')

    const flyerHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Flyer - ${displayStreet || listing.address}</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=Playfair+Display:wght@700&display=swap');
          @page {
            size: letter portrait;
            margin: 0.35in;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: 'Montserrat', sans-serif;
            margin: 0;
            padding: 0;
            color: #1a1a1a;
            background: #fff;
          }
          .print-page { padding: 20px; }
          .two-page .cover-page {
            min-height: 10.25in;
            display: flex;
            flex-direction: column;
          }
          .two-page .detail-page {
            display: block;
            break-before: page;
            page-break-before: always;
          }
          .one-page .detail-page, .two-page .one-page-details { display: none; }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0F2040;
            padding-bottom: 14px;
            margin-bottom: 16px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .logo-container {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .logo {
            max-height: 46px;
            max-width: 140px;
            object-fit: contain;
          }
          .company-name {
            font-size: 18px;
            font-weight: 800;
            color: #0F2040;
          }
          .tagline {
            font-size: 10px;
            color: #C9A84C;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-top: 2px;
          }
          .price-address {
            text-align: right;
          }
          .price {
            font-size: 26px;
            font-weight: 800;
            color: #C9A84C;
          }
          .address {
            font-size: 12px;
            color: #555;
            margin-top: 2px;
            font-weight: 600;
          }
          .hero-image-container {
            width: 100%;
            height: 320px;
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 12px;
            background: #f0f0f0;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .one-page .hero-image-container { height: 255px; }
          .hero-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
          }
          .gallery-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-bottom: 16px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .gallery-image {
            width: 100%;
            height: 95px;
            object-fit: cover;
            border-radius: 8px;
            background: #f0f0f0;
            display: block;
          }
          .two-page .gallery-grid { grid-template-columns: repeat(5, 1fr); }
          .two-page .gallery-image { height: 82px; }
          .cover-summary {
            margin: 14px 0 0;
            padding: 12px 14px;
            border-left: 3px solid #C9A84C;
            background: #fbfaf6;
            color: #4a4a4a;
            font-size: 10px;
            line-height: 1.5;
          }
          .cover-summary strong {
            display: block;
            color: #0F2040;
            font-size: 11px;
            margin-bottom: 3px;
          }
          .detail-title {
            border-bottom: 2px solid #0F2040;
            padding-bottom: 10px;
            margin-bottom: 18px;
          }
          .detail-title h1 {
            color: #0F2040;
            font-family: 'Playfair Display', serif;
            font-size: 22px;
            margin: 0 0 3px;
          }
          .detail-description {
            color: #3f4650;
            font-size: 11px;
            line-height: 1.65;
            white-space: pre-line;
            orphans: 3;
            widows: 3;
          }
          .detail-description.long { column-count: 2; column-gap: 28px; }
          .details-section {
            display: grid;
            grid-template-columns: 1.7fr 1.3fr;
            gap: 20px;
            margin-bottom: 16px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .description-container h2 {
            font-family: 'Playfair Display', serif;
            font-size: 18px;
            color: #0F2040;
            margin-top: 0;
            margin-bottom: 8px;
          }
          .description {
            font-size: 11px;
            line-height: 1.55;
            color: #4a4a4a;
          }
          .specs-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            background: #f8f9fa;
            padding: 12px;
            border-radius: 12px;
            border: 1px solid #eaeaea;
            height: fit-content;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .two-page .specs-grid { grid-template-columns: repeat(4, 1fr); }
          .two-page .agent-card { margin-top: auto; }
          .one-page-details {
            margin-top: 14px;
            columns: 2;
            column-gap: 20px;
          }
          .one-page-details h2 { column-span: all; }
          .spec-item {
            text-align: center;
            padding: 4px;
          }
          .spec-label {
            font-size: 8px;
            text-transform: uppercase;
            color: #888;
            font-weight: 700;
            letter-spacing: 0.5px;
          }
          .spec-value {
            font-size: 13px;
            font-weight: 800;
            color: #0F2040;
            margin-top: 1px;
          }
          .agent-card {
            border: 1px solid #eaeaea;
            border-radius: 14px;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 14px;
            background: #ffffff;
            margin-top: 12px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .agent-photo {
            width: 55px;
            height: 55px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid #C9A84C;
          }
          .agent-info h3 {
            margin: 0;
            font-size: 14px;
            color: #0F2040;
            font-weight: 700;
          }
          .agent-info p {
            margin: 2px 0 0 0;
            font-size: 11px;
            color: #666;
          }
          .agent-contact {
            margin-top: 4px !important;
            font-weight: 600;
            color: #0F2040 !important;
          }
          .footer-compliance {
            font-size: 8px;
            color: #999;
            text-align: center;
            margin-top: 14px;
            line-height: 1.35;
            border-top: 1px solid #eee;
            padding-top: 8px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          @media print {
            .no-print {
              display: none;
            }
          }
        </style>
      </head>
      <body class="${printLayout}">
        <section class="print-page cover-page">
          <div class="header">
            <div class="logo-container">
              ${logoUrl ? `<img class="logo" src="${escapePrintHtml(logoUrl)}" alt="">` : ''}
              <div>
                <div class="company-name">${escapePrintHtml(brokerageName)}</div>
                <div class="tagline">Exclusive Representation</div>
              </div>
            </div>
            <div class="price-address">
              <div class="price">${escapePrintHtml(priceStr)}</div>
              <div class="address">${escapePrintHtml(displayStreet || listing.address)}, ${escapePrintHtml(displayLocation)}</div>
            </div>
          </div>

          ${mediaUrls[0] ? `<div class="hero-image-container">
            <img class="hero-image" src="${escapePrintHtml(mediaUrls[0])}" alt="${escapePrintHtml(displayStreet || listing.address)}">
          </div>` : ''}

          ${mediaUrls.length > 1 ? `<div class="gallery-grid">
            ${mediaUrls.slice(1, printLayout === 'two-page' ? 6 : 4).map((url: string) => `<img class="gallery-image" src="${escapePrintHtml(url)}" alt="">`).join('')}
          </div>` : ''}

          <div class="specs-grid">${printSpecsHtml}</div>

          ${printLayout === 'two-page' ? `<div class="cover-summary">
            <strong>${escapePrintHtml(presentation.highlightTitle)}</strong>
            ${escapePrintHtml(printExcerpt)} <span>Full details on page 2.</span>
          </div>` : ''}

          <div class="one-page-details">
            <div class="description-container">
              <h2>About the Property</h2>
              <div class="description">${escapePrintHtml(description)}</div>
            </div>
          </div>

          <div class="agent-card">
            ${agentAvatar ? `<img class="agent-photo" src="${escapePrintHtml(agentAvatar)}" alt="">` : ''}
            <div class="agent-info">
              <h3>Presented By: ${escapePrintHtml(agentName)}</h3>
              <p>${escapePrintHtml(brokerageName)}</p>
              <p class="agent-contact">Phone: ${escapePrintHtml(agentPhone || 'Contact office')} ${agentEmail ? `| Email: ${escapePrintHtml(agentEmail)}` : ''}</p>
            </div>
          </div>

          <div class="footer-compliance">
            Listing courtesy of ${escapePrintHtml(brokerageName)}. Equal Housing Opportunity. All broker advertisements are regulated under Article 12-A of NY State Real Property Law.
          </div>
        </section>

        <section class="print-page detail-page">
          <div class="detail-title">
            <h1>About the Property</h1>
            <div class="address">${escapePrintHtml(displayStreet || listing.address)}, ${escapePrintHtml(displayLocation)} · ${escapePrintHtml(priceStr)}</div>
          </div>
          <div class="detail-description ${description.length > 1200 ? 'long' : ''}">${escapePrintHtml(description)}</div>
          <div class="agent-card">
            ${agentAvatar ? `<img class="agent-photo" src="${escapePrintHtml(agentAvatar)}" alt="">` : ''}
            <div class="agent-info">
              <h3>Presented By: ${escapePrintHtml(agentName)}</h3>
              <p>${escapePrintHtml(brokerageName)}</p>
              <p class="agent-contact">Phone: ${escapePrintHtml(agentPhone || 'Contact office')} ${agentEmail ? `| Email: ${escapePrintHtml(agentEmail)}` : ''}</p>
            </div>
          </div>
          <div class="footer-compliance">
            Listing courtesy of ${escapePrintHtml(brokerageName)}. Equal Housing Opportunity. All information is deemed reliable but should be independently verified.
          </div>
        </section>

        <script>
          window.onload = function() {
            var printed = false;
            var images = Array.from(document.images);
            var loaded = 0;
            var total = images.length;
            function doPrint() {
              if (printed) return;
              printed = true;
              setTimeout(function() {
                window.print();
              }, 250);
            }
            if (total === 0) { doPrint(); return; }
            function checkDone() {
              loaded++;
              if (loaded >= total) { doPrint(); }
            }
            images.forEach(function(img) {
              if (img.complete) {
                checkDone();
              } else {
                img.onload = checkDone;
                img.onerror = checkDone;
              }
            });
            setTimeout(doPrint, 2500);
          }
        </script>
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(flyerHtml)
      printWindow.document.close()
    }
  }

  const handleNextPhoto = (e?: any) => {
    if (e) e.stopPropagation()
    if (mediaList.length <= 1) return
    const nextIdx = (activeIndex + 1) % mediaList.length
    setActiveMediaUrl(mediaList[nextIdx].mediaUrl)
  }

  const handlePrevPhoto = (e?: any) => {
    if (e) e.stopPropagation()
    if (mediaList.length <= 1) return
    const prevIdx = (activeIndex - 1 + mediaList.length) % mediaList.length
    setActiveMediaUrl(mediaList[prevIdx].mediaUrl)
  }

  const handleSelectListing = (selectedListObj: any) => {
    const qs = sharedById ? `?sharedBy=${encodeURIComponent(sharedById)}` : ''
    navigate(`/inventory/listings/${selectedListObj.id}${qs}`)
  }

  useEffect(() => {
    if (isLightboxOpen && lightboxRef.current) {
      lightboxRef.current.focus()
    }
  }, [isLightboxOpen])

  useEffect(() => {
    setActiveStorySlide(0)
    setMobileViewMode('story')
    async function loadData() {
      try {
        const listingEndpoint = (sharedById || !user)
          ? `/api/public/listings/${id}${inviteToken ? `?inviteToken=${encodeURIComponent(inviteToken)}` : ''}`
          : `/api/listings/${id}`
        const res = await fetch(listingEndpoint)
        const data = await res.json()
        const listObj = data?.data || (data?.id ? data : null)
        if (listObj && data?.success !== false) {
          setListing(listObj)
          if (listObj.heroMediaUrl) {
            setActiveMediaUrl(listObj.heroMediaUrl)
          }

          // Fetch open houses matching this listing via gateway search endpoint
          try {
            const params = new URLSearchParams({
              listingId: String(listObj.id || ''),
              address: String(listObj.address || ''),
              city: String(listObj.city || ''),
              state: String(listObj.state || ''),
              zip: String(listObj.zip || ''),
            })
            const ohRes = await fetch(`/api/public/openhouses/search?${params.toString()}`)
            const ohJson = await ohRes.json()
            if (ohJson.success && Array.isArray(ohJson.data)) {
              setOpenHouses(ohJson.data)
            }
          } catch (e) {
            console.error('Failed to load open houses', e)
          }
        }

        // Load sharing agent info if agentId is in URL
        if (sharedById) {
          const agentRes = await fetch(`/api/public/agents/${sharedById}`)
          const agentJson = await agentRes.json()
          if (agentJson.success) {
            setAgent(agentJson.data)
          }
        }

        // Load custom map settings
        try {
          const mapEndpoint = user
            ? `/api/listings/${id}/map-settings`
            : `/api/public/listings/${id}/map-settings`
          const mapSettingsRes = await fetch(mapEndpoint)
          const mapSettingsJson = await mapSettingsRes.json()
          if (mapSettingsJson.success && mapSettingsJson.data) {
            setMapSettings(mapSettingsJson.data)
          }
        } catch (e) {
          console.error('Failed to load map settings', e)
        }
      } catch (e) {
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [id, sharedById, inviteToken, user])

  const handleAddToDeals = async () => {
    if (!listing) return
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: listing.address,
          type: listing.propertyType?.toLowerCase().includes('lease') ? 'lease' : 'sale',
          price: listing.price,
          commission_amount: null,
          target_close_date: null,
          inventory_listing_id: listing.id,
          status: 'active'
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.data?.id) {
          navigate(`/transactions/${data.data.id}`)
        } else if (data.id) {
          navigate(`/transactions/${data.id}`)
        } else {
          alert('Listing successfully added to the Deals pipeline!')
        }
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to add listing to deals')
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleSendLead = async (e: React.FormEvent, targetObj?: any) => {
    e.preventDefault()
    setIsSubmittingLead(true)
    const target = targetObj || selectedListObj || listing
    try {
      const res = await fetch('/api/public/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: target?.id || listing?.id,
          inquiryId,
          sharedBy: sharedById || undefined,
          first_name: leadName.split(' ')[0] || 'Inquiry',
          last_name: leadName.split(' ').slice(1).join(' ') || 'Lead',
          email: leadEmail,
          phone: leadPhone,
          notes: `Lead from shared listing landing page for property ${target?.address || listing?.address || ''}. Message: ${leadMessage}`
        })
      })
      if (res.ok) {
        setInquirySuccess(true)
        setInquiryId(crypto.randomUUID())
        setTimeout(() => {
          setLeadName('')
          setLeadEmail('')
          setLeadPhone('')
          setInquirySuccess(false)
          setShowInquiryModal(false)
        }, 2000)
      } else {
        alert('Failed to submit inquiry. Please try again.')
      }
    } catch (e) {
      console.error(e)
      alert('An error occurred. Please try again.')
    } finally {
      setIsSubmittingLead(false)
    }
  }



  if (isLoading) {
    if (!user) {
      return (
        <div className="flex h-screen items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      )
    }
    return (
      <Layout>
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          <div className="flex gap-4 items-center mb-2">
            <SkeletonBlock width="w-64" height="h-7" />
            <div className="ml-auto flex gap-2">
              <SkeletonBlock width="w-24" height="h-9" className="rounded-xl" />
              <SkeletonBlock width="w-24" height="h-9" className="rounded-xl" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <SkeletonBlock width="w-full" height="h-[300px]" className="rounded-2xl mb-4 animate-[pulse_1.5s_infinite]" />
              <SkeletonCard lines={6} />
            </div>
            <div className="space-y-4">
              <SkeletonCard lines={4} />
              <SkeletonCard lines={3} />
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  if (!listing) {
    if (!user) {
      return (
        <div className="flex h-screen items-center justify-center bg-gray-50 text-gray-500">
          Listing not found.
        </div>
      )
    }
    return (
      <Layout>
        <div className="text-center py-20 text-gray-500">Listing not found.</div>
      </Layout>
    )
  }



  function renderPublicView() {
    if (!listing) return null
    const isLuxury = listing.price && listing.price >= 1000000
    const isLease = presentation.id === 'rental' || presentation.id === 'commercial-lease'

    const theme = isLuxury
      ? {
          primary: 'text-amber-900',
          accentBg: 'bg-amber-50/60',
          accentText: 'text-amber-700',
          accentBorder: 'border-amber-100',
          fontFamily: 'font-serif',
          fontHeading: 'font-serif tracking-tight',
          pillColor: 'bg-amber-100 text-amber-900 border-amber-200'
        }
      : isLease
      ? {
          primary: 'text-teal-900',
          accentBg: 'bg-teal-50/60',
          accentText: 'text-teal-700',
          accentBorder: 'border-teal-100',
          fontFamily: 'font-sans',
          fontHeading: 'font-sans font-bold tracking-tight',
          pillColor: 'bg-teal-100 text-teal-900 border-teal-200'
        }
      : {
          primary: 'text-slate-900',
          accentBg: 'bg-slate-50/60',
          accentText: 'text-slate-700',
          accentBorder: 'border-slate-100',
          fontFamily: 'font-sans',
          fontHeading: 'font-sans font-bold tracking-tight',
          pillColor: 'bg-blue-100 text-blue-900 border-blue-200'
        }

    const embedUrl = getEmbedTourUrl()
    const companyIdentity = {
      companyName,
      address: String(firstNonEmpty(agent?.companyAddress, branding.companyAddress, '100 Wall Street, 12th Floor, New York, NY 10005') || '100 Wall Street, 12th Floor, New York, NY 10005'),
      telephone: String(firstNonEmpty(agent?.companyTelephone, branding.companyTelephone, '(212) 555-0100') || '(212) 555-0100'),
      fax: String(firstNonEmpty(agent?.companyFax, branding.companyFax, '') || ''),
    }
    const complianceDisclaimer = getComplianceDisclaimer(companyIdentity)
    const overviewFacts = presentation.showAffordability && estimatedMonthlyPayment
      ? [
          ...presentation.primaryFacts.slice(0, 3),
          { id: 'estimated-payment', label: 'Estimated Monthly Payment', value: `$${estimatedMonthlyPayment.total.toLocaleString()}/mo` },
        ]
      : presentation.primaryFacts.slice(0, 4)
    // ── MOBILE RESPONSIVE EXPERIENCE ──────────────────────────────────────────
    if (isMobile && !forceDesktopLayout) {
      return (
        <>
        <div className="min-h-screen bg-black flex flex-col select-none">
          {/* Top view switcher */}
          <div className="flex w-full bg-black/95 text-white border-b border-white/10 flex-shrink-0 z-30 font-sans">
            <button
              onClick={() => setMobileViewMode('story')}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-widest text-center flex items-center justify-center gap-1.5 border-b-2 ${mobileViewMode === 'story' ? 'border-amber-400 text-amber-400' : 'border-transparent text-gray-400'}`}
            >
              <Smartphone className="h-4.5 w-4.5" /> Story Tour
            </button>
            <button
              onClick={() => setMobileViewMode('feed')}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-widest text-center flex items-center justify-center gap-1.5 border-b-2 ${mobileViewMode === 'feed' ? 'border-amber-400 text-amber-400' : 'border-transparent text-gray-400'}`}
            >
              <Grid className="h-4.5 w-4.5" /> Browse Feed
            </button>
            <button
              onClick={printFlyer}
              className="py-3 px-3 text-xs font-black uppercase tracking-widest text-center flex items-center justify-center gap-1.5 border-b-2 border-transparent text-gray-400 hover:text-white"
              title="Print Flyer"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
            <button
              onClick={() => setForceDesktopLayout(true)}
              className="py-3 px-3 text-xs font-black uppercase tracking-widest text-center flex items-center justify-center gap-1.5 border-b-2 border-transparent text-gray-400 hover:text-white"
            >
              Full Page
            </button>
          </div>

          <style dangerouslySetInnerHTML={{__html: `
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(15px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .animate-fade-in-up {
              animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .scrollbar-hide::-webkit-scrollbar {
              display: none;
            }
            .scrollbar-hide {
              -ms-overflow-style: none;
              scrollbar-width: none;
            }
          `}} />

          {mobileViewMode === 'story' ? (
            <ListingStoryView
              listing={listing}
              displayStreet={displayStreet}
              agent={agent}
              listingAgent={presentedBy}
              isSharedLeadView={isSharedLeadView}
              complianceDisclaimer={complianceDisclaimer}
              mapSettings={mapSettings}
              effectiveMapCoords={effectiveMapCoords}
              listingAreas={listingAreas}
              listingSchools={listingSchools}
              mediaList={mediaList}
              activeIndex={activeIndex}
              handleNextPhoto={handleNextPhoto}
              handlePrevPhoto={handlePrevPhoto}
              embedUrl={embedUrl}
              isStoryPaused={isStoryPaused}
              setIsStoryPaused={setIsStoryPaused}
              activeStorySlide={activeStorySlide}
              setActiveStorySlide={setActiveStorySlide}
              companyLogoUrl={companyLogoUrl}
              companyName={companyName}
              onOpenInquiry={openInquiry}
              onPrintFlyer={printFlyer}
            />
          ) : (
            <ListingMobileFeed
              listing={listing}
              allListings={allListings}
              onSelectListing={handleSelectListing}
              agent={agent}
              listingAgent={presentedBy}
              companyName={companyName}
              isSharedLeadView={isSharedLeadView}
              setLeadMessage={setLeadMessage}
              setShowInquiryModal={setShowInquiryModal}
              onOpenInquiry={openInquiry}
            />
          )}
        </div>

        {/* Voluntary Inquiry Modal (shared between Story Tour and Browse Feed) */}
        {showInquiryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowInquiryModal(false)}>
            <div className="bg-white rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl p-5 relative font-sans" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setShowInquiryModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 font-bold"
              >
                ✕
              </button>
              <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider mb-1">
                Voluntary Inquiry
              </h4>
              <p className="text-[9px] text-gray-400 mb-4">Asking about {selectedListObj ? selectedListObj.address : (listing?.address || 'available options')}. No obligation.</p>

              {inquirySuccess ? (
                <div className="py-8 text-center space-y-2">
                  <div className="h-10 w-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-lg font-bold">
                    ✓
                  </div>
                  <p className="text-xs font-bold text-gray-900">Inquiry Sent Successfully!</p>
                  <p className="text-[10px] text-gray-500">The presented agent will contact you shortly.</p>
                </div>
              ) : (
                <form onSubmit={(e) => handleSendLead(e, selectedListObj)} className="space-y-3.5">
                  <div>
                    <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Your Name</label>
                    <input required value={leadName} onChange={e => setLeadName(e.target.value)} placeholder="Jane Doe" className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50/50" />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Email Address</label>
                    <input required type="email" value={leadEmail} onChange={e => setLeadEmail(e.target.value)} placeholder="jane@email.com" className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50/50" />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Phone Number</label>
                    <input required type="tel" value={leadPhone} onChange={e => setLeadPhone(e.target.value)} placeholder="555-0199" className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50/50" />
                  </div>
                  <div>
                    <label className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Message</label>
                    <textarea rows={2} value={leadMessage} onChange={e => setLeadMessage(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50/50" />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingLead}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors flex items-center justify-center gap-1.5"
                  >
                    {isSubmittingLead ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending...</> : 'Send Inquiry'}
                  </button>

                  <p className="text-[7.5px] text-gray-400 text-center leading-relaxed mt-2.5">
                    {complianceDisclaimer}
                  </p>
                </form>
              )}
            </div>
          </div>
        )}
      </>
      )
    }

    // ── DESKTOP PREMIUM EXPERIENCE ────────────────────────────────────────────
    return (
      <div className={`min-h-screen bg-[#FAF9F6] text-gray-800 ${theme.fontFamily} antialiased pb-20`}>
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap" rel="stylesheet" />

        <style dangerouslySetInnerHTML={{__html: `
          .custom-home-icon { background: transparent !important; border: none !important; }
          .amenity-div-icon { background: transparent !important; border: none !important; }
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        `}} />

        {isMobile && forceDesktopLayout && (
          <div className="bg-amber-500 text-black px-4 py-2.5 text-xs font-bold flex justify-between items-center no-print sticky top-0 z-50 shadow-md">
            <span>Viewing full desktop page.</span>
            <button
              onClick={() => setForceDesktopLayout(false)}
              className="bg-black text-white px-3 py-1.5 rounded-xl uppercase tracking-wider text-[10px] font-bold"
            >
              Switch to Mobile View
            </button>
          </div>
        )}

        {/* Global sticky header */}
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-150 px-6 py-3.5 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            {!logoFailed && companyLogoUrl && !companyLogoUrl.includes('/prime-america-seal.png') ? (
              <img
                src={companyLogoUrl}
                alt={companyName}
                onError={() => setLogoFailed(true)}
                className="h-10 w-auto object-contain max-w-[180px]"
              />
            ) : (
              <div className="flex items-center gap-2.5">
                <img
                  src="/prime-america-seal.png"
                  alt="Prime America Real Estate"
                  className="h-10 w-10 object-contain rounded-full border border-amber-500/30"
                />
                <div>
                  <p className="font-extrabold text-base text-gray-900 leading-none">{companyName}</p>
                  <p className="text-[11px] font-semibold text-amber-600 tracking-wide mt-0.5">Prime America Real Estate, Inc.</p>
                </div>
              </div>
            )}
          </div>

          {/* Header Right - Presented by Agent Card & Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={printFlyer}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors shadow-xs flex items-center gap-1.5 no-print"
              title="Print Property Flyer"
            >
              <Printer className="h-3.5 w-3.5 text-gray-500" /> <span className="hidden sm:inline">Print</span> Flyer
            </button>

            {presentedBy.name && (
              <div className="flex items-center gap-3 bg-gray-50/90 border border-gray-200 rounded-full pl-3 pr-4 py-1.5 shadow-xs">
                <div className="h-9 w-9 rounded-full bg-brand-navy text-brand-gold font-bold text-xs flex items-center justify-center flex-shrink-0 border border-amber-400/40 shadow-xs">
                  {(presentedBy.name || 'S')[0]}
                </div>
                <div className="text-left leading-tight hidden sm:block">
                  <p className="text-[9.5px] font-bold text-gray-400 uppercase tracking-wider">Presented by</p>
                  <p className="text-xs font-extrabold text-gray-900">{presentedBy.name}</p>
                </div>
                <button
                  onClick={() => {
                    const formEl = document.getElementById('request-tour-form')
                    if (formEl) formEl.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="ml-1 px-3.5 py-1.5 rounded-full text-xs font-bold bg-brand-gold text-brand-navy hover:bg-amber-400 transition-colors shadow-xs"
                >
                  Contact
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-6 mt-6">
          {/* Main visual component with hero overlay button */}
          <div className="rounded-3xl overflow-hidden shadow-2xl relative bg-gray-900 aspect-[16/9] sm:aspect-[21/9] group border border-gray-200">
            {showingVirtualTour && embedUrl ? (
              embedUrl.includes('matterport') ? (
                /* Matterport: never iframe — open in new tab */
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 px-8 text-center gap-5">
                  <div className="h-20 w-20 rounded-3xl bg-white/10 border border-white/20 flex items-center justify-center shadow-xl">
                    <Video className="h-9 w-9 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-xl">Interactive 3D Virtual Tour</p>
                    <p className="text-gray-400 text-sm mt-1">Opens in a new tab for the full immersive experience</p>
                  </div>
                  <a
                    href={embedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2.5 bg-amber-400 hover:bg-amber-300 text-black font-extrabold px-7 py-3.5 rounded-2xl text-sm transition-all shadow-2xl"
                  >
                    <ExternalLink className="h-4 w-4" /> Launch 3D Tour
                  </a>
                  <button onClick={() => setShowingVirtualTour(false)} className="text-gray-500 hover:text-gray-300 text-xs mt-1">← Back to Photos</button>
                </div>
              ) : (
                /* YouTube / Vimeo / others: embed */
                <iframe
                  src={embedUrl}
                  title="Virtual Tour Player"
                  className="w-full h-full"
                  allowFullScreen
                  allow="xr-spatial-tracking; gyroscope; accelerometer; autoplay"
                />
              )
            ) : activeMediaUrl ? (
              <img
                src={resolveMediaUrl(activeMediaUrl, listing.id)}
                alt={listing.address}
                className="w-full h-full object-cover cursor-pointer hover:scale-[1.01] transition-transform duration-500"
                onClick={() => setIsLightboxOpen(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-900 font-bold text-xl">
                No Photo Available
              </div>
            )}

            {/* Status Pill Badge */}
            {!showingVirtualTour && <div className="absolute top-2.5 left-2.5 sm:top-6 sm:left-6 flex flex-wrap items-center gap-1.5 sm:gap-2 z-10">
              <span className={`inline-block px-2.5 py-0.5 sm:px-3.5 sm:py-1 text-[10px] sm:text-xs font-bold rounded-full uppercase tracking-wider shadow-md border ${theme.pillColor}`}>
                For {listing.propertyType || 'Sale'}
              </span>
              <span className="inline-block px-2.5 py-0.5 sm:px-3.5 sm:py-1 text-[10px] sm:text-xs font-bold rounded-full bg-black/60 text-white backdrop-blur-md border border-white/20">
                MLS #{listing.mlsNumber || 'Exclusive'}
              </span>
            </div>}

            {/* Hero Gallery Overlay Button & Share */}
            {!showingVirtualTour && <div className="absolute bottom-2.5 right-2.5 sm:bottom-6 sm:right-6 flex items-center gap-1.5 sm:gap-2 z-10">
              <button
                onClick={() => setShowShareModal(true)}
                className="bg-black/80 hover:bg-black text-white text-[10px] sm:text-xs font-extrabold px-2.5 py-1.5 sm:px-3.5 sm:py-2.5 rounded-xl sm:rounded-2xl flex items-center gap-1 sm:gap-1.5 transition-all shadow-xl border border-white/20 backdrop-blur-md"
              >
                <Send className="h-3 w-3 sm:h-4 sm:w-4 text-amber-400" /> Share
              </button>
              <button
                onClick={() => setIsLightboxOpen(true)}
                className="bg-black/80 hover:bg-black text-white text-[10px] sm:text-xs font-extrabold px-2.5 py-1.5 sm:px-4 sm:py-2.5 rounded-xl sm:rounded-2xl flex items-center gap-1 sm:gap-2 transition-all shadow-xl border border-white/20 backdrop-blur-md"
              >
                <Grid className="h-3 w-3 sm:h-4 sm:w-4 text-brand-gold" />
                View All {mediaList.length} Photos ↗
              </button>
            </div>}

            {/* Hover Next/Prev buttons */}
            {!showingVirtualTour && mediaList.length > 1 && (
              <>
                <button
                  onClick={handlePrevPhoto}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 border border-white/10"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={handleNextPhoto}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 border border-white/10"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {/* Photo Gallery Thumbnails Strip + Virtual Tour Tab */}
          {(mediaList.length > 0 || embedUrl) && (
            <div className="flex gap-2.5 overflow-x-auto py-4 px-1 scrollbar-hide">
              {mediaList.map((med: any, idx: number) => {
                const mediaSrc = resolveMediaUrl(med.mediaUrl, listing.id)
                return (
                  <button
                    key={med.id}
                    onClick={() => { setActiveMediaUrl(med.mediaUrl); setShowingVirtualTour(false) }}
                    className={`h-16 w-24 rounded-xl overflow-hidden border-2 flex-shrink-0 transition-all ${
                      !showingVirtualTour && activeIndex === idx ? 'border-brand-navy scale-95 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={mediaSrc} alt="Property View" className="h-full w-full object-cover" />
                  </button>
                )
              })}
              {embedUrl && (
                <button
                  onClick={() => setShowingVirtualTour(true)}
                  className={`h-16 w-28 rounded-xl flex-shrink-0 border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                    showingVirtualTour ? 'border-amber-400 bg-amber-400/10 scale-95 shadow-md' : 'border-amber-400/40 bg-black/60 opacity-80 hover:opacity-100 hover:border-amber-400'
                  }`}
                >
                  <Video className="h-4 w-4 text-amber-400" />
                  <span className="text-[9px] font-extrabold text-amber-400 uppercase tracking-wider">3D Tour</span>
                </button>
              )}
            </div>
          )}

          {/* Core Info & Quick Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            {overviewFacts.map((item) => (
              <div
                key={item.id}
                onClick={item.id === 'estimated-payment' ? () => setShowPaymentModal(true) : undefined}
                className={clsx(
                  'rounded-2xl border border-gray-200 bg-white p-4 shadow-sm',
                  item.id === 'estimated-payment' && 'cursor-pointer hover:border-brand-navy/30 transition-colors',
                )}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {item.label}{item.id === 'estimated-payment' ? <span className="text-[9px] text-blue-600 font-bold ml-1">adjust</span> : null}
                </p>
                <p className="mt-1 text-2xl font-black text-gray-900 max-w-full truncate">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Main 2-Column Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
            {/* Left Main Column */}
            <div className="lg:col-span-2 space-y-8">
              {/* Address details & Quick Specs */}
              <div className="space-y-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                <div>
                  <h1 className={`text-3xl ${theme.fontHeading} text-gray-900 font-bold`}>{displayStreet || listing.address}</h1>
                  <p className="text-gray-600 text-base flex items-center gap-1.5 font-sans mt-1 font-medium">
                    <MapPin className="h-5 w-5 text-amber-500 flex-shrink-0" />
                    {displayLocation}
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-5 mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-center font-sans">
                  {presentation.primaryFacts.slice(1, 5).map((item) => (
                    <div key={item.id} className="rounded-xl bg-white border border-gray-100 p-3">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{item.label}</p>
                      <p className="text-sm font-bold text-gray-800 capitalize mt-1">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm font-sans">
                <h2 className="text-xl font-bold text-gray-900 border-b border-gray-100 pb-2">About the Property</h2>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                  {listing.description || 'No description provided.'}
                </p>
              </div>

              {presentation.sections.length > 0 ? (
                <div className="space-y-5 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm font-sans">
                  <h2 className="text-xl font-bold text-gray-900 border-b border-gray-100 pb-2">{presentation.label} Details</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {presentation.sections.map((section) => (
                      <div key={section.title}>
                        <h3 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 mb-3">{section.title}</h3>
                        <dl className="space-y-2">
                          {section.facts.map((item) => (
                            <div key={item.id} className="flex items-start justify-between gap-4 border-b border-gray-100 pb-2 text-sm">
                              <dt className="text-gray-500">{item.label}</dt>
                              <dd className="font-bold text-gray-900 text-right">{item.value}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Interactive Local Map section */}
              <div className="space-y-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Compass className="h-5 w-5 text-amber-500" /> Explore {listing.city || 'Property'} Location
                </h2>
                {listingAreas.length > 0 ? (
                  <div className="flex flex-wrap gap-2 font-sans">
                    {listingAreas.map((area) => (
                      <span key={area.label} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700">
                        <strong>{area.label}:</strong> {area.value}
                      </span>
                    ))}
                  </div>
                ) : null}
                <ListingMap
                  address={listing.address}
                  city={listing.city}
                  zip={listing.zip}
                  customLat={effectiveMapCoords.lat}
                  customLng={effectiveMapCoords.lng}
                  allowedCategories={mapSettings?.categories}
                />
              </div>

              {/* Hyper-Local School Info & Amenities */}
              {presentation.showSchools && listingSchools.length > 0 ? <div className="space-y-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm font-sans">
                <h2 className="text-xl font-bold text-gray-900 border-b border-gray-100 pb-2 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-600" /> Area Schools & Education
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {listingSchools.map((sch, idx) => (
                    <div key={idx} className="rounded-2xl border border-gray-150 p-4 bg-gray-50/60 flex flex-col justify-between">
                      <div>
                        <span className="text-[9px] font-extrabold uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{sch.type}</span>
                        <p className="font-bold text-gray-900 text-sm mt-2">{sch.name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div> : null}

              {/* Virtual Tour note — now shown inline in photo gallery above */}

              {/* Open House schedules */}
              {upcomingOpenHouses.length > 0 && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-6 space-y-4 font-sans shadow-sm">
                  <div>
                    <h3 className="font-bold text-amber-900 text-lg flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-amber-600" /> Upcoming Open House Event
                    </h3>
                    <p className="text-xs text-amber-700 mt-0.5">You are invited to tour the property live.</p>
                  </div>
                  <div className="space-y-2.5 text-sm text-gray-700">
                    {upcomingOpenHouses.map((oh) => (
                      <div key={oh.id} className="bg-white rounded-2xl p-4 border border-amber-200/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-xs">
                        <div className="space-y-1">
                          <p className="font-bold text-gray-900">{oh.title}</p>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-amber-600" /> {new Date(oh.start_time).toLocaleString()}</span>
                            <span>Hosted by: {oh.agent_name}</span>
                          </div>
                        </div>
                        <a
                          href={`https://openhouse.primeamericarealestate.com/e/${oh.public_token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-brand-navy hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition-colors"
                        >
                          RSVP & Sign-In
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Side Contact & Sticky Form Sidebar */}
            <div className="lg:col-span-1 space-y-6 sticky top-20 self-start">
              {/* Tour Request Form Card */}
              <div id="request-tour-form" className="bg-white rounded-3xl p-6 border border-gray-200 shadow-xl space-y-4 font-sans">
                <div>
                  <h3 className="font-extrabold text-gray-900 text-lg flex items-center gap-2">
                    <Send className="h-5 w-5 text-blue-600" /> {presentation.inquiryTitle}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    or call {presentedBy.name || 'our team'}: <a href={`tel:${presentedBy.phone || ''}`} className="font-bold text-blue-600 hover:underline">{presentedBy.phone || 'Contact us'}</a>
                  </p>
                </div>

                <form onSubmit={handleSendLead} className="space-y-3.5">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Your Name</label>
                    <input required value={leadName} onChange={e => setLeadName(e.target.value)} placeholder="Jane Doe" className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Email Address</label>
                    <input required type="email" value={leadEmail} onChange={e => setLeadEmail(e.target.value)} placeholder="jane@email.com" className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Phone Number</label>
                    <input required type="tel" value={leadPhone} onChange={e => setLeadPhone(e.target.value)} placeholder="(929) 424-8950" className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50" />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Message</label>
                    <textarea rows={3} value={leadMessage} onChange={e => setLeadMessage(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50" />
                  </div>

                  {/* TCPA / SMS Consent Disclaimer */}
                  <p className="text-[9.5px] text-gray-400 leading-relaxed">
                    By providing your phone number, you consent to receive text messages and phone calls from Prime America Real Estate, Inc. Consent is not required for purchase. Msg & data rates may apply.
                  </p>

                  <button
                    type="submit"
                    disabled={isSubmittingLead}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3.5 rounded-xl text-sm transition-all shadow-lg shadow-blue-600/20 inline-flex items-center justify-center gap-2"
                  >
                    <BadgeInfo className="h-4 w-4" />
                    {isSubmittingLead ? 'Submitting...' : presentation.inquiryAction}
                  </button>
                </form>
              </div>

              {/* Presented Agent Card */}
              {presentedBy.name && (
                <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-md space-y-4 text-center font-sans">
                  {agent?.avatarUrl ? (
                    <img
                      src={agent.avatarUrl}
                      alt={presentedBy.name}
                      className="h-16 w-16 rounded-full object-cover border-2 border-amber-400 bg-white mx-auto shadow-sm"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-brand-navy text-brand-gold flex items-center justify-center font-black text-xl mx-auto shadow-sm">
                      {presentedBy.name.split(' ').map((n: string) => n[0]).join('')}
                    </div>
                  )}
                  <div>
                    <h4 className="font-extrabold text-gray-900 text-base leading-snug">{presentedBy.name}</h4>
                    <p className="text-xs text-gray-500 capitalize mt-0.5">{isSharedLeadView ? 'Presented By' : 'Listing Agent'} • {presentedBy.brokerage || 'Prime America Real Estate, Inc.'}</p>
                    {agent?.license_number && (
                      <p className="text-[10px] text-gray-400 mt-1">License: {agent.license_number} ({agent.license_state || 'NY'})</p>
                    )}
                  </div>
                  <div className="pt-3 border-t border-gray-100 text-left space-y-2 text-xs text-gray-600">
                    {presentedBy.email && (
                      <p className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-gray-400" /> {presentedBy.email}
                      </p>
                    )}
                    {presentedBy.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-gray-400" /> {presentedBy.phone}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Footer / Compliance Disclaimer */}
              <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm font-sans text-xs text-gray-500 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-gray-800 flex items-center gap-1">
                    <BadgeInfo className="h-4 w-4 text-gray-400" /> Legal Compliance
                  </h4>
                  <span className="text-xs font-bold text-brand-navy">Equal Housing Opportunity</span>
                </div>
                <p className="leading-relaxed text-[11px]">
                  {complianceDisclaimer}
                </p>
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                  <a href="https://primeamericany.com" target="_blank" rel="noopener noreferrer" className="font-bold text-blue-600 hover:underline">
                    primeamericany.com ↗
                  </a>
                  <span className="text-gray-400">© 2026 Prime America Real Estate, Inc.</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Lightbox Modal */}
        {isLightboxOpen && (
          <div
            ref={lightboxRef}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 backdrop-blur-md"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsLightboxOpen(false)
              if (e.key === 'ArrowRight') handleNextPhoto()
              if (e.key === 'ArrowLeft') handlePrevPhoto()
            }}
            tabIndex={0}
            style={{ outline: 'none' }}
          >
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="absolute top-4 right-4 z-50 text-white hover:text-amber-400 bg-white/15 hover:bg-white/25 p-3 rounded-full transition-all shadow-xl border border-white/20 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              title="Close Lightbox"
            >
              <X className="h-6 w-6" />
            </button>

            <div className="relative max-w-5xl w-full px-6 flex items-center justify-center flex-1">
              {mediaList.length > 1 && (
                <button
                  onClick={handlePrevPhoto}
                  className="absolute left-6 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 p-4 rounded-full transition-all border border-white/10"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
              )}

              <img
                src={resolveMediaUrl(mediaList[activeIndex]?.mediaUrl, listing.id)}
                alt={listing.address}
                className="max-h-[75vh] max-w-full object-contain rounded-xl shadow-2xl select-none"
              />

              {mediaList.length > 1 && (
                <button
                  onClick={handleNextPhoto}
                  className="absolute right-6 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 p-4 rounded-full transition-all border border-white/10"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              )}
            </div>

            <div className="w-full max-w-5xl px-6 py-6 border-t border-white/10 text-white flex flex-col items-center gap-4">
              <div className="text-center font-sans">
                <p className="text-base font-bold">{listing.address}</p>
                <p className="text-xs text-gray-400 mt-1">Photo {activeIndex + 1} of {mediaList.length}</p>
              </div>

              <div className="flex gap-2 overflow-x-auto max-w-full scrollbar-hide py-1">
                {mediaList.map((med: any, idx: number) => {
                  const mediaSrc = resolveMediaUrl(med.mediaUrl, listing.id)
                  return (
                    <button
                      key={med.id}
                      onClick={() => setActiveMediaUrl(med.mediaUrl)}
                      className={`h-12 w-18 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all ${
                        activeIndex === idx ? 'border-blue-500 scale-95' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={mediaSrc} alt="Thumbnail" className="h-full w-full object-cover" />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  const generateHtmlEmail = () => {
    if (!listing) return ''
    const heroSrc = resolveMediaUrl(listing.heroMediaUrl, listing.id) || `${window.location.origin}/prime-america-seal.png`
    const agentPhoto = agent?.avatarUrl || `${window.location.origin}/prime-america-seal.png`
    const price = listing.price ? `$${listing.price.toLocaleString()}` : 'Price Upon Request'
    const beds = listing.bedrooms ? `${listing.bedrooms} Beds` : null
    const baths = listing.bathrooms ? `${listing.bathrooms} Baths` : null
    const sqft = listing.sqft ? `${Number(listing.sqft).toLocaleString()} SqFt` : null
    const specs = [beds, baths, sqft].filter(Boolean).join(' • ') || 'Exclusive Property'
    const agentName = presentedBy?.name || agent?.name || 'Prime America Real Estate'
    const agentBrokerage = presentedBy?.brokerage || companyName || 'Prime America Real Estate'
    const agentPhone = presentedBy?.phone || agent?.phone || ''
    const agentEmail = presentedBy?.email || agent?.email || ''

    return `<div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
  <div style="position:relative;width:100%;height:280px;background-color:#0f172a;">
    <img src="${heroSrc}" alt="${listing.address}" style="width:100%;height:280px;object-fit:cover;display:block;" />
  </div>
  <div style="padding:24px;">
    <div style="margin-bottom:12px;">
      <span style="background-color:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:800;padding:4px 10px;border-radius:9999px;text-transform:uppercase;letter-spacing:0.05em;display:inline-block;">${listing.propertyType || 'For Sale'}</span>
      <span style="color:#059669;font-size:22px;font-weight:900;float:right;line-height:1;">${price}</span>
    </div>
    <h2 style="margin:0 0 6px 0;font-size:20px;font-weight:800;color:#0f172a;line-height:1.2;">${displayStreet || listing.address}</h2>
    <p style="margin:0 0 16px 0;font-size:13px;color:#64748b;">${displayLocation}</p>
    <div style="background-color:#f8fafc;border:1px solid #f1f5f9;border-radius:12px;padding:12px;margin-bottom:20px;text-align:center;">
      <span style="font-size:13px;font-weight:700;color:#334155;">${specs}</span>
    </div>
    <p style="font-size:13px;line-height:1.6;color:#475569;margin-bottom:24px;">${(listing.description || '').slice(0, 220)}${listing.description && listing.description.length > 220 ? '...' : ''}</p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${shareUrl}" style="background-color:#0f172a;color:#ffffff;font-size:14px;font-weight:700;padding:14px 28px;border-radius:12px;text-decoration:none;display:inline-block;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">Explore Photos & 3D Virtual Tour ↗</a>
    </div>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="width:48px;vertical-align:middle;">
          <img src="${agentPhoto}" alt="${agentName}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;display:block;border:1px solid #cbd5e1;" />
        </td>
        <td style="vertical-align:middle;padding-left:12px;">
          <div style="font-size:13px;font-weight:800;color:#0f172a;">${agentName}</div>
          <div style="font-size:11px;color:#64748b;">${agentBrokerage}</div>
          ${agentPhone ? `<div style="font-size:11px;color:#2563eb;font-weight:600;margin-top:2px;"><a href="tel:${agentPhone}" style="color:#2563eb;text-decoration:none;">${agentPhone}</a></div>` : ''}
          ${agentEmail ? `<div style="font-size:11px;color:#64748b;margin-top:1px;"><a href="mailto:${agentEmail}" style="color:#64748b;text-decoration:none;">${agentEmail}</a></div>` : ''}
        </td>
      </tr>
    </table>
  </div>
</div>`
  }

  const handleCopyHtmlEmail = async () => {
    const html = generateHtmlEmail()
    const plain = `Check out ${listing.address} (${listing.price ? '$' + listing.price.toLocaleString() : ''})\n\nView Photos & 3D Tour: ${shareUrl}\n\nPresented by: ${presentedBy?.name || agent?.name || ''} (${presentedBy?.phone || agent?.phone || ''})`
    try {
      if (navigator.clipboard && (window as any).ClipboardItem) {
        const blobHtml = new Blob([html], { type: 'text/html' })
        const blobText = new Blob([plain], { type: 'text/plain' })
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({
            'text/html': blobHtml,
            'text/plain': blobText,
          })
        ])
      } else {
        await navigator.clipboard.writeText(plain)
      }
      setHtmlEmailCopied(true)
      setTimeout(() => setHtmlEmailCopied(false), 2500)
    } catch (e) {
      await navigator.clipboard.writeText(plain)
      setHtmlEmailCopied(true)
      setTimeout(() => setHtmlEmailCopied(false), 2500)
    }
  }

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${displayStreet || listing.address} ($${listing.price?.toLocaleString() || ''})`,
          text: `Check out ${displayStreet || listing.address} ($${listing.price ? '$' + listing.price.toLocaleString() : ''}) on Prime America Real Estate. Take a 3D tour & see all photos:`,
          url: shareUrl || window.location.href,
        })
      } catch (err) {
        // user cancelled or share failed
      }
    }
  }

  const qrCodeImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(shareUrl || window.location.href)}`

  const shareModal = showShareModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={() => setShowShareModal(false)}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-auto overflow-hidden font-sans border border-gray-200 space-y-0" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Share2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-gray-900">Marketing & Share Hub</h3>
              <p className="text-[10px] text-gray-400">Social, SMS, Email & Print Ready</p>
            </div>
          </div>
          <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-100 bg-gray-50/80 px-3 pt-2 gap-1 text-xs font-bold">
          <button
            onClick={() => setShareTab('quick')}
            className={`pb-2.5 px-3 rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 ${
              shareTab === 'quick' ? 'border-blue-600 text-blue-600 bg-white shadow-xs' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" /> Quick & Social
          </button>
          <button
            onClick={() => setShareTab('email')}
            className={`pb-2.5 px-3 rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 ${
              shareTab === 'email' ? 'border-blue-600 text-blue-600 bg-white shadow-xs' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Mail className="h-3.5 w-3.5" /> HTML Email
          </button>
          <button
            onClick={() => setShareTab('qr')}
            className={`pb-2.5 px-3 rounded-t-xl transition-all border-b-2 flex items-center gap-1.5 ${
              shareTab === 'qr' ? 'border-blue-600 text-blue-600 bg-white shadow-xs' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <QrCode className="h-3.5 w-3.5" /> QR Code
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Property Mini Card */}
          {listing && (
            <div className="flex gap-3 bg-gray-50 border border-gray-200/80 rounded-2xl p-3 items-center">
              {listing.heroMediaUrl ? (
                <img
                  src={resolveMediaUrl(listing.heroMediaUrl, listing.id)}
                  alt=""
                  className="h-14 w-16 rounded-xl object-cover border border-gray-200 flex-shrink-0"
                />
              ) : (
                <div className="h-14 w-16 rounded-xl bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">
                  No Pic
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900 text-xs truncate">{displayStreet || listing.address}</p>
                <p className="text-[11px] text-emerald-600 font-extrabold mt-0.5">${listing.price?.toLocaleString() || 'Contact for Price'}</p>
                <p className="text-[10px] text-gray-500 truncate">{displayLocation}</p>
              </div>
            </div>
          )}

          {/* TAB 1: QUICK & SOCIAL */}
          {shareTab === 'quick' && (
            <div className="space-y-3">
              {/* Native Device Share Sheet (iOS / Android) */}
              {'share' in navigator && (
                <button
                  onClick={handleNativeShare}
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-extrabold text-xs shadow-md hover:opacity-95 transition-all flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <Share2 className="h-4 w-4" /> Open Device Share Sheet
                  </span>
                  <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full uppercase tracking-wider">iMessage / WhatsApp / AirDrop</span>
                </button>
              )}

              {/* 1-Tap SMS */}
              <a
                href={`sms:?&body=${encodeURIComponent(`Check out ${displayStreet || listing?.address || 'this property'} ($${listing?.price ? '$' + listing.price.toLocaleString() : ''} • ${listing?.bedrooms || '—'}b/${listing?.bathrooms || '—'}ba) on Prime America Real Estate:\n${shareUrl || window.location.href}`)}`}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center justify-between text-xs font-bold"
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-600" /> Send via SMS Text Message
                </span>
                <span className="text-[10px] text-emerald-600 font-bold">1-Tap Text</span>
              </a>

              {/* WhatsApp */}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Check out ${displayStreet || listing?.address || 'this listing'} ($${listing?.price?.toLocaleString() || ''}) on Prime America Real Estate: ${shareUrl || window.location.href}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-xl bg-green-50 text-green-800 border border-green-200 hover:bg-green-100 transition-colors flex items-center justify-between text-xs font-bold"
              >
                <span className="flex items-center gap-2">
                  <span className="text-base leading-none">💬</span> Share on WhatsApp
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-green-600" />
              </a>

              {/* Social Grid (Facebook, LinkedIn, X) */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <a
                  href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl || window.location.href)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-2 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition-colors flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-center"
                >
                  <span className="text-sm font-black text-blue-700">f</span>
                  <span>Facebook</span>
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl || window.location.href)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-2 rounded-xl bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 transition-colors flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-center"
                >
                  <span className="text-sm font-black text-sky-700">in</span>
                  <span>LinkedIn</span>
                </a>
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Check out ${displayStreet || listing?.address || 'this property'} ($${listing?.price ? '$' + listing.price.toLocaleString() : ''})`)}&url=${encodeURIComponent(shareUrl || window.location.href)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-2 rounded-xl bg-gray-100 text-gray-800 border border-gray-200 hover:bg-gray-200 transition-colors flex flex-col items-center justify-center gap-1 text-[11px] font-bold text-center"
                >
                  <span className="text-sm font-black">𝕏</span>
                  <span>X / Twitter</span>
                </a>
              </div>

              {/* Copy Direct Link */}
              <div className="pt-2">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 block mb-1">Public Co-Branded Link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl || window.location.href}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-600 font-mono select-all focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareUrl || window.location.href)
                      setShareCopied(true)
                      setTimeout(() => setShareCopied(false), 2500)
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1 flex-shrink-0 ${
                      shareCopied ? 'bg-emerald-600 text-white' : 'bg-brand-navy text-white hover:bg-gray-800'
                    }`}
                  >
                    {shareCopied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RICH HTML EMAIL */}
          {shareTab === 'email' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-600">
                Copy this pre-formatted newsletter property card to paste directly into <strong>Gmail, Outlook, Apple Mail</strong>, or CRM email blasts:
              </p>

              {/* Visual Card Preview */}
              <div className="border border-gray-200 rounded-2xl p-3 bg-white shadow-xs space-y-2 text-xs">
                <div className="h-28 rounded-xl bg-gray-100 overflow-hidden relative">
                  <img
                    src={resolveMediaUrl(listing.heroMediaUrl, listing.id)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-2 left-2 bg-black/70 text-white font-extrabold text-[10px] px-2 py-0.5 rounded-md backdrop-blur-xs">
                    ${listing.price?.toLocaleString()}
                  </span>
                </div>
                <div className="space-y-1">
                  <h4 className="font-bold text-gray-900 text-xs">{displayStreet || listing.address}</h4>
                  <p className="text-[10px] text-gray-400">{displayLocation}</p>
                  <p className="text-[10px] font-bold text-gray-600">
                    {listing.bedrooms ? `${listing.bedrooms} Beds • ` : ''}{listing.bathrooms ? `${listing.bathrooms} Baths • ` : ''}{listing.sqft ? `${Number(listing.sqft).toLocaleString()} SqFt` : ''}
                  </p>
                </div>
                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <img
                      src={agent?.avatarUrl || '/prime-america-seal.png'}
                      alt=""
                      className="h-6 w-6 rounded-full object-cover border border-gray-200"
                    />
                    <span className="text-[10px] font-bold text-gray-800">{presentedBy?.name || agent?.name || 'Prime America Agent'}</span>
                  </div>
                  <span className="text-[9px] font-extrabold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                    View 3D Tour ↗
                  </span>
                </div>
              </div>

              {/* Copy & Mailto Actions */}
              <div className="space-y-2">
                <button
                  onClick={handleCopyHtmlEmail}
                  className={`w-full py-3 px-4 rounded-2xl font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 ${
                    htmlEmailCopied ? 'bg-emerald-600 text-white' : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-95'
                  }`}
                >
                  {htmlEmailCopied ? (
                    <><Check className="h-4 w-4" /> Rich HTML Email Copied to Clipboard!</>
                  ) : (
                    <><Copy className="h-4 w-4" /> Copy Styled Email for Gmail / Outlook</>
                  )}
                </button>

                <a
                  href={`mailto:?subject=${encodeURIComponent(`${displayStreet || listing?.address || 'Exclusive Property'} - Prime America Real Estate`)}&body=${encodeURIComponent(`Check out ${displayStreet || listing?.address || 'this home'} ($${listing?.price?.toLocaleString() || ''}).\n\nView full details & 3D tour: ${shareUrl || window.location.href}\n\nPresented by: ${presentedBy?.name || agent?.name || 'Prime America Real Estate'} (${presentedBy?.phone || agent?.phone || ''})`)}`}
                  className="w-full py-2.5 px-4 rounded-xl bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 text-xs font-bold"
                >
                  <Mail className="h-4 w-4 text-gray-500" /> Open Default Mail Client (Mailto)
                </a>
              </div>
            </div>
          )}

          {/* TAB 3: QR CODE */}
          {shareTab === 'qr' && (
            <div className="space-y-4 text-center">
              <p className="text-xs text-gray-600">
                Scan with any smartphone camera to open the co-branded listing directly:
              </p>

              <div className="bg-white border-2 border-gray-150 p-4 rounded-2xl inline-block shadow-md mx-auto">
                <img
                  src={qrCodeImgUrl}
                  alt="Listing QR Code"
                  className="h-48 w-48 mx-auto"
                />
                <p className="text-[11px] font-bold text-gray-900 mt-2 truncate max-w-[200px] mx-auto">{displayStreet || listing.address}</p>
                <p className="text-[10px] text-emerald-600 font-extrabold">${listing.price?.toLocaleString() || 'Contact for Price'}</p>
              </div>

              <div className="flex gap-2">
                <a
                  href={qrCodeImgUrl}
                  download={`${slugify(listing.address || 'listing')}-qr-code.png`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 px-3 rounded-xl bg-brand-navy text-white text-xs font-bold hover:bg-gray-800 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <QrCode className="h-3.5 w-3.5 text-brand-gold" /> Download QR
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl || window.location.href)
                    setShareCopied(true)
                    setTimeout(() => setShareCopied(false), 2500)
                  }}
                  className="py-2.5 px-4 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  {shareCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {shareCopied ? 'Copied' : 'Copy Link'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const paymentModal = showPaymentModal && presentation.showAffordability && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto" onClick={() => setShowPaymentModal(false)}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md my-auto overflow-hidden font-sans border border-gray-200" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h3 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <Calculator className="h-5 w-5 text-blue-600" /> Monthly Payment Calculator
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Customize loan terms to estimate your monthly cost</p>
          </div>
          <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Loan Type Options */}
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1.5 uppercase tracking-wider">Loan Type</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['conventional', 'fha', 'va', 'usda'] as const).map((lt) => (
                <button
                  key={lt}
                  type="button"
                  onClick={() => {
                    setLoanType(lt)
                    const minPct = lt === 'fha' ? 3.5 : (lt === 'va' || lt === 'usda') ? 0 : 3
                    if (downpaymentType === 'percent' && downpaymentValue < minPct) setDownpaymentValue(minPct)
                  }}
                  className={clsx(
                    "py-2 rounded-xl text-xs font-bold text-center uppercase transition-all border",
                    loanType === lt ? "bg-brand-navy text-white border-brand-navy shadow-xs" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  )}
                >
                  {lt === 'conventional' ? 'Conv' : lt.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 mt-1 font-medium">
              {loanType === 'va' ? '✓ VA eligible: 0% down payment, no monthly PMI' :
               loanType === 'usda' ? '✓ USDA rural: 0% down payment, low monthly fees' :
               loanType === 'fha' ? 'Standard FHA: Min 3.5% down payment' :
               'Conventional loan: PMI required if down payment < 20%'}
            </p>
          </div>

          {/* Quick Down Payment Presets & Direct Input */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Down Payment</label>
              <div className="flex bg-gray-100 p-0.5 rounded-lg text-[10px] font-bold">
                <button onClick={() => setDownpaymentType('percent')} className={clsx("px-2 py-0.5 rounded-md", downpaymentType === 'percent' ? "bg-white text-gray-900 shadow-xs" : "text-gray-500")}>%</button>
                <button onClick={() => setDownpaymentType('dollar')} className={clsx("px-2 py-0.5 rounded-md", downpaymentType === 'dollar' ? "bg-white text-gray-900 shadow-xs" : "text-gray-500")}>$</button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {[20, 10, 5, 3.5].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => {
                    setDownpaymentType('percent')
                    setDownpaymentValue(pct)
                  }}
                  className={clsx(
                    "py-1.5 rounded-lg text-xs font-bold transition-all border",
                    downpaymentType === 'percent' && downpaymentValue === pct ? "bg-blue-600 text-white border-blue-600" : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                  )}
                >
                  {pct}%
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={downpaymentType === 'percent' ? 60 : (listing?.price || 1000000)}
                value={downpaymentValue}
                onChange={(e) => setDownpaymentValue(Math.max(0, Number(e.target.value)))}
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-xs font-bold text-gray-500">
                {downpaymentType === 'percent' ? `% ($${listing?.price ? Math.round(listing.price * (downpaymentValue / 100)).toLocaleString() : '0'})` : `$ (${downPercent}%)`}
              </span>
            </div>
          </div>

          {/* Interest Rate Stepper */}
          <div>
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1.5">Interest Rate</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.125"
                min="0.1"
                max="15"
                value={interestRate}
                onChange={(e) => setInterestRate(Number(e.target.value))}
                className="w-28 rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-xs font-bold text-gray-500">% per annum</span>
            </div>
          </div>

          {/* Taxes & HOA Inputs (Auto-populated from listing metadata) */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
            <div>
              <label className="text-[11px] font-bold text-gray-600 block mb-1">Annual Property Taxes</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-gray-400">$</span>
                <input
                  type="number"
                  value={propertyTaxes}
                  onChange={(e) => setPropertyTaxes(Math.min(100000, Math.max(0, Number(e.target.value))))}
                  className="w-full pl-7 pr-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-600 block mb-1">Monthly HOA / Common</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-gray-400">$</span>
                <input
                  type="number"
                  value={commonCharges}
                  onChange={(e) => setCommonCharges(Math.min(10000, Math.max(0, Number(e.target.value))))}
                  className="w-full pl-7 pr-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Breakdown Summary Box */}
          <div className="bg-blue-50/60 rounded-2xl p-4 border border-blue-100 space-y-2">
            <p className="text-[11px] font-extrabold text-blue-900 uppercase tracking-wide">Monthly Payment Breakdown</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-gray-700">
                <span>Principal & Interest (30yr fixed)</span>
                <span className="font-bold">${estimatedMonthlyPayment?.payment.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>Property Taxes (${propertyTaxes.toLocaleString()}/yr)</span>
                <span className="font-bold">${estimatedMonthlyPayment?.taxes.toLocaleString() || 0}/mo</span>
              </div>
              {(estimatedMonthlyPayment?.hoa || 0) > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>HOA / Common Charges</span>
                  <span className="font-bold">${estimatedMonthlyPayment?.hoa.toLocaleString()}/mo</span>
                </div>
              )}
              {(estimatedMonthlyPayment?.pmi || 0) > 0 && (
                <div className="flex justify-between text-amber-700 font-semibold">
                  <span>Mortgage Insurance (PMI)</span>
                  <span>${estimatedMonthlyPayment?.pmi.toLocaleString()}/mo</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-gray-900 border-t border-blue-200/80 pt-2 mt-1">
                <span>Total Estimated Payment</span>
                <span className="text-blue-700">${estimatedMonthlyPayment?.total.toLocaleString() || 0}/mo</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-100 text-right">
          <button
            onClick={() => setShowPaymentModal(false)}
            className="w-full bg-brand-navy hover:bg-slate-800 text-white font-extrabold py-3 rounded-xl text-xs transition-colors shadow-md"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  )

  if (!user || isPreview) {
    return <>{renderPublicView()}{paymentModal}{shareModal}</>
  }

  const embedUrl = getEmbedTourUrl()

  return (
    <Layout title={listing.address}>
      {/* Flyer printable styling */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          aside, header, nav, .no-print, button {
            display: none !important;
          }
          main, .main-content {
            margin: 0 !important;
            padding: 0 !important;
          }
          .flyer-view {
            display: block !important;
            max-width: 800px !important;
            margin: 0 auto !important;
            padding: 10px !important;
            font-family: serif !important;
          }
          .flyer-img {
            max-height: 400px !important;
            width: 100% !important;
            object-cover: cover !important;
          }
        }
      `}} />

      {/* Back button and tools */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 no-print">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              navigate(-1)
            } else {
              navigate('/inventory/mls')
            }
          }}
          className="rounded-xl p-2.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors shadow-sm bg-white border border-gray-200 flex items-center justify-center cursor-pointer"
          title="Go Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Responsive Workspace Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {user && !isPreview && (
            <>
              <button
                onClick={handleAddToDeals}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-extrabold bg-blue-600 text-white px-3.5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add to</span> Deals
              </button>
              <Link
                to={`/transactions/pipeline?search=${encodeURIComponent(listing.address)}`}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-white border border-gray-200 text-gray-700 px-3 py-2.5 rounded-xl hover:bg-gray-50 shadow-sm"
              >
                <ExternalLink className="h-3.5 w-3.5" /> <span className="hidden md:inline">View Deals</span>
              </Link>
              <button
                onClick={() => setShowShowingModal(true)}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-white border border-gray-200 text-gray-700 px-3 py-2.5 rounded-xl hover:bg-gray-50 shadow-sm"
              >
                <Clock className="h-3.5 w-3.5" /> <span className="hidden md:inline">Log</span> Showing
              </button>
              {presentation.showAffordability ? <button
                onClick={() => setShowPaymentModal(true)}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-white border border-gray-200 text-gray-700 px-3 py-2.5 rounded-xl hover:bg-gray-50 shadow-sm"
                title="Calculate Mortgage & Affordability"
              >
                <Calculator className="h-3.5 w-3.5 text-blue-600" /> <span className="hidden md:inline">Payment</span> Calc
              </button> : null}
              <button
                onClick={() => setShowShareModal(true)}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2.5 rounded-xl hover:bg-blue-100 shadow-sm"
              >
                <Send className="h-3.5 w-3.5" /> <span className="hidden md:inline">Share</span> Listing
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-white border border-gray-200 text-gray-700 px-3 py-2.5 rounded-xl hover:bg-gray-50 shadow-sm"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Preview <span className="hidden md:inline">Lead</span>
              </a>
              {(user && (['admin', 'broker'].includes(user.role) || isMyListing(listing, user))) && (
                <a
                  href={(listing as any).editUrl || `https://inventory.primeamericarealestate.com/listings/${listing.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-brand-navy hover:bg-brand-navy-light text-white px-3.5 py-2.5 rounded-xl shadow-sm transition-colors"
                  title="Edit full listing in Inventory Engine"
                >
                  <Edit3 className="h-3.5 w-3.5 text-brand-gold" /> <span className="hidden md:inline">Edit</span> Form
                </a>
              )}
            </>
          )}

          <button
            onClick={printFlyer}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-white border border-gray-200 text-gray-700 px-3 py-2.5 rounded-xl hover:bg-gray-50 shadow-sm"
          >
            <Printer className="h-3.5 w-3.5" /> Print <span className="hidden md:inline">Flyer</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flyer-view">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="w-full h-96 relative bg-black/5 group">
              {showingVirtualTour && embedUrl ? (
                embedUrl.includes('matterport') ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 px-6 text-center gap-4">
                    <div className="h-16 w-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
                      <Video className="h-8 w-8 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-white font-bold text-base">Interactive 3D Virtual Tour</p>
                      <p className="text-gray-400 text-xs mt-1">Opens in a new tab for the full immersive experience</p>
                    </div>
                    <a
                      href={embedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 bg-amber-400 hover:bg-amber-300 text-black font-extrabold px-6 py-3 rounded-xl text-sm transition-all shadow-xl"
                    >
                      <ExternalLink className="h-4 w-4" /> Launch 3D Tour
                    </a>
                    <button onClick={() => setShowingVirtualTour(false)} className="text-gray-500 hover:text-gray-300 text-xs">← Back to Photos</button>
                  </div>
                ) : (
                  <iframe
                    src={embedUrl}
                    title="Virtual Tour Player"
                    className="w-full h-full"
                    allowFullScreen
                    allow="xr-spatial-tracking; gyroscope; accelerometer; autoplay"
                  />
                )
              ) : activeMediaUrl ? (
                <img
                  src={resolveMediaUrl(activeMediaUrl, listing.id)}
                  alt={listing.address}
                  className="w-full h-full object-cover cursor-pointer hover:scale-[1.01] transition-transform duration-500 flyer-img"
                  onClick={() => setIsLightboxOpen(true)}
                />
              ) : (
                <div className="h-full w-full bg-brand-navy flex items-center justify-center text-white text-lg font-bold">
                  No Photo Available
                </div>
              )}

              {/* Hover Next/Prev buttons */}
              {!showingVirtualTour && listing.media && Array.isArray(listing.media) && listing.media.length > 1 && (
                <>
                  <button
                    onClick={handlePrevPhoto}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 border border-white/10 no-print"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleNextPhoto}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 border border-white/10 no-print"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}

              {!showingVirtualTour && <button
                onClick={() => setIsLightboxOpen(true)}
                className="absolute bottom-2.5 right-2.5 sm:bottom-6 sm:right-6 bg-black/60 hover:bg-black/85 text-white text-[10px] sm:text-xs font-bold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl flex items-center gap-1 sm:gap-1.5 transition-all shadow-md border border-white/10 no-print"
              >
                <Maximize2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Fullscreen Photos
              </button>}
            </div>

            {/* Photo Gallery Thumbnails + Virtual Tour Tab */}
            {(listing.media && Array.isArray(listing.media) && listing.media.length > 0 || embedUrl) && (
              <div className="flex gap-2.5 overflow-x-auto py-4 px-6 border-b border-gray-100 bg-gray-50/50 scrollbar-hide no-print">
                {listing.media && Array.isArray(listing.media) && listing.media.map((med: any) => {
                  const mediaSrc = resolveMediaUrl(med.mediaUrl, listing.id)
                  return (
                    <button
                      key={med.id}
                      onClick={() => { setActiveMediaUrl(med.mediaUrl); setShowingVirtualTour(false) }}
                      className={`h-14 w-20 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all ${
                        !showingVirtualTour && activeMediaUrl === med.mediaUrl ? 'border-blue-600 scale-95 shadow-md' : 'border-transparent hover:border-gray-200'
                      }`}
                    >
                      <img src={mediaSrc} alt="Property View" className="h-full w-full object-cover" />
                    </button>
                  )
                })}
                {embedUrl && (
                  <button
                    onClick={() => setShowingVirtualTour(true)}
                    className={`h-14 w-24 rounded-lg flex-shrink-0 border-2 flex flex-col items-center justify-center gap-1 transition-all ${
                      showingVirtualTour ? 'border-amber-400 bg-amber-400/10 scale-95 shadow-md' : 'border-amber-300/50 bg-gray-900/80 opacity-80 hover:opacity-100 hover:border-amber-400'
                    }`}
                  >
                    <Video className="h-4 w-4 text-amber-400" />
                    <span className="text-[9px] font-extrabold text-amber-400 uppercase tracking-wider">3D Tour</span>
                  </button>
                )}
              </div>
            )}

            <div className="p-6 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{displayStreet || listing.address}</h1>
                  <p className="text-gray-500 flex items-center gap-1 mt-1">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    {listing.city}, {listing.state} {listing.zip}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-extrabold text-gray-900">
                    {presentation.primaryFacts[0]?.value || 'Not provided'}
                  </p>
                  <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 uppercase">
                    {presentation.label}
                  </span>
                </div>
              </div>

              {/* Specs */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                {presentation.primaryFacts.slice(0, 6).map((item) => (
                  <div key={item.id} className="rounded-lg bg-white border border-gray-100 p-3">
                    <p className="text-[10px] text-gray-400 uppercase">{item.label}</p>
                    <p className="text-sm font-bold text-gray-800 capitalize">{item.value}</p>
                  </div>
                ))}
              </div>

              <div>
                <h3 className="font-bold text-gray-800 mb-2">Property Description</h3>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line border-b border-gray-150 pb-4">
                  {listing.description || 'No description provided.'}
                </p>
              </div>

              {/* Facts & Features */}
              {presentation.sections.length > 0 ? (
                <div className="pt-6 mt-6 border-t border-gray-150 space-y-6">
                  <h3 className="font-bold text-gray-900 text-xl flex items-center gap-2">
                    <Grid className="h-5 w-5 text-gray-400" /> {presentation.label} Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {presentation.sections.map((section) => (
                      <div key={section.title} className="space-y-3">
                        <h4 className="font-semibold text-gray-800 text-sm uppercase tracking-wide border-b border-gray-100 pb-1.5">{section.title}</h4>
                        <ul className="space-y-2">
                          {section.facts.map((item) => (
                            <li key={item.id} className="flex flex-col text-sm">
                              <span className="text-gray-500 font-medium">{item.label}</span>
                              <span className="text-gray-900 leading-tight mt-0.5">{item.value}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Open House Schedule Banner */}
              {upcomingOpenHouses.length > 0 && (
                <div className="bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-100 rounded-2xl p-5 space-y-3 font-sans shadow-sm no-print">
                  <div>
                    <h3 className="font-bold text-rose-800 text-base flex items-center gap-2">
                      <Calendar className="h-4.5 w-4.5 text-rose-600" /> Upcoming Open Houses
                    </h3>
                  </div>
                  <div className="space-y-2 text-xs text-gray-700">
                    {upcomingOpenHouses.map((oh) => (
                      <div key={oh.id} className="bg-white/80 rounded-xl p-3.5 border border-rose-100/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="font-bold text-gray-800">{oh.title}</p>
                          <div className="flex flex-wrap items-center gap-3 mt-1 text-gray-500">
                            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(oh.start_time).toLocaleString()}</span>
                            <span>Host: {oh.agent_name}</span>
                          </div>
                        </div>
                        <a
                          href={`https://openhouse.primeamericarealestate.com/e/${oh.public_token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm"
                        >
                          Visitor Sign-In
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Location & Neighborhood Map */}
              <div className="pt-6 mt-6 border-t border-gray-150 space-y-4 no-print">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 text-xl flex items-center gap-2">
                    <Compass className="h-5 w-5 text-gray-400" /> Location & Neighborhood
                  </h3>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    Walk Score: {getDynamicWalkScore(listing.zip, listing.city)}/100
                  </span>
                </div>
                <div className="h-96 rounded-2xl overflow-hidden border border-gray-200 shadow-sm relative">
                  <ListingMap
                    address={listing.address}
                    city={listing.city}
                    zip={listing.zip}
                    customLat={effectiveMapCoords?.lat ?? mapSettings?.lat}
                    customLng={effectiveMapCoords?.lng ?? mapSettings?.lng}
                    allowedCategories={mapSettings?.categories}
                  />
                </div>
              </div>

              {/* Virtual Tour — now shown inline in photo gallery thumbnail strip above */}
            </div>
          </div>
        </div>

        {/* Lead Inquiry & Agent sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Listing Agent info */}
          {listingAgentInfo.name && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm text-center">
              <img
                src={companyLogoUrl || '/prime-america-seal.png'}
                alt={companyName}
                className="h-16 w-16 rounded-2xl object-contain bg-white border border-gray-100 mx-auto mb-3 p-1 shadow-xs"
              />
              <h3 className="font-bold text-gray-800 text-lg">{listingAgentInfo.name}</h3>
              <p className="text-xs text-gray-500 capitalize">Listing Agent • {listingAgentInfo.brokerage || companyName}</p>
              <div className="mt-4 pt-3 border-t border-gray-100 text-left space-y-2 text-xs">
                {listingAgentInfo.email && (
                  <p className="flex items-center gap-2 text-gray-600">
                    <Mail className="h-3.5 w-3.5" /> {listingAgentInfo.email}
                  </p>
                )}
                {listingAgentInfo.phone && (
                  <p className="flex items-center gap-2 text-gray-600">
                    <Phone className="h-3.5 w-3.5" /> {listingAgentInfo.phone}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Inquiry form */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm no-print">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-1.5">
              <Send className="h-4 w-4 text-blue-600" /> Request Information
            </h3>
            <form onSubmit={handleSendLead} className="space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Your Name</label>
                <input required value={leadName} onChange={e => setLeadName(e.target.value)} placeholder="Jane Doe" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Email Address</label>
                <input required type="email" value={leadEmail} onChange={e => setLeadEmail(e.target.value)} placeholder="jane@email.com" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Phone Number</label>
                <input required type="tel" value={leadPhone} onChange={e => setLeadPhone(e.target.value)} placeholder="555-0199" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-gray-400 block mb-0.5">Message</label>
                <textarea rows={3} value={leadMessage} onChange={e => setLeadMessage(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <button
                type="submit"
                disabled={isSubmittingLead}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors"
              >
                {isSubmittingLead ? 'Submitting...' : 'Submit Inquiry'}
              </button>
            </form>
          </div>


        </div>
      </div>

      {showShowingModal && listing && <ShowingSchedulerModal listing={listing} agentName={user?.name} onClose={() => setShowShowingModal(false)} onViewHistory={() => {setShowShowingModal(false);setShowShowingHistory(true)}} />}
      {showShowingHistory && listing && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Listing inquiries and showings">
          <div className="mx-auto max-w-3xl my-8 rounded-2xl bg-white p-4">
            <button className="mb-3 rounded-lg border px-3 py-2 text-sm" onClick={() => setShowShowingHistory(false)}>Close</button>
            <ListingInquiriesPanel listing={listing} />
          </div>
        </div>
      )}

      {paymentModal}
      {shareModal}
    </Layout>
  )
}

function getDeterministicCoords(address: string, city: string, zip: string) {
  let lat = 40.758896
  let lng = -73.985130

  const lowerCity = (city || '').toLowerCase()
  if (lowerCity.includes('brooklyn')) {
    lat = 40.6782
    lng = -73.9442
  } else if (lowerCity.includes('queens')) {
    lat = 40.7282
    lng = -73.7949
  } else if (lowerCity.includes('miami')) {
    lat = 25.7617
    lng = -80.1918
  } else if (lowerCity.includes('los angeles') || lowerCity.includes('la')) {
    lat = 34.0522
    lng = -118.2437
  } else if (lowerCity.includes('chicago')) {
    lat = 41.8781
    lng = -87.6298
  }

  // minor deterministic offset so every address has its own marker offset
  let hash = 0
  const str = (address || '') + (zip || '')
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const latOffset = ((hash % 100) / 15000) * (hash % 2 === 0 ? 1 : -1)
  const lngOffset = (((hash >> 8) % 100) / 15000) * (hash % 3 === 0 ? 1 : -1)

  return { lat: lat + latOffset, lng: lng + lngOffset }
}

function getDynamicWalkScore(zip: string, city: string): number {
  const z = parseInt((zip || '00000').replace(/\D/g, '').slice(0, 5), 10) || 0
  const lowerCity = (city || '').toLowerCase()

  // Base score by area type
  let base = 60
  if (
    lowerCity.includes('new york') || lowerCity.includes('brooklyn') ||
    lowerCity.includes('queens') || lowerCity.includes('manhattan') ||
    lowerCity.includes('bronx') || lowerCity.includes('astoria') ||
    lowerCity.includes('flushing') || lowerCity.includes('jamaica') ||
    lowerCity.includes('middle village') || lowerCity.includes('ridgewood') ||
    lowerCity.includes('forest hills') || lowerCity.includes('jackson heights') ||
    lowerCity.includes('long island city') || lowerCity.includes('astoria')
  ) {
    base = 88
  } else if (
    lowerCity.includes('jersey city') || lowerCity.includes('hoboken') ||
    lowerCity.includes('newark') || lowerCity.includes('chicago') ||
    lowerCity.includes('philadelphia') || lowerCity.includes('boston') ||
    lowerCity.includes('washington') || lowerCity.includes('san francisco') ||
    lowerCity.includes('miami') || lowerCity.includes('seattle')
  ) {
    base = 80
  } else if (
    lowerCity.includes('los angeles') || lowerCity.includes('houston') ||
    lowerCity.includes('dallas') || lowerCity.includes('phoenix') ||
    lowerCity.includes('san diego') || lowerCity.includes('denver') ||
    lowerCity.includes('atlanta') || lowerCity.includes('charlotte')
  ) {
    base = 52
  }

  // Zip-based deterministic offset ±8 so each listing gets a unique score
  const zipHash = (z * 2654435761) >>> 0
  const offset = (zipHash % 17) - 8

  return Math.min(99, Math.max(20, base + offset))
}

// ─────────────────────────────────────────────────────────────────────────────
// NEIGHBORHOOD MAP COMPONENT (LEAFLET DYNAMIC LOADER)
// ─────────────────────────────────────────────────────────────────────────────
interface ListingMapProps {
  address: string
  city: string
  zip: string
  customLat?: number | null
  customLng?: number | null
  allowedCategories?: string[] | null
}

function ListingMap({ address, city, zip, customLat, customLng, allowedCategories }: ListingMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [mapInstance, setMapInstance] = useState<any>(null)
  const [leafletLoaded, setLeafletLoaded] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [hoveredAmenityId, setHoveredAmenityId] = useState<string | null>(null)
  const [amenities, setAmenities] = useState<any[]>([])
  const [amenitiesLoading, setAmenitiesLoading] = useState(false)
  const [amenitiesAvailable, setAmenitiesAvailable] = useState<boolean | null>(null)
  const markersRef = useRef<any[]>([])
  const listingMarkerRef = useRef<any | null>(null)

  // Load Leaflet dynamically from CDN
  useEffect(() => {
    if ((window as any).L) {
      setLeafletLoaded(true)
      return
    }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => setLeafletLoaded(true)
    document.body.appendChild(script)
  }, [])

  const coords = useMemo(() => {
    if (customLat !== null && customLat !== undefined && customLng !== null && customLng !== undefined) {
      return { lat: customLat, lng: customLng }
    }
    return getDeterministicCoords(address, city, zip)
  }, [address, city, zip, customLat, customLng])

  function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (d: number) => d * Math.PI / 180
    const R = 3958.8
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  function mapAmenityCategory(tags: any) {
    const amenity = String(tags?.amenity || '').toLowerCase()
    const shop = String(tags?.shop || '').toLowerCase()
    const leisure = String(tags?.leisure || '').toLowerCase()
    const railway = String(tags?.railway || '').toLowerCase()
    const publicTransport = String(tags?.public_transport || '').toLowerCase()
    const highway = String(tags?.highway || '').toLowerCase()

    if (['cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream'].includes(amenity)) return 'food'
    if (['supermarket', 'convenience', 'greengrocer', 'mall'].includes(shop)) return 'groceries'
    if (['station', 'subway_entrance', 'tram_stop', 'bus_station', 'bus_stop'].includes(amenity) || ['station', 'subway_entrance', 'tram_stop'].includes(railway) || ['stop_position', 'platform'].includes(publicTransport) || highway === 'bus_stop') return 'transit'
    if (['park', 'playground', 'pitch', 'fitness_centre', 'sports_centre'].includes(leisure) || ['park', 'fitness_centre'].includes(amenity)) return 'parks'
    if (['school', 'college', 'university', 'kindergarten', 'library'].includes(amenity)) return 'education'
    return null
  }

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function fetchAmenities() {
      setAmenitiesLoading(true)
      setAmenitiesAvailable(null)
      const timeoutId = setTimeout(() => controller.abort(), 12000)
      try {
        const res = await fetch(`/api/public/amenities?lat=${coords.lat}&lng=${coords.lng}&radius=1000`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('Amenities service unavailable')
        const data = await res.json()
        if (!cancelled) setAmenitiesAvailable(data?.available !== false)

        const rows = Array.isArray(data?.elements) ? data.elements : []
        const mapped = rows
          .map((el: any) => {
            const lat = el.lat ?? el.center?.lat
            const lng = el.lon ?? el.center?.lon
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
            const category = mapAmenityCategory(el.tags)
            if (!category) return null
            if (allowedCategories?.length && !allowedCategories.includes(category)) return null
            const dist = haversineMiles(coords.lat, coords.lng, lat, lng)
            const name = el.tags?.name || el.tags?.brand || (el.tags?.railway === 'subway_entrance' ? 'Subway Entrance' : 'Nearby place')
            const type = el.tags?.facility_type || el.tags?.amenity || el.tags?.shop || el.tags?.leisure || el.tags?.railway || 'location'
            return {
              id: `${el.type}_${el.id}`,
              name,
              category,
              type,
              dist: Math.round(dist * 100) / 100,
              lat,
              lng,
            }
          })
          .filter(Boolean)
          .sort((a: any, b: any) => a.dist - b.dist)
          .slice(0, 30)

        if (!cancelled) setAmenities(mapped)
      } catch (e: any) {
        if (e.name !== 'AbortError' && !cancelled) {
          console.warn('Could not load nearby amenities:', e.message || e)
        }
        if (!cancelled) {
          setAmenities([])
          setAmenitiesAvailable(false)
        }
      } finally {
        clearTimeout(timeoutId)
        if (!cancelled) setAmenitiesLoading(false)
      }
    }

    fetchAmenities()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [coords.lat, coords.lng, allowedCategories?.join('|')])

  // Initialize Map
  useEffect(() => {
    if (!leafletLoaded || !mapRef.current || mapInstance) return

    const L = (window as any).L
    const map = L.map(mapRef.current, {
      zoomControl: false,
      scrollWheelZoom: false,
    }).setView([coords.lat, coords.lng], 15)

    // OpenStreetMap standard tiles (clean, reliable, no API key required)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map)

    L.control.zoom({ position: 'bottomright' }).addTo(map)

    // Custom CSS div icon for target listing home pin
    const listingIcon = L.divIcon({
      className: 'custom-home-icon',
      html: `<div class="w-9 h-9 bg-blue-600 border-2 border-white text-white rounded-full flex items-center justify-center shadow-lg transform -translate-x-1/2 -translate-y-1/2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
             </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    })
    listingMarkerRef.current = L.marker([coords.lat, coords.lng], { icon: listingIcon }).addTo(map)
    listingMarkerRef.current.bindPopup(`<strong class="text-sm font-bold">${address}</strong><br/>Listing Location`)

    setMapInstance(map)

    return () => {
      if (map) map.remove()
    }
  }, [leafletLoaded])

  useEffect(() => {
    if (!mapInstance) return
    const L = (window as any).L
    mapInstance.setView([coords.lat, coords.lng], mapInstance.getZoom() || 15)
    if (!listingMarkerRef.current) {
      const listingIcon = L.divIcon({
        className: 'custom-home-icon',
        html: `<div class="w-9 h-9 bg-blue-600 border-2 border-white text-white rounded-full flex items-center justify-center shadow-lg transform -translate-x-1/2 -translate-y-1/2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
               </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })
      listingMarkerRef.current = L.marker([coords.lat, coords.lng], { icon: listingIcon }).addTo(mapInstance)
    } else {
      listingMarkerRef.current.setLatLng([coords.lat, coords.lng])
    }
    listingMarkerRef.current.bindPopup(`<strong class="text-sm font-bold">${address}</strong><br/>Listing Location`)
  }, [mapInstance, coords.lat, coords.lng, address])

  // Update Markers based on Category Filter
  useEffect(() => {
    if (!mapInstance) return
    const L = (window as any).L

    // Clear old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const filtered = amenities.filter(item => selectedCategory === 'all' || item.category === selectedCategory)

    filtered.forEach(item => {
      let iconColor = 'bg-emerald-500'
      let iconSvg = ''

      if (item.category === 'food') {
        iconColor = 'bg-orange-500'
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="14" y1="2" y2="2"/></svg>`
      } else if (item.category === 'groceries') {
        iconColor = 'bg-emerald-600'
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>`
      } else if (item.category === 'parks') {
        iconColor = 'bg-teal-500'
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22v-8"/><path d="M9 12H4.5a2.5 2.5 0 0 1 0-5h13a2.5 2.5 0 0 1 0 5H15"/></svg>`
      } else if (item.category === 'transit') {
        iconColor = 'bg-blue-500'
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m16 19 2 3"/></svg>`
      } else if (item.category === 'education') {
        iconColor = 'bg-purple-500'
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>`
      }

      const divHtml = `<div class="w-7 h-7 ${iconColor} border-2 border-white text-white rounded-full flex items-center justify-center shadow-md transform -translate-x-1/2 -translate-y-1/2 hover:scale-110 transition-transform">
        ${iconSvg}
      </div>`

      const markerIcon = L.divIcon({
        className: 'amenity-div-icon',
        html: divHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })

      const marker = L.marker([item.lat, item.lng], { icon: markerIcon })
        .addTo(mapInstance)
        .bindPopup(`<strong>${item.name}</strong><br/>${item.type} (${item.dist} mi)`)

      markersRef.current.push(marker)
    })
  }, [mapInstance, selectedCategory, amenities])

  const focusAmenity = (item: any) => {
    if (!mapInstance) return
    mapInstance.setView([item.lat, item.lng], 16)
    const marker = markersRef.current.find(m => {
      const pos = m.getLatLng()
      return Math.abs(pos.lat - item.lat) < 0.0001 && Math.abs(pos.lng - item.lng) < 0.0001
    })
    if (marker) {
      marker.openPopup()
    }
  }

  const categories = [
    { key: 'all', label: 'All Nearby' },
    { key: 'food', label: '☕ Food' },
    { key: 'groceries', label: '🍏 Groceries' },
    { key: 'transit', label: '🚇 Transit' },
    { key: 'parks', label: '🌳 Parks' },
    { key: 'education', label: '🏫 Education' },
  ].filter(cat => cat.key === 'all' || !allowedCategories?.length || allowedCategories.includes(cat.key))

  const filteredAmenities = amenities.filter(item => selectedCategory === 'all' || item.category === selectedCategory)

  return (
    <div className="bg-white border border-gray-150 rounded-3xl overflow-hidden shadow-lg flex flex-col md:flex-row h-[400px] font-sans">
      <div className="w-full md:w-3/5 h-[200px] md:h-full relative bg-gray-50">
        <div ref={mapRef} className="w-full h-full z-10" />
        {!leafletLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100/90 z-20 text-xs font-semibold text-gray-500">
            Loading Neighborhood Map...
          </div>
        )}
      </div>
      <div className="w-full md:w-2/5 flex flex-col h-[200px] md:h-full bg-white border-t md:border-t-0 md:border-l border-gray-150 p-4">
        <h4 className="font-bold text-gray-800 text-xs mb-2.5 uppercase tracking-wider flex items-center gap-1.5">
          <Compass className="h-4.5 w-4.5 text-blue-600" />
          Hyper-Local Amenities
        </h4>
        {amenitiesLoading && (
          <p className="text-[11px] text-gray-400 mb-2">Loading nearby amenities from map providers...</p>
        )}
        <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-hide flex-shrink-0">
          {categories.map(cat => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(cat.key)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap border transition-all ${selectedCategory === cat.key ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/20' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-gray-600'}`}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 mt-1 scrollbar-hide">
          {filteredAmenities.length === 0 ? (
            <div className="text-center py-8 text-xs text-gray-400">
              {amenitiesLoading ? 'Loading nearby places…' : amenitiesAvailable === false ? 'Nearby places are temporarily unavailable.' : 'No matching amenities found.'}
            </div>
          ) : (
            filteredAmenities.map(item => (
              <button
                key={item.id}
                onClick={() => focusAmenity(item)}
                onMouseEnter={() => setHoveredAmenityId(item.id)}
                onMouseLeave={() => setHoveredAmenityId(null)}
                className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center justify-between text-xs ${hoveredAmenityId === item.id ? 'bg-blue-50/50 border-blue-150 scale-[1.01]' : 'bg-gray-50/40 border-gray-100 hover:bg-gray-50'}`}
              >
                <div>
                  <p className="font-bold text-gray-800 leading-snug">{item.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{item.type}</p>
                </div>
                <span className="bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap">
                  {item.dist} mi
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTAGRAM STORY VIEWER COMPONENT FOR MOBILE
// ─────────────────────────────────────────────────────────────────────────────
interface ListingStoryViewProps {
  listing: any
  displayStreet?: string
  agent: any
  listingAgent: { name: string; email: string; phone: string; brokerage: string }
  isSharedLeadView?: boolean
  complianceDisclaimer: string
  mapSettings: { lat: number | null, lng: number | null, categories: string[] | null } | null
  effectiveMapCoords?: { lat: number | null; lng: number | null }
  listingAreas: Array<{ label: string; value: string }>
  listingSchools: Array<{ type: string; name: string }>
  mediaList: any[]
  activeIndex: number
  handleNextPhoto: () => void
  handlePrevPhoto: () => void
  embedUrl: string | null
  isStoryPaused: boolean
  setIsStoryPaused: (paused: boolean) => void
  activeStorySlide: number
  setActiveStorySlide: (slide: number) => void
  companyLogoUrl: string | null
  companyName: string
  onOpenInquiry: (l: any) => void
  onPrintFlyer?: () => void
}

function ListingStoryView({
  listing,
  displayStreet,
  agent,
  listingAgent,
  isSharedLeadView,
  mapSettings,
  effectiveMapCoords,
  listingAreas,
  listingSchools,
  mediaList,
  isStoryPaused,
  setIsStoryPaused,
  activeStorySlide,
  setActiveStorySlide,
  companyLogoUrl,
  companyName,
  onOpenInquiry,
  onPrintFlyer
}: ListingStoryViewProps) {
  const slideCount = 6
  const presentation = useMemo(() => getListingPresentation(listing), [listing])
  const [showFullDesc, setShowFullDesc] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  // Dynamic payment calculator state for Story Mode slide 3
  const [storyDownPct, setStoryDownPct] = useState(20)
  const [storyRate, setStoryRate] = useState(6.5)

  const calculatedMonthly = useMemo(() => {
    const price = listing.price || 0
    if (!price) return null
    const downAmount = price * (storyDownPct / 100)
    const loanAmount = price - downAmount
    const monthlyRate = storyRate / 100 / 12
    const n = 360
    const pAndI = loanAmount > 0 ? (loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, n))) / (Math.pow(1 + monthlyRate, n) - 1) : 0
    const record = listing?.raw?.data || listing?.raw || {}
    const annualTaxes = Number(firstNonEmpty(record.TaxAnnualAmount, record.taxAnnualAmount, listing.monthly_taxes ? listing.monthly_taxes * 12 : 0))
    const taxes = Number.isFinite(annualTaxes) && annualTaxes > 0 ? Math.round(annualTaxes / 12) : 0
    const total = Math.round(pAndI + taxes)
    return { pAndI: Math.round(pAndI), taxes, total, includesTaxes: taxes > 0 }
  }, [listing.price, storyDownPct, storyRate])

  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const [photoOffset, setPhotoOffset] = useState<number>(0)
  const isSwipingRef = useRef<boolean>(false)

  const currentPhotoIdx = (activeStorySlide + photoOffset) % Math.max(1, mediaList.length)
  const currentPhotoObj = mediaList[currentPhotoIdx]
  const storyPhotoSrc = resolveMediaUrl(currentPhotoObj?.mediaUrl, listing?.id) || 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80'

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX)
    isSwipingRef.current = false
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentX = e.targetTouches[0].clientX
    setTouchEnd(currentX)
    if (touchStart !== null && Math.abs(touchStart - currentX) > 15) {
      isSwipingRef.current = true
    }
  }

  const handleTouchEnd = () => {
    if (touchStart === null || touchEnd === null) {
      setTouchStart(null)
      setTouchEnd(null)
      return
    }
    const distance = touchStart - touchEnd
    if (distance > 35) {
      // Swiped left -> Next photo ONLY (does not advance story slide)
      setPhotoOffset((prev) => prev + 1)
      isSwipingRef.current = true
    } else if (distance < -35) {
      // Swiped right -> Prev photo ONLY (does not rewind story slide)
      setPhotoOffset((prev) => (prev > 0 ? prev - 1 : mediaList.length - 1))
      isSwipingRef.current = true
    }
    setTouchStart(null)
    setTouchEnd(null)
  }

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isSwipingRef.current) {
      isSwipingRef.current = false
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const width = rect.width
    if (x < width * 0.3) {
      setActiveStorySlide(activeStorySlide > 0 ? activeStorySlide - 1 : slideCount - 1)
    } else {
      setActiveStorySlide(activeStorySlide < slideCount - 1 ? activeStorySlide + 1 : 0)
    }
  }

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `${listing.address} | Prime America Real Estate`,
        text: `Check out ${listing.address} listed for $${listing.price?.toLocaleString()}!`,
        url: window.location.href,
      }).catch(() => {})
    } else {
      navigator.clipboard.writeText(window.location.href)
      alert('Listing link copied to clipboard!')
    }
  }

  const dynamicStandoutFeatures = useMemo(() => {
    return presentation.primaryFacts.slice(1, 5).map((item) => ({ category: item.label, value: item.value }))
  }, [presentation])

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative h-[calc(100vh-48px)] w-full bg-black text-white overflow-hidden flex flex-col font-sans select-none"
    >
      {/* Background visual blur layer */}
      <div className="absolute inset-0 z-0">
        <img src={storyPhotoSrc} alt="Story Background" className="w-full h-full object-cover filter blur-2xl opacity-40 scale-120" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/90 z-1" />
      </div>

      {/* Top Header - Progress segments & Logo */}
      <div className="relative z-20 p-3.5 space-y-2.5 flex-shrink-0 bg-gradient-to-b from-black/90 to-transparent">
        {/* Progress bar */}
        <div className="flex gap-1">
          {Array.from({ length: slideCount }).map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => { e.stopPropagation(); setActiveStorySlide(idx); }}
              className="h-3 -my-1 py-1 flex-1 overflow-hidden focus:outline-none flex items-center"
              aria-label={`Slide ${idx + 1}`}
            >
              <div className="h-1 w-full bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-[5000ms] ease-linear"
                  style={{
                    width: idx < activeStorySlide ? '100%' : idx === activeStorySlide && !isStoryPaused ? '100%' : '0%',
                    transitionDuration: idx === activeStorySlide && !isStoryPaused ? '5000ms' : '0s'
                  }}
                />
              </div>
            </button>
          ))}
        </div>

        {/* Branding header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img
              src={companyLogoUrl || '/prime-america-seal.png'}
              alt={companyName}
              className="h-7 w-7 rounded-full object-contain bg-white/90 p-0.5 border border-white/20"
            />
            <div>
              <p className="text-xs font-bold text-white leading-none">{companyName}</p>
              <p className="text-[8px] text-amber-300/90 font-bold uppercase tracking-wider mt-0.5">Prime America Real Estate, Inc.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onPrintFlyer && (
              <button
                onClick={(e) => { e.stopPropagation(); onPrintFlyer(); }}
                className="text-[9px] bg-white/10 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider text-gray-300 hover:text-white border border-white/10 flex items-center gap-1"
                title="Print Property Flyer"
              >
                <Printer className="h-3 w-3" /> Print
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setIsStoryPaused(!isStoryPaused); }}
              className="text-[9px] bg-white/10 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider text-gray-300 hover:text-white border border-white/10"
            >
              {isStoryPaused ? '▶ Play' : '❚❚ Pause'}
            </button>
          </div>
        </div>
      </div>

      {/* Immersive slide tap container */}
      <div
        onClick={handleTap}
        className="relative z-10 flex-1 flex flex-col justify-center items-center px-5 text-center select-none cursor-pointer overflow-y-auto"
      >
        {/* SLIDE 0: Hero & Primary Specs */}
        {activeStorySlide === 0 && (
          <div className="w-full max-w-sm animate-fade-in-up space-y-4">
            <div className="aspect-[4/3] rounded-3xl overflow-hidden border border-white/15 shadow-2xl relative">
              <img src={storyPhotoSrc} alt={listing.address} className="w-full h-full object-cover" />
              <div className="absolute top-3 left-3 bg-blue-600 text-white font-extrabold text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                For {listing.propertyType || 'Sale'}
              </div>
              <div className="absolute bottom-3 right-3 bg-black/70 text-white font-bold text-[10px] px-2.5 py-1 rounded-xl backdrop-blur-md border border-white/10 flex items-center gap-1.5">
                <span>{currentPhotoIdx + 1} of {Math.max(1, mediaList.length)} photos</span>
                <span className="text-[9px] text-amber-400"> (Swipe ← →)</span>
              </div>
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-serif text-white tracking-wide font-black leading-snug drop-shadow-lg">
                {displayStreet || listing.address}
              </h2>
              <p className="text-xs text-gray-300 flex items-center justify-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-amber-400" />
                {listing.city || ''}, {listing.state || 'NY'} {listing.zip || ''}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3.5 shadow-xl">
              <div>
                <p className="text-[8.5px] text-gray-300 font-bold uppercase tracking-wider">{presentation.priceLabel}</p>
                <p className="text-base font-black text-amber-400 mt-0.5">{presentation.primaryFacts[0]?.value || 'Not provided'}</p>
              </div>
              <div className="border-l border-white/15">
                <p className="text-[8.5px] text-gray-300 font-bold uppercase tracking-wider">{presentation.primaryFacts[1]?.label || 'Listing Type'}</p>
                <p className="text-base font-black text-white mt-0.5 capitalize">{presentation.primaryFacts[1]?.value || presentation.label}</p>
              </div>
              <div className="border-l border-white/15">
                <p className="text-[8.5px] text-gray-300 font-bold uppercase tracking-wider">{presentation.primaryFacts[2]?.label || 'Property Type'}</p>
                <p className="text-base font-black text-white mt-0.5">{presentation.primaryFacts[2]?.value || presentation.label}</p>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 1: Agent Introduction Card (Surfaced Early) */}
        {activeStorySlide === 1 && (
          <div className="w-full max-w-sm animate-fade-in-up space-y-4">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">Presented Exclusively By</h3>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl p-5 space-y-4 text-center shadow-2xl">
              {agent?.avatarUrl ? (
                <img src={agent.avatarUrl} alt={agent.name} className="h-16 w-16 rounded-full object-cover border-2 border-amber-400 bg-white mx-auto shadow-md" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-blue-900 border-2 border-amber-400 text-white font-black text-lg flex items-center justify-center mx-auto shadow-md">
                  {(listingAgent?.name || agent?.name || 'S')[0]}
                </div>
              )}

              <div>
                <h4 className="font-extrabold text-white text-lg leading-snug">{listingAgent?.name || agent?.name || ''}</h4>
                <p className="text-xs text-amber-300 font-bold mt-0.5">{isSharedLeadView ? 'Presented By' : 'Listing Agent'} • {listingAgent?.brokerage || companyName}</p>
                {agent?.license_number && <p className="text-[10px] text-gray-300 mt-1">License: {agent.license_number} ({agent?.license_state || 'NY'})</p>}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
                {(listingAgent?.phone || agent?.phone) ? (
                  <a
                    href={`tel:${listingAgent?.phone || agent?.phone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Phone className="h-4 w-4" /> Tap to Call
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenInquiry(listing); }}
                    className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Phone className="h-4 w-4" /> Request Info
                  </button>
                )}

                {(listingAgent?.email || agent?.email) ? (
                  <a
                    href={`mailto:${listingAgent?.email || agent?.email}`}
                    onClick={(e) => e.stopPropagation()}
                    className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Mail className="h-4 w-4" /> Tap to Email
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenInquiry(listing); }}
                    className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <Mail className="h-4 w-4" /> Message
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 2: Standout Features & Punchy Highlights */}
        {activeStorySlide === 2 && (
          <div className="w-full max-w-sm animate-fade-in-up space-y-4 text-left">
            <h3 className="text-base font-serif font-black text-white text-center">{presentation.highlightTitle}</h3>

            <div className="grid grid-cols-2 gap-2.5">
              {dynamicStandoutFeatures.map((feat, i) => (
                <div key={i} className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3.5">
                  <p className="text-[9px] text-amber-400 font-extrabold uppercase tracking-wider">{feat.category}</p>
                  <p className="text-xs font-bold text-white mt-1 capitalize">{feat.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 space-y-2 max-h-48 overflow-y-auto">
              <p className="text-xs text-gray-200 leading-relaxed">
                {showFullDesc ? listing.description : `${(listing.description || '').substring(0, 180)}${(listing.description || '').length > 180 ? '...' : ''}`}
              </p>
              {(listing.description || '').length > 180 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setShowFullDesc(!showFullDesc); }}
                  className="text-xs font-bold text-amber-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  {showFullDesc ? 'Show less' : 'Read full description ↗'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* SLIDE 3: Profile-specific financial or listing details */}
        {activeStorySlide === 3 && presentation.showAffordability && (
          <div className="w-full max-w-sm animate-fade-in-up space-y-4 text-left">
            <h3 className="text-base font-serif font-black text-white text-center flex items-center justify-center gap-1.5">
              <Calculator className="h-4 w-4 text-amber-400" /> Interactive Affordability
            </h3>

            <div
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              className="bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl p-4 space-y-3.5"
            >
              <div className="text-center bg-black/40 rounded-2xl p-3 border border-white/10">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Est. Monthly Payment</p>
                <p className="text-2xl font-black text-amber-400 mt-0.5">
                  ${calculatedMonthly ? calculatedMonthly.total.toLocaleString() : '—'}<span className="text-xs text-gray-300 font-normal">/mo</span>
                </p>
                <p className="text-[10px] text-gray-300 mt-1">
                  ${calculatedMonthly?.pAndI.toLocaleString()} P&amp;I
                  {calculatedMonthly?.includesTaxes ? ` + $${calculatedMonthly.taxes.toLocaleString()} taxes` : ' · taxes not included'}
                </p>
              </div>

              {/* Down Payment % Chips */}
              <div>
                <label className="text-[10px] font-bold text-gray-300 uppercase tracking-wider block mb-1">
                  Down Payment: <span className="text-amber-400 font-bold">{storyDownPct}% (${listing.price ? Math.round(listing.price * (storyDownPct / 100)).toLocaleString() : '0'})</span>
                </label>
                <div className="flex gap-1.5">
                  {[3.5, 10, 20, 30].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setStoryDownPct(pct)}
                      className={clsx(
                        "flex-1 py-1.5 rounded-xl text-xs font-bold transition-all border",
                        storyDownPct === pct ? "bg-amber-400 text-black border-amber-400 shadow-sm" : "bg-white/10 text-white border-white/10 hover:bg-white/20"
                      )}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Interest Rate Slider */}
              <div>
                <div className="flex justify-between text-[10px] font-bold text-gray-300 uppercase">
                  <span>Interest Rate</span>
                  <span className="text-amber-400 font-bold">{storyRate}%</span>
                </div>
                <input
                  type="range"
                  min="4.0"
                  max="9.0"
                  step="0.25"
                  value={storyRate}
                  onChange={(e) => setStoryRate(Number(e.target.value))}
                  className="w-full mt-1.5 accent-amber-400 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {activeStorySlide === 3 && !presentation.showAffordability && (
          <div className="w-full max-w-sm animate-fade-in-up space-y-4 text-left">
            <h3 className="text-base font-serif font-black text-white text-center">{presentation.label} Details</h3>
            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {presentation.sections.length > 0 ? presentation.sections.map((section) => (
                <div key={section.title}>
                  <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 mb-2">{section.title}</h4>
                  <dl className="space-y-2">
                    {section.facts.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-3 border-b border-white/10 pb-2 text-xs">
                        <dt className="text-gray-300">{item.label}</dt>
                        <dd className="font-bold text-white text-right">{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )) : (
                <p className="text-xs text-gray-300 text-center">Additional verified details have not been provided.</p>
              )}
            </div>
          </div>
        )}

        {/* SLIDE 4: Neighborhood & Map */}
        {activeStorySlide === 4 && (
          <div className="w-full max-w-sm animate-fade-in-up space-y-3 max-h-[78vh] overflow-y-auto scrollbar-hide">
            <h3 className="text-base font-serif font-black text-white text-center flex items-center justify-center gap-1.5">
              <Compass className="h-4 w-4 text-amber-400" /> Neighborhood & Location
            </h3>

            <div
              onClick={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              className="w-full text-left space-y-3"
            >
              {listingAreas.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {listingAreas.map((area) => (
                    <span key={area.label} className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[9px] text-gray-200">
                      <strong className="text-amber-300">{area.label}:</strong> {area.value}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl overflow-hidden p-3">
                <p className="text-xs font-bold text-amber-300 mb-2 flex items-center justify-between">
                  <span>{listing.city ? `${listing.city}${listing.state ? `, ${listing.state}` : ''}` : 'Neighborhood'}</span>
                  <span className="text-[10px] text-gray-300 font-normal">Walk Score: {getDynamicWalkScore(listing.zip, listing.city)}</span>
                </p>
                <div className="h-[380px] rounded-2xl overflow-hidden relative">
                  <ListingMap
                    address={listing.address}
                    city={listing.city}
                    zip={listing.zip}
                    customLat={effectiveMapCoords?.lat ?? mapSettings?.lat}
                    customLng={effectiveMapCoords?.lng ?? mapSettings?.lng}
                    allowedCategories={mapSettings?.categories}
                  />
                </div>
              </div>
              {presentation.showSchools && listingSchools.length > 0 ? (
                <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 mb-2">Education</p>
                  <div className="space-y-1.5">
                    {listingSchools.map((school) => (
                      <div key={school.type} className="flex items-start justify-between gap-3 text-[10px]">
                        <span className="text-gray-400">{school.type}</span>
                        <span className="font-bold text-white text-right">{school.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* SLIDE 5: Schedule Tour & Direct Inquiry */}
        {activeStorySlide === 5 && (
          <div className="w-full max-w-sm animate-fade-in-up space-y-4 text-center">
            <h3 className="text-xl font-serif font-black text-amber-400">{presentation.inquiryTitle}</h3>
            <p className="text-xs text-gray-200 leading-relaxed">
              Inquire directly with {listingAgent?.name || 'our team'} to arrange a viewing for {listing.address}.
            </p>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onOpenInquiry(listing)}
                className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-2xl text-xs shadow-xl transition-all flex items-center justify-center gap-2"
              >
                <Calendar className="h-4 w-4" /> {presentation.inquiryAction}
              </button>

              {(listingAgent?.phone || agent?.phone) && (
                <a
                  href={`tel:${listingAgent?.phone || agent?.phone}`}
                  className="w-full min-h-[44px] bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 rounded-2xl text-xs border border-white/15 flex items-center justify-center gap-2"
                >
                  <Phone className="h-4 w-4 text-emerald-400" /> Direct Call: {listingAgent?.phone || agent?.phone}
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Persistent Bottom Action Controls (Save, Share, Request Tour, Ask Question) */}
      <div className="relative z-20 bg-black/90 border-t border-white/10 px-4 py-2.5 flex items-center justify-between gap-2 shadow-2xl">
        <button
          type="button"
          onClick={() => setIsSaved(!isSaved)}
          className={clsx(
            "flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all border",
            isSaved ? "bg-amber-400 text-black border-amber-400" : "bg-white/10 text-white border-white/10 hover:bg-white/20"
          )}
        >
          {isSaved ? '♥ Saved' : '♡ Save'}
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="flex-1 py-2 rounded-xl text-xs font-bold bg-white/10 text-white border border-white/10 hover:bg-white/20 flex items-center justify-center gap-1"
        >
          <Send className="h-3.5 w-3.5" /> Share
        </button>

        <button
          type="button"
          onClick={() => onOpenInquiry(listing)}
          className="flex-[1.5] py-2.5 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 text-white shadow-lg flex items-center justify-center gap-1.5"
        >
          <Calendar className="h-3.5 w-3.5" /> {presentation.inquiryAction}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MOBILE BROWSE FEED LIST COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
interface ListingMobileFeedProps {
  listing: any
  allListings: any[]
  onSelectListing: (l: any) => void
  agent: any
  listingAgent: { name: string; email: string; phone: string; brokerage: string }
  companyName: string
  isSharedLeadView: boolean
  setLeadMessage: (msg: string) => void
  setShowInquiryModal: (v: boolean) => void
  onOpenInquiry: (l: any) => void
}

function ListingMobileFeed({
  listing,
  allListings,
  onSelectListing,
  agent,
  listingAgent,
  companyName,
  isSharedLeadView,
  setLeadMessage,
  setShowInquiryModal,
  onOpenInquiry
}: ListingMobileFeedProps) {
  const presentation = useMemo(() => getListingPresentation(listing), [listing])

  return (
    <div className="bg-[#FAF9F6] min-h-[calc(100vh-48px)] text-gray-800 pb-20 flex flex-col font-sans">
      <div className="bg-white px-4 py-4 border-b border-gray-150 flex-shrink-0 shadow-sm">
        <h3 className="font-bold text-gray-900 text-xs tracking-wider uppercase flex items-center gap-1.5">
          <Compass className="h-4 w-4 text-blue-600" />
          Neighborhood Catalog
        </h3>
        <p className="text-[10px] text-gray-400 mt-0.5">
          Voluntary inquiry submissions routed directly to {isSharedLeadView ? 'the presented by agent' : 'the team'}.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-hide">
        {/* Current Listing Featured */}
        <div className="bg-white rounded-3xl border border-blue-500 overflow-hidden shadow-md">
          <div className="relative h-44 bg-gray-100">
            {listing.heroMediaUrl && (
              <img src={resolveMediaUrl(listing.heroMediaUrl, listing.id)} alt="Featured" className="w-full h-full object-cover" />
            )}
            <div className="absolute top-3 left-3 bg-blue-600 text-white font-bold text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Currently Viewing
            </div>
          </div>
          <div className="p-4 space-y-2">
            <h4 className="font-bold text-gray-900 text-xs truncate">{listing.address}</h4>
            <p className="text-[10px] text-gray-400">{listing.city}, {listing.state}</p>
            <p className="text-[9px] text-gray-500 mt-0.5">
              {presentation.primaryFacts.slice(1, 4).map((item) => `${item.label}: ${item.value}`).join(' | ') || presentation.label}
            </p>
            <div className="flex justify-between items-center pt-2">
              <span className="text-blue-600 font-extrabold text-sm">${listing.price?.toLocaleString()}</span>
              <button
                onClick={() => onOpenInquiry(listing)}
                className="bg-blue-600 text-white font-bold text-[10px] px-3.5 py-1.5 rounded-xl shadow-md shadow-blue-500/10"
              >
                Inquire Directly
              </button>
            </div>
          </div>
        </div>

        {/* Other Listings */}
        <div className="space-y-3">
          <h4 className="font-bold text-gray-400 text-[9px] uppercase tracking-wider">Other Available Options</h4>
          {allListings.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No other listings available in this category.</p>
          ) : (
            allListings.map((l: any) => {
              const imgUrl = resolveMediaUrl(l.heroMediaUrl, l.id)
              const listPresentation = getListingPresentation(l)
              return (
                <div key={l.id} className="bg-white rounded-3xl border border-gray-150 overflow-hidden shadow-sm flex h-28 hover:border-gray-300 transition-colors">
                  <div className="w-28 flex-shrink-0 bg-gray-50 relative">
                    {imgUrl ? (
                      <img src={imgUrl} alt={l.address} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-300">No Photo</div>
                    )}
                  </div>
                  <div className="flex-1 p-3 flex flex-col justify-between">
                    <div>
                      <h5 className="font-bold text-gray-800 text-xs truncate">{l.address}</h5>
                      <p className="text-[10px] text-gray-400 truncate">{l.city}, {l.state}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5">
                        {listPresentation.primaryFacts.slice(1, 3).map((item) => `${item.label}: ${item.value}`).join(' | ') || listPresentation.label}
                      </p>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-900 font-extrabold text-xs">${l.price?.toLocaleString()}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => onSelectListing(l)}
                          className="bg-gray-50 hover:bg-gray-100 text-gray-600 font-bold text-[9px] px-2 py-1 rounded-lg border border-gray-200"
                        >
                          View Tour
                        </button>
                        <button
                          onClick={() => onOpenInquiry(l)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[9px] px-2 py-1 rounded-lg"
                        >
                          Ask Info
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Agent details stick footer */}
      {(listingAgent?.name || agent) && (
        <div className="bg-white border-t border-gray-150 p-4 sticky bottom-0 z-10 flex items-center justify-between gap-3 shadow-md flex-shrink-0">
          <div className="flex items-center gap-2">
            {agent?.avatarUrl ? (
              <img src={agent.avatarUrl} alt={agent.name} className="h-10 w-10 rounded-full object-cover border border-amber-400 bg-white" />
            ) : (
              <div className="h-10 w-10 rounded-full bg-blue-900 text-white text-xs font-bold flex items-center justify-center">
                {(listingAgent?.name || agent?.name || 'A').split(' ').map((n: string) => n[0]).join('')}
              </div>
            )}
            <div>
              <p className="text-xs font-bold text-gray-800 leading-none">{listingAgent?.name || agent?.name}</p>
              <p className="text-[9px] text-amber-600 font-bold mt-0.5">{listingAgent?.brokerage || companyName}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setLeadMessage(`I want to learn more about properties in this area.`)
              setShowInquiryModal(true)
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-md shadow-blue-500/10"
          >
            Connect Instantly
          </button>
        </div>
      )}
    </div>
  )
}
