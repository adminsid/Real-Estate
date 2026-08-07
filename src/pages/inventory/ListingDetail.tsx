import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { SkeletonBlock, SkeletonCard } from '@/components/common/SkeletonLoader'
import { useAuth } from '@/context/AuthContext'
import clsx from 'clsx'
import {
  ArrowLeft, Loader2, MapPin, BedDouble, Bath, Maximize2,
  Printer, Send, Phone, Mail, Plus, Calendar, Clock, Video, ExternalLink,
  Calculator, BadgeInfo, Building2,
  ChevronLeft, ChevronRight, X, Compass, Smartphone, Grid
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

function isResidentialType(listing: any) {
  const t = String(listing?.propertyType || listing?.type || '').toLowerCase()
  return ['residential', 'condo', 'co-op', 'multi-family'].some((x) => t.includes(x))
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

  const [showShowingModal, setShowShowingModal] = useState(false)
  const [showingForm, setShowingForm] = useState({ buyerName: '', shownAt: '', feedback: '' })
  const [submittingShowing, setSubmittingShowing] = useState(false)
  const [showingTab, setShowingTab] = useState<'schedule' | 'log'>('schedule')
  const [selectedDateStr, setSelectedDateStr] = useState(new Date().toISOString().split('T')[0])
  const [selectedTimeStr, setSelectedTimeStr] = useState('10:00')
  const [copyFeedback, setCopyFeedback] = useState(false)

  const [downpaymentType, setDownpaymentType] = useState<'percent' | 'dollar'>('percent')
  const [downpaymentValue, setDownpaymentValue] = useState(20)
  const [interestRate, setInterestRate] = useState(6.75)
  const [propertyTaxes, setPropertyTaxes] = useState(0)
  const [commonCharges, setCommonCharges] = useState(0)
  const [loanType, setLoanType] = useState<'conventional' | 'fha' | 'va' | 'usda'>('conventional')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
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
    } else if (propertyTaxes === 0 && listing.price) {
      setPropertyTaxes(Math.round(listing.price * 0.0125)) // 1.25% default tax estimate
    }
    // Sync HOA/common charges (AssociationFee is already monthly), bounded safely
    const hoaMonthlyRaw = Number(firstNonEmpty(r.AssociationFee, r.hoaFee, r.associationFee, listing.common_charges, 0))
    if (Number.isFinite(hoaMonthlyRaw) && hoaMonthlyRaw > 0 && hoaMonthlyRaw < 10000) {
      setCommonCharges(hoaMonthlyRaw)
    }
  }, [listing])

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
    if (city && String(city).trim() && String(city).trim() !== String(neighborhood).trim()) parts.push(String(city).trim())
    if (state || zip) parts.push(`${state} ${zip}`.trim())
    return parts.join(', ') || `${city}, ${state} ${zip}`
  }, [listing])

  // Dynamic school information from inventory metadata
  const listingSchools = useMemo(() => {
    if (!listing) return []
    const r = listing?.raw?.data || listing?.raw || {}
    const elem = firstNonEmpty(r.ElementarySchool, r.elementarySchool, listing.elementary_school)
    const middle = firstNonEmpty(r.MiddleOrJuniorSchool, r.middleOrJuniorSchool, listing.middle_school)
    const high = firstNonEmpty(r.HighSchool, r.highSchool, listing.high_school)
    const district = firstNonEmpty(r.SchoolDistrict, r.schoolDistrict, listing.city ? `${listing.city} School District` : 'Local School District')

    return [
      { type: 'Public Elementary', name: elem ? String(elem) : `${district} Elementary`, rating: '8/10' },
      { type: 'Public Middle', name: middle ? String(middle) : `${district} Middle`, rating: '7/10' },
      { type: 'Public High', name: high ? String(high) : `${district} High School`, rating: '8/10' },
    ]
  }, [listing])

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
      const descVal = `${listing.bedrooms || '—'} Bed, ${listing.bathrooms || '—'} Bath home at ${listing.address} for $${listing.price?.toLocaleString() || '—'}. Learn more at ${currentCompanyName}.`
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
  }, [listing, branding.companyName, agent])

  // Inquiry Form
  const [leadName, setLeadName] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
  const [leadPhone, setLeadPhone] = useState('')
  const [leadMessage, setLeadMessage] = useState('I am interested in learning more about this property.')
  const [showInquiryModal, setShowInquiryModal] = useState(false)
  const [selectedListObj, setSelectedListObj] = useState<any>(null)

  const openInquiry = (l: any) => {
    setSelectedListObj(l)
    setLeadMessage(`I am interested in learning more about ${l?.address || 'this property'}.`)
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

  const companyLogoUrl = agent?.companyLogoPublicUrl || agent?.companyLogoUrl || branding.logoUrl || null
  const companyName = agent?.companyName || branding.companyName || 'Prime America Real Estate'
  const listingAgent = useMemo(() => getListingAgentInfo(listing, agent, companyName), [listing, agent, companyName])
  const isSharedLeadView = !!sharedById
  const presentedBy = useMemo(() => getPresentedByInfo(agent, listingAgent, companyName, isSharedLeadView), [agent, listingAgent, companyName, isSharedLeadView])
  const addressSlug = listing ? slugify(`${listing.address || ''} ${listing.city || ''} ${listing.state || ''}`) : ''

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

  const shareUrl = listing ? `${leadDomainOrigin}/inventory/listings/${listing.id}/${addressSlug}?sharedBy=${user?.id || ''}` : ''
  const previewUrl = listing ? `${leadDomainOrigin}/inventory/listings/${listing.id}/${addressSlug}?preview=true` : ''
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
  const residentialTemplate = isResidentialType(listing)

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
    const logoUrl = companyLogoUrl || ''
    const priceStr = listing.price ? `$${listing.price.toLocaleString()}` : 'Contact for Price'

    const mediaUrls = mediaList.slice(0, 4).map((m: any) => {
      return m.mediaUrl.startsWith('http') ? m.mediaUrl : `https://inventory.primeamericarealestate.com${m.mediaUrl}`
    })

    const flyerHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Flyer - ${listing.address}</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=Playfair+Display:wght@700&display=swap');
          body {
            font-family: 'Montserrat', sans-serif;
            margin: 0;
            padding: 40px;
            color: #1a1a1a;
            background: #fff;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #0F2040;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .logo-container {
            display: flex;
            align-items: center;
            gap: 15px;
          }
          .logo {
            max-height: 50px;
            max-width: 150px;
            object-fit: contain;
          }
          .company-name {
            font-size: 20px;
            font-weight: 800;
            color: #0F2040;
          }
          .tagline {
            font-size: 11px;
            color: #C9A84C;
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-top: 2px;
          }
          .price-address {
            text-align: right;
          }
          .price {
            font-size: 32px;
            font-weight: 800;
            color: #C9A84C;
          }
          .address {
            font-size: 14px;
            color: #666;
            margin-top: 5px;
          }
          .hero-image-container {
            width: 100%;
            height: 380px;
            border-radius: 20px;
            overflow: hidden;
            margin-bottom: 20px;
          }
          .hero-image {
            width: 100%;
            height: 100%;
            object-fit: cover;
          }
          .gallery-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            margin-bottom: 30px;
          }
          .gallery-image {
            width: 100%;
            height: 120px;
            object-fit: cover;
            border-radius: 12px;
          }
          .details-section {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 40px;
            margin-bottom: 30px;
          }
          .description-container h2 {
            font-family: 'Playfair Display', serif;
            font-size: 22px;
            color: #0F2040;
            margin-top: 0;
            margin-bottom: 15px;
          }
          .description {
            font-size: 12px;
            line-height: 1.6;
            color: #4a4a4a;
          }
          .specs-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 15px;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 20px;
            height: fit-content;
          }
          .spec-item {
            text-align: center;
          }
          .spec-label {
            font-size: 9px;
            text-transform: uppercase;
            color: #888;
            font-weight: 700;
            letter-spacing: 1px;
          }
          .spec-value {
            font-size: 16px;
            font-weight: 800;
            color: #0F2040;
            margin-top: 3px;
          }
          .agent-card {
            border: 1px solid #eaeaea;
            border-radius: 24px;
            padding: 20px;
            display: flex;
            align-items: center;
            gap: 20px;
            margin-top: 30px;
          }
          .agent-photo {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            object-fit: cover;
            border: 2px solid #C9A84C;
          }
          .agent-info h3 {
            margin: 0;
            font-size: 16px;
            color: #0F2040;
            font-weight: 700;
          }
          .agent-info p {
            margin: 3px 0 0 0;
            font-size: 12px;
            color: #666;
          }
          .agent-contact {
            margin-top: 8px !important;
            font-weight: 600;
            color: #0F2040 !important;
          }
          @media print {
            body {
              padding: 0;
            }
            .no-print {
              display: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo-container">
            ${logoUrl ? `<img class="logo" src="${logoUrl}">` : ''}
            <div>
              <div class="company-name">${brokerageName}</div>
              <div class="tagline">Exclusive Representation</div>
            </div>
          </div>
          <div class="price-address">
            <div class="price">${priceStr}</div>
            <div class="address">${listing.address}, ${listing.city}, ${listing.state}</div>
          </div>
        </div>

        <div class="hero-image-container">
          <img class="hero-image" src="${mediaUrls[0] || ''}">
        </div>

        <div class="gallery-grid">
          ${mediaUrls.slice(1, 4).map((url: string) => `<img class="gallery-image" src="${url}">`).join('')}
        </div>

        <div class="details-section">
          <div class="description-container">
            <h2>About the Property</h2>
            <div class="description">${listing.description || 'No description available.'}</div>
          </div>
          <div class="specs-grid">
            <div class="spec-item">
              <div class="spec-label">Bedrooms</div>
              <div class="spec-value">${listing.bedrooms || '—'}</div>
            </div>
            <div class="spec-item">
              <div class="spec-label">Bathrooms</div>
              <div class="spec-value">${listing.bathrooms || '—'}</div>
            </div>
            <div class="spec-item">
              <div class="spec-label">Square Feet</div>
              <div class="spec-value">${listing.sqft ? listing.sqft.toLocaleString() : '—'}</div>
            </div>
            <div class="spec-item">
              <div class="spec-label">Year Built</div>
              <div class="spec-value">${listing.yearBuilt || '—'}</div>
            </div>
          </div>
        </div>

        <div class="agent-card">
          ${agentAvatar ? `<img class="agent-photo" src="${agentAvatar}">` : ''}
          <div class="agent-info">
            <h3>Presented By: ${agentName}</h3>
            <p>${brokerageName}</p>
            <p class="agent-contact">Phone: ${agentPhone} | Email: ${agentEmail}</p>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 1000);
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
    navigate(`/inventory/listings/${selectedListObj.id}`)
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
        const res = await fetch(`/api/public/listings/${id}`)
        const data = await res.json()
        const listObj = data.data
        if (data.success && listObj) {
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
  }, [id, sharedById, user])

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

  const handleSendLead = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmittingLead(true)
    try {
      const res = await fetch('/api/public/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: user?.tenantId || agent?.tenantId || 'tenant_primeamerica',
          agentId: sharedById || user?.id || null,
          first_name: leadName.split(' ')[0] || 'Inquiry',
          last_name: leadName.split(' ').slice(1).join(' ') || 'Lead',
          email: leadEmail,
          phone: leadPhone,
          notes: `Lead from shared listing landing page for property ${listing?.address}. Message: ${leadMessage}`
        })
      })
      if (res.ok) {
        alert('Thank you! Your inquiry has been sent to the presented by agent.')
        setLeadName('')
        setLeadEmail('')
        setLeadPhone('')
      } else {
        alert('Failed to submit inquiry. Please try again.')
      }
    } catch (e) {
      console.error(e)
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
    const isLease = listing.propertyType?.toLowerCase().includes('lease') || listing.propertyType?.toLowerCase().includes('rent')

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
    const pricePerSqFt = listing?.price && listing?.sqft ? Math.round(listing.price / listing.sqft) : null

    const companyIdentity = {
      companyName,
      address: String(firstNonEmpty(agent?.companyAddress, branding.companyAddress, '100 Wall Street, 12th Floor, New York, NY 10005') || '100 Wall Street, 12th Floor, New York, NY 10005'),
      telephone: String(firstNonEmpty(agent?.companyTelephone, branding.companyTelephone, '(212) 555-0100') || '(212) 555-0100'),
      fax: String(firstNonEmpty(agent?.companyFax, branding.companyFax, '') || ''),
    }
    const complianceDisclaimer = getComplianceDisclaimer(companyIdentity)
    const residentialTemplate = isResidentialType(listing)
    const sourceCoords = getListingSourceCoords(listing)
    const fallbackCoords = getDeterministicCoords(listing.address, listing.city, listing.zip)
    const effectiveMapCoords = {
      lat: mapSettings?.lat ?? sourceCoords?.lat ?? fallbackCoords.lat,
      lng: mapSettings?.lng ?? sourceCoords?.lng ?? fallbackCoords.lng,
    }

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
              onClick={() => setForceDesktopLayout(true)}
              className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-center flex items-center justify-center gap-1.5 border-b-2 border-transparent text-gray-400 hover:text-white"
            >
              <Grid className="h-4.5 w-4.5" /> Full Page
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
              agent={agent}
              listingAgent={presentedBy}
              isSharedLeadView={isSharedLeadView}
              complianceDisclaimer={complianceDisclaimer}
              mapSettings={mapSettings}
              effectiveMapCoords={effectiveMapCoords}
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
              <p className="text-[9px] text-gray-400 mb-4">Asking about {selectedListObj ? selectedListObj.address : 'available options'}. No obligation.</p>
              <form onSubmit={(e) => { e.preventDefault(); handleSendLead(e); setShowInquiryModal(false); }} className="space-y-3.5">
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
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors"
                >
                  {isSubmittingLead ? 'Sending...' : 'Send Inquiry'}
                </button>

                <p className="text-[7.5px] text-gray-400 text-center leading-relaxed mt-2.5">
                  {complianceDisclaimer}
                </p>
              </form>
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
            {!logoFailed && companyLogoUrl ? (
              <img
                src={companyLogoUrl}
                alt={companyName}
                onError={() => setLogoFailed(true)}
                className="h-10 w-auto object-contain max-w-[180px]"
              />
            ) : (
              <div className="flex items-center gap-2.5">
                <svg className="h-10 w-10 flex-shrink-0" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="48" fill="#0c1e2d" stroke="#b45309" strokeWidth="3" />
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#b45309" strokeWidth="0.7" strokeDasharray="2 2" />
                  <text x="50" y="32" fill="#f59e0b" fontSize="6.5" fontWeight="bold" textAnchor="middle" letterSpacing="0.5">PRIME</text>
                  <text x="50" y="42" fill="#f59e0b" fontSize="6.5" fontWeight="bold" textAnchor="middle" letterSpacing="0.5">AMERICA</text>
                  <text x="50" y="70" fill="#f59e0b" fontSize="5.5" fontWeight="bold" textAnchor="middle">REAL ESTATE</text>
                  <path d="M42 58 L50 50 L58 58 L55 58 L55 64 L45 64 L45 58 Z" fill="#f59e0b" />
                </svg>
                <div>
                  <p className="font-extrabold text-base text-gray-900 leading-none">{companyName}</p>
                  <p className="text-[11px] font-semibold text-amber-600 tracking-wide mt-0.5">Prime America Real Estate, Inc.</p>
                </div>
              </div>
            )}
          </div>

          {/* Header Right - Presented by Agent Card */}
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
                src={
                  activeMediaUrl.startsWith('http')
                    ? activeMediaUrl
                    : `https://inventory.primeamericarealestate.com${activeMediaUrl}`
                }
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
                const mediaSrc = med.mediaUrl.startsWith('http')
                  ? med.mediaUrl
                  : `https://inventory.primeamericarealestate.com${med.mediaUrl}`
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
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Asking Price</p>
              <p className="mt-1 text-2xl font-black text-gray-900">{listing.price ? `$${listing.price.toLocaleString()}` : '—'}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Price / Sq Ft</p>
              <p className="mt-1 text-2xl font-black text-gray-900">{pricePerSqFt ? `$${pricePerSqFt}` : '—'}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Days On Market</p>
              <p className="mt-1 text-2xl font-black text-gray-900">12 days</p>
            </div>
            <div
              onClick={() => setShowPaymentModal(true)}
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm cursor-pointer hover:border-brand-navy/30 transition-colors relative"
            >
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Est. Monthly Payment <span className="text-[9px] text-blue-600 font-bold ml-1">adjust</span></p>
              <p className="mt-1 text-2xl font-black text-gray-900 max-w-full truncate">{estimatedMonthlyPayment ? `$${estimatedMonthlyPayment.total.toLocaleString()}` : '—'}/mo</p>
            </div>
          </div>

          {/* Main 2-Column Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
            {/* Left Main Column */}
            <div className="lg:col-span-2 space-y-8">
              {/* Address details & Quick Specs */}
              <div className="space-y-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                <div>
                  <h1 className={`text-3xl ${theme.fontHeading} text-gray-900 font-bold`}>{listing.address}</h1>
                  <p className="text-gray-600 text-base flex items-center gap-1.5 font-sans mt-1 font-medium">
                    <MapPin className="h-5 w-5 text-amber-500 flex-shrink-0" />
                    {displayLocation}
                  </p>
                </div>

                {residentialTemplate ? (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-5 mt-4 grid grid-cols-4 gap-4 text-center font-sans">
                    <div className="space-y-1">
                      <BedDouble className="h-5 w-5 mx-auto text-blue-600" />
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Bedrooms</p>
                      <p className="text-xl font-black text-gray-900">{listing.bedrooms || '—'}</p>
                    </div>
                    <div className="space-y-1 border-l border-gray-200">
                      <Bath className="h-5 w-5 mx-auto text-blue-600" />
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Bathrooms</p>
                      <p className="text-xl font-black text-gray-900">{listing.bathrooms || '—'}</p>
                    </div>
                    <div className="space-y-1 border-l border-gray-200">
                      <Maximize2 className="h-5 w-5 mx-auto text-blue-600" />
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Square Feet</p>
                      <p className="text-xl font-black text-gray-900">{listing.sqft ? listing.sqft.toLocaleString() : '—'}</p>
                    </div>
                    <div className="space-y-1 border-l border-gray-200">
                      <Calendar className="h-5 w-5 mx-auto text-blue-600" />
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Year Built</p>
                      <p className="text-xl font-black text-gray-900">{listing.yearBuilt || listing.year_built || '1925'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-5 mt-4 grid grid-cols-3 gap-3 text-center font-sans">
                    <div className="rounded-xl bg-white border border-gray-100 p-3">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Property Type</p>
                      <p className="text-sm font-bold text-gray-800 capitalize">{listing.propertySubtype || listing.propertyType || 'Commercial'}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-gray-100 p-3">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Building Size</p>
                      <p className="text-sm font-bold text-gray-800">{listing.sqft ? `${Number(listing.sqft).toLocaleString()} sf` : '—'}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-gray-100 p-3">
                      <p className="text-[10px] text-gray-400 font-bold uppercase">Lot Size</p>
                      <p className="text-sm font-bold text-gray-800">{listing.lotSize ? `${Number(listing.lotSize).toLocaleString()} sf` : '—'}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm font-sans">
                <h2 className="text-xl font-bold text-gray-900 border-b border-gray-100 pb-2">About the Property</h2>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                  {listing.description || 'No description provided.'}
                </p>
              </div>

              {/* Interactive Local Map section */}
              <div className="space-y-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Compass className="h-5 w-5 text-amber-500" /> Explore {listing.city || 'Property'} Location
                </h2>
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
              <div className="space-y-4 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm font-sans">
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
                      <p className="text-xs font-semibold text-emerald-600 mt-2 flex items-center gap-1">
                        <span>★ Rating:</span> {sch.rating}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

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
                    <Send className="h-5 w-5 text-blue-600" /> Schedule a Tour
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    or call Siddhartha Lama: <a href="tel:9294248950" className="font-bold text-blue-600 hover:underline">(929) 424-8950</a>
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
                    {isSubmittingLead ? 'Submitting...' : 'Request Private Showing'}
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
                src={
                  mediaList[activeIndex]?.mediaUrl?.startsWith('http')
                    ? mediaList[activeIndex].mediaUrl
                    : `https://inventory.primeamericarealestate.com${mediaList[activeIndex]?.mediaUrl}`
                }
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
                  const mediaSrc = med.mediaUrl.startsWith('http')
                    ? med.mediaUrl
                    : `https://inventory.primeamericarealestate.com${med.mediaUrl}`
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

  const shareModal = showShareModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto" onClick={() => setShowShareModal(false)}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-auto overflow-hidden font-sans border border-gray-200 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b border-gray-100 pb-3">
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-1.5">
            <Send className="h-4 w-4 text-blue-600" /> Share Listing Details
          </h3>
          <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        {/* Property Preview Card */}
        {listing && (
          <div className="flex gap-3 bg-gray-50 border border-gray-200 rounded-2xl p-3 items-center">
            {mediaList[0]?.mediaUrl ? (
              <img
                src={mediaList[0].mediaUrl.startsWith('http') ? mediaList[0].mediaUrl : `https://inventory.primeamericarealestate.com${mediaList[0].mediaUrl}`}
                alt=""
                className="h-14 w-16 rounded-xl object-cover border border-gray-200 flex-shrink-0"
              />
            ) : (
              <div className="h-14 w-16 rounded-xl bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">
                No Pic
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-gray-900 text-xs truncate">{listing.address}</p>
              <p className="text-[11px] text-amber-600 font-extrabold mt-0.5">${listing.price?.toLocaleString() || '—'}</p>
              <p className="text-[10px] text-gray-500 truncate">{displayLocation}</p>
            </div>
          </div>
        )}

        {/* Share Action Buttons */}
        <div className="space-y-2 text-xs font-bold">
          <button
            onClick={() => {
              navigator.clipboard.writeText(shareUrl || window.location.href)
              setShareCopied(true)
              setTimeout(() => setShareCopied(false), 2500)
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center justify-between"
          >
            <span>Copy Link</span>
            {shareCopied ? <span className="text-[10px] text-emerald-600 font-bold">✓ Copied!</span> : <span className="text-[10px] text-blue-500 font-bold">Tap to copy</span>}
          </button>

          <a
            href={`https://wa.me/?text=${encodeURIComponent(`Check out ${listing?.address || 'this listing'} ($${listing?.price?.toLocaleString() || ''}) on Prime America Real Estate: ${shareUrl || window.location.href}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center justify-between"
          >
            <span>📱 Share via WhatsApp</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>

          <a
            href={`mailto:?subject=${encodeURIComponent(`${listing?.address || 'Exclusive Listing'} - Prime America Real Estate`)}&body=${encodeURIComponent(`I thought you might be interested in ${listing?.address || 'this home'} listed at $${listing?.price?.toLocaleString() || ''}.\n\nView details: ${shareUrl || window.location.href}`)}`}
            className="w-full py-2.5 px-4 rounded-xl bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-colors flex items-center justify-between"
          >
            <span>✉️ Share via Email</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  )

  const paymentModal = showPaymentModal && (
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
        <Link to="/inventory/mls" className="rounded-xl p-2.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors shadow-sm bg-white border border-gray-200 flex items-center justify-center">
          <ArrowLeft className="h-5 w-5" />
        </Link>

        {/* Responsive Workspace Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {user && !isPreview && (
            <>
              <button
                onClick={handleAddToDeals}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-extrabold bg-blue-600 text-white px-3.5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
              >
                <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add to</span> Deals Pipeline
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
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl || window.location.href)
                  setShareCopied(true)
                  setTimeout(() => setShareCopied(false), 2500)
                }}
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2.5 rounded-xl hover:bg-blue-100 shadow-sm"
              >
                {shareCopied ? <><span className="hidden md:inline">✓ Copied!</span><span className="md:hidden">✓</span></> : <><Send className="h-3.5 w-3.5" /> <span className="hidden md:inline">Copy Lead Link</span><span className="md:hidden">Copy</span></>}
              </button>
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold bg-white border border-gray-200 text-gray-700 px-3 py-2.5 rounded-xl hover:bg-gray-50 shadow-sm"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Preview <span className="hidden md:inline">Lead</span>
              </a>
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
                  src={
                    activeMediaUrl.startsWith('http')
                      ? activeMediaUrl
                      : `https://inventory.primeamericarealestate.com${activeMediaUrl}`
                  }
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
                  const mediaSrc = med.mediaUrl.startsWith('http')
                    ? med.mediaUrl
                    : `https://inventory.primeamericarealestate.com${med.mediaUrl}`
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
                  <h1 className="text-2xl font-bold text-gray-900">{listing.address}</h1>
                  <p className="text-gray-500 flex items-center gap-1 mt-1">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    {listing.city}, {listing.state} {listing.zip}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-extrabold text-gray-900">
                    {listing.price ? `$${listing.price.toLocaleString()}` : '—'}
                  </p>
                  <span className="inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800 uppercase">
                    For {listing.propertyType || 'Sale'}
                  </span>
                </div>
              </div>

              {/* Specs */}
              {residentialTemplate ? (
                <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                  <div>
                    <BedDouble className="h-5 w-5 mx-auto mb-1 text-gray-400" />
                    <p className="text-sm font-bold text-gray-800">{listing.bedrooms || '—'} Beds</p>
                  </div>
                  <div>
                    <Bath className="h-5 w-5 mx-auto mb-1 text-gray-400" />
                    <p className="text-sm font-bold text-gray-800">{listing.bathrooms || '—'} Baths</p>
                  </div>
                  <div>
                    <Maximize2 className="h-5 w-5 mx-auto mb-1 text-gray-400" />
                    <p className="text-sm font-bold text-gray-800">{listing.sqft ? `${listing.sqft.toLocaleString()} Sq Ft` : '—'}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100 text-center">
                  <div className="rounded-lg bg-white border border-gray-100 p-3">
                    <p className="text-[10px] text-gray-400 uppercase">Property Type</p>
                    <p className="text-sm font-bold text-gray-800 capitalize">{listing.propertySubtype || listing.propertyType || 'Commercial'}</p>
                  </div>
                  <div className="rounded-lg bg-white border border-gray-100 p-3">
                    <p className="text-[10px] text-gray-400 uppercase">Building Size</p>
                    <p className="text-sm font-bold text-gray-800">{listing.sqft ? `${Number(listing.sqft).toLocaleString()} sf` : '—'}</p>
                  </div>
                  <div className="rounded-lg bg-white border border-gray-100 p-3">
                    <p className="text-[10px] text-gray-400 uppercase">Lot Size</p>
                    <p className="text-sm font-bold text-gray-800">{listing.lotSize ? `${Number(listing.lotSize).toLocaleString()} sf` : '—'}</p>
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-bold text-gray-800 mb-2">Property Description</h3>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line border-b border-gray-150 pb-4">
                  {listing.description || 'No description provided.'}
                </p>
              </div>

              {/* Facts & Features */}
              {(() => {
                const r = listing?.raw?.data || listing?.raw || {}
                const hasFeatures = r.heating || r.Heating || r.cooling || r.Cooling || r.appliances || r.Appliances || r.parkingFeatures || r.parking || r.basement || r.exteriorFeatures || r.flooring || r.roof || r.zoning || r.hoaFee
                if (!hasFeatures) return null

                const sections = [
                  {
                    title: 'Interior Details',
                    items: [
                      { label: 'Heating', value: r.heating || r.Heating },
                      { label: 'Cooling', value: r.cooling || r.Cooling },
                      { label: 'Appliances', value: r.appliances || r.Appliances },
                      { label: 'Flooring', value: r.flooring || r.Flooring },
                      { label: 'Basement', value: r.basement || r.Basement },
                    ]
                  },
                  {
                    title: 'Exterior & Parking',
                    items: [
                      { label: 'Parking', value: r.parkingFeatures || r.ParkingFeatures || r.parking },
                      { label: 'Garage Spaces', value: r.garageSpaces || r.GarageSpaces },
                      { label: 'Exterior Features', value: r.exteriorFeatures || r.ExteriorFeatures || r.exterior },
                      { label: 'Roof', value: r.roof || r.Roof },
                      { label: 'Construction', value: r.constructionMaterials || r.ConstructionMaterials },
                    ]
                  },
                  {
                    title: 'Property Details',
                    items: [
                      { label: 'Zoning', value: r.zoning || r.Zoning },
                      { label: 'Taxes', value: r.taxAnnualAmount ? `$${Number(r.taxAnnualAmount).toLocaleString()}/yr` : null },
                      { label: 'HOA Fee', value: r.hoaFee ? `$${Number(r.hoaFee).toLocaleString()}` : null },
                      { label: 'Sewer', value: r.sewer || r.Sewer },
                      { label: 'Water', value: r.waterSource || r.WaterSource },
                    ]
                  }
                ]

                return (
                  <div className="pt-6 mt-6 border-t border-gray-150 space-y-6">
                    <h3 className="font-bold text-gray-900 text-xl flex items-center gap-2">
                      <Grid className="h-5 w-5 text-gray-400" /> Facts & Features
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {sections.map((sec) => {
                        const validItems = sec.items.filter(i => i.value)
                        if (validItems.length === 0) return null
                        return (
                          <div key={sec.title} className="space-y-3">
                            <h4 className="font-semibold text-gray-800 text-sm uppercase tracking-wide border-b border-gray-100 pb-1.5">{sec.title}</h4>
                            <ul className="space-y-2">
                              {validItems.map((item, idx) => (
                                <li key={idx} className="flex flex-col text-sm">
                                  <span className="text-gray-500 font-medium">{item.label}</span>
                                  <span className="text-gray-900 leading-tight mt-0.5">{Array.isArray(item.value) ? item.value.join(', ') : item.value}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

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

              {/* Virtual Tour — now shown inline in photo gallery thumbnail strip above */}
            </div>
          </div>
        </div>

        {/* Lead Inquiry & Agent sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Listing Agent info */}
          {listingAgentInfo.name && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm text-center">
              {companyLogoUrl ? (
                <img
                  src={companyLogoUrl}
                  alt={companyName}
                  className="h-16 w-16 rounded-2xl object-contain bg-white border border-gray-100 mx-auto mb-3 p-1"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-brand-navy/10 flex items-center justify-center font-bold text-brand-navy text-xl mx-auto mb-3">
                  {listingAgentInfo.name.split(' ').map((n: string) => n[0]).join('')}
                </div>
              )}
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

      {/* Showing modal */}
      {/* Showing modal */}
      {showShowingModal && (() => {
        const next7Days = []
        const locale = 'en-US'
        for (let i = 0; i < 7; i++) {
          const d = new Date()
          d.setDate(d.getDate() + i)
          next7Days.push({
            dateStr: d.toISOString().split('T')[0],
            dayName: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(locale, { weekday: 'short' }),
            dayNum: d.getDate(),
            monthName: d.toLocaleDateString(locale, { month: 'short' }),
          })
        }
        const timeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']
        const confirmMessage = `Hi ${showingForm.buyerName || 'Client'}, confirming our showing of ${listing?.name || listing?.address || 'property'} scheduled for ${selectedDateStr} at ${selectedTimeStr}. See you there! — ${user?.name || 'Agent'}`

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-y-auto" onClick={() => setShowShowingModal(false)}>
            <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md mx-auto space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center border-b pb-2.5">
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                  <Calendar className="h-5 w-5 text-brand-navy" />
                  Showing Scheduler
                </h3>
                <button onClick={() => setShowShowingModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
              </div>

              {/* Mode Toggle Tabs */}
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setShowingTab('schedule')}
                  className={clsx(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                    showingTab === 'schedule' ? "bg-white text-brand-navy shadow-sm" : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  📅 Schedule Future
                </button>
                <button
                  type="button"
                  onClick={() => setShowingTab('log')}
                  className={clsx(
                    "flex-1 py-1.5 text-xs font-bold rounded-lg transition-all",
                    showingTab === 'log' ? "bg-white text-brand-navy shadow-sm" : "text-gray-500 hover:text-gray-800"
                  )}
                >
                  📝 Log Past
                </button>
              </div>

              {/* Client Info */}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Buyer / Client Name *</label>
                <input
                  required
                  value={showingForm.buyerName}
                  onChange={(e) => setShowingForm((p) => ({ ...p, buyerName: e.target.value }))}
                  placeholder="e.g. John Smith"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white"
                />
              </div>

              {showingTab === 'schedule' ? (
                <>
                  {/* Date Scrolling Selector */}
                  <div className="space-y-1">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Select Date</label>
                    <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-none no-print">
                      {next7Days.map((d) => {
                        const isSelected = selectedDateStr === d.dateStr
                        return (
                          <button
                            key={d.dateStr}
                            type="button"
                            onClick={() => setSelectedDateStr(d.dateStr)}
                            className={clsx(
                              "flex-shrink-0 w-14 p-2 rounded-xl text-center border-2 transition-all flex flex-col items-center justify-center",
                              isSelected ? "border-brand-navy bg-blue-50/50 text-brand-navy font-bold" : "border-gray-100 bg-white text-gray-600 hover:border-gray-250"
                            )}
                          >
                            <span className="text-[9px] uppercase font-bold text-gray-400 leading-none mb-1">{d.dayName}</span>
                            <span className="text-base font-extrabold leading-none mb-0.5">{d.dayNum}</span>
                            <span className="text-[8px] uppercase font-semibold leading-none">{d.monthName}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Time Slots Selector */}
                  <div className="space-y-1.5">
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Select Time Slot</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {timeSlots.map((ts) => {
                        const isSelected = selectedTimeStr === ts
                        const [hour, min] = ts.split(':')
                        const hr = parseInt(hour)
                        const ampm = hr >= 12 ? 'PM' : 'AM'
                        const hr12 = hr % 12 === 0 ? 12 : hr % 12
                        const displayTime = `${hr12}:${min} ${ampm}`

                        return (
                          <button
                            key={ts}
                            type="button"
                            onClick={() => setSelectedTimeStr(ts)}
                            className={clsx(
                              "py-1.5 rounded-lg text-center font-bold text-[10px] border transition-all",
                              isSelected ? "bg-brand-navy text-white border-brand-navy shadow-sm" : "bg-gray-50 border-gray-150 text-gray-600 hover:bg-gray-100"
                            )}
                          >
                            {displayTime}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Custom Picker Fallback */}
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Or Custom Date/Time</label>
                    <input
                      type="datetime-local"
                      value={`${selectedDateStr}T${selectedTimeStr}`}
                      onChange={(e) => {
                        const parts = e.target.value.split('T')
                        if (parts[0]) setSelectedDateStr(parts[0])
                        if (parts[1]) setSelectedTimeStr(parts[1].substring(0, 5))
                      }}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white"
                    />
                  </div>

                  {/* SMS / Copy Confirmation Template */}
                  <div className="bg-gray-50 border border-gray-150 rounded-2xl p-3 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-bold uppercase text-gray-400 flex items-center gap-1">
                        <Smartphone className="h-3.5 w-3.5 text-gray-500" />
                        Client Text Confirmation Copy
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(confirmMessage)
                          setCopyFeedback(true)
                          setTimeout(() => setCopyFeedback(false), 2000)
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:underline bg-white border px-2 py-0.5 rounded-md"
                      >
                        {copyFeedback ? 'Copied ✓' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-600 italic leading-relaxed bg-white border border-gray-100 p-2 rounded-xl">
                      "{confirmMessage}"
                    </p>
                  </div>
                </>
              ) : (
                <>
                  {/* Past Showing Log fields */}
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Date & Time</label>
                    <input
                      type="datetime-local"
                      value={showingForm.shownAt}
                      onChange={(e) => setShowingForm((p) => ({ ...p, shownAt: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-400">Feedback</label>
                    <textarea
                      value={showingForm.feedback}
                      onChange={(e) => setShowingForm((p) => ({ ...p, feedback: e.target.value }))}
                      placeholder="Feedback from buyer/client..."
                      rows={3}
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-navy bg-white"
                    />
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setShowShowingModal(false)}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    submittingShowing ||
                    !showingForm.buyerName.trim() ||
                    (showingTab === 'log' && !showingForm.shownAt)
                  }
                  onClick={async () => {
                    setSubmittingShowing(true)
                    try {
                      const finalShownAt = showingTab === 'schedule'
                        ? new Date(`${selectedDateStr}T${selectedTimeStr}:00`).toISOString()
                        : new Date(showingForm.shownAt).toISOString()

                      const res = await fetch('/api/showings', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          listingId: listing?.id,
                          buyerName: showingForm.buyerName.trim(),
                          shownAt: finalShownAt,
                          feedback: showingTab === 'log' && showingForm.feedback.trim() ? showingForm.feedback.trim() : undefined,
                          listingAddress: listing?.address ? `${listing.address}, ${listing.city || ''} ${listing.state || ''}`.trim() : undefined,
                        }),
                      })
                      const data = await res.json()
                      if (!data.success) throw new Error(data.error)
                      setShowShowingModal(false)
                      setShowingForm({ buyerName: '', shownAt: '', feedback: '' })
                      alert(showingTab === 'schedule' ? 'Showing scheduled successfully' : 'Showing log saved successfully')
                    } catch (e: any) {
                      alert(e.message)
                    } finally {
                      setSubmittingShowing(false)
                    }
                  }}
                  className="flex-1 rounded-xl bg-brand-navy px-4 py-2 text-xs font-semibold text-white hover:bg-brand-navy-light disabled:opacity-60"
                >
                  {submittingShowing ? 'Saving...' : showingTab === 'schedule' ? 'Schedule' : 'Save Log'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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

    if (['cafe', 'restaurant', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream'].includes(amenity)) return 'food'
    if (['supermarket', 'convenience', 'greengrocer', 'mall'].includes(shop)) return 'groceries'
    if (['station', 'subway_entrance', 'tram_stop', 'bus_station', 'bus_stop'].includes(amenity) || ['station', 'subway_entrance', 'tram_stop'].includes(railway) || ['stop_position', 'platform'].includes(publicTransport)) return 'transit'
    if (['park', 'playground', 'pitch', 'fitness_centre', 'sports_centre'].includes(leisure) || ['park', 'fitness_centre'].includes(amenity)) return 'parks'
    if (['school', 'college', 'university', 'kindergarten', 'library'].includes(amenity)) return 'education'
    return null
  }

  useEffect(() => {
    let cancelled = false
    async function fetchAmenities() {
      setAmenitiesLoading(true)
      try {
        const radius = 1200
        const query = `[out:json][timeout:20];(
          node(around:${radius},${coords.lat},${coords.lng})[amenity];
          way(around:${radius},${coords.lat},${coords.lng})[amenity];
          rel(around:${radius},${coords.lat},${coords.lng})[amenity];
          node(around:${radius},${coords.lat},${coords.lng})[shop];
          way(around:${radius},${coords.lat},${coords.lng})[shop];
          rel(around:${radius},${coords.lat},${coords.lng})[shop];
          node(around:${radius},${coords.lat},${coords.lng})[leisure];
          way(around:${radius},${coords.lat},${coords.lng})[leisure];
          rel(around:${radius},${coords.lat},${coords.lng})[leisure];
          node(around:${radius},${coords.lat},${coords.lng})[railway];
          way(around:${radius},${coords.lat},${coords.lng})[railway];
          rel(around:${radius},${coords.lat},${coords.lng})[railway];
          node(around:${radius},${coords.lat},${coords.lng})[public_transport];
          way(around:${radius},${coords.lat},${coords.lng})[public_transport];
          rel(around:${radius},${coords.lat},${coords.lng})[public_transport];
        );out center 80;`

        const res = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: query,
        })
        const data = await res.json()
        const rows = Array.isArray(data?.elements) ? data.elements : []

        const mapped = rows
          .map((el: any) => {
            const lat = el.lat ?? el.center?.lat
            const lng = el.lon ?? el.center?.lon
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
            const category = mapAmenityCategory(el.tags)
            if (!category) return null
            if (allowedCategories && !allowedCategories.includes(category)) return null
            const dist = haversineMiles(coords.lat, coords.lng, lat, lng)
            const name = el.tags?.name || el.tags?.brand || 'Nearby place'
            const type = el.tags?.amenity || el.tags?.shop || el.tags?.leisure || el.tags?.railway || 'location'
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
      } catch (e) {
        console.error('Failed to fetch nearby amenities', e)
        if (!cancelled) setAmenities([])
      } finally {
        if (!cancelled) setAmenitiesLoading(false)
      }
    }
    fetchAmenities()
    return () => { cancelled = true }
  }, [coords.lat, coords.lng, allowedCategories?.join('|')])

  // Initialize Map
  useEffect(() => {
    if (!leafletLoaded || !mapRef.current || mapInstance) return

    const L = (window as any).L
    const map = L.map(mapRef.current, {
      zoomControl: false,
      scrollWheelZoom: false,
    }).setView([coords.lat, coords.lng], 15)

    // Voyager theme tiles look clean and modern
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors'
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
  ].filter(cat => cat.key === 'all' || !allowedCategories || allowedCategories.includes(cat.key))

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
            <div className="text-center py-8 text-xs text-gray-400">No matching amenities found.</div>
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
  agent: any
  listingAgent: { name: string; email: string; phone: string; brokerage: string }
  isSharedLeadView: boolean
  complianceDisclaimer: string
  mapSettings: { lat: number | null, lng: number | null, categories: string[] | null } | null
  effectiveMapCoords?: { lat: number | null; lng: number | null }
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
}

function ListingStoryView({
  listing,
  agent,
  listingAgent,
  isSharedLeadView,
  mapSettings,
  effectiveMapCoords,
  mediaList,
  isStoryPaused,
  setIsStoryPaused,
  activeStorySlide,
  setActiveStorySlide,
  companyLogoUrl,
  companyName,
  onOpenInquiry
}: ListingStoryViewProps) {
  const slideCount = 6
  const residentialTemplate = isResidentialType(listing)
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
    const taxes = Math.round((price * 0.0125) / 12)
    const total = Math.round(pAndI + taxes)
    return { pAndI: Math.round(pAndI), taxes, total }
  }, [listing.price, storyDownPct, storyRate])

  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const [photoOffset, setPhotoOffset] = useState<number>(0)
  const isSwipingRef = useRef<boolean>(false)

  const currentPhotoIdx = (activeStorySlide + photoOffset) % Math.max(1, mediaList.length)
  const currentPhotoObj = mediaList[currentPhotoIdx]
  const storyPhotoSrc = currentPhotoObj?.mediaUrl
    ? (currentPhotoObj.mediaUrl.startsWith('http')
        ? currentPhotoObj.mediaUrl
        : `https://inventory.primeamericarealestate.com${currentPhotoObj.mediaUrl}`)
    : 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80'

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
    if (!listing) return []
    const r = listing?.raw?.data || listing?.raw || {}
    const items: Array<{ category: string; value: string }> = []

    if (listing.bedrooms || listing.bathrooms) {
      items.push({ category: 'Layout', value: `${listing.bedrooms || '—'} Beds, ${listing.bathrooms || '—'} Baths` })
    }
    if (listing.sqft) {
      items.push({ category: 'Size', value: `${Number(listing.sqft).toLocaleString()} Sq Ft Space` })
    }
    if (listing.yearBuilt || r.YearBuilt) {
      items.push({ category: 'Architecture', value: `Built in ${listing.yearBuilt || r.YearBuilt}` })
    }
    if (listing.propertySubtype || listing.propertyType || r.PropertySubtype) {
      items.push({ category: 'Property Type', value: String(listing.propertySubtype || listing.propertyType || r.PropertySubtype) })
    }
    if (r.Heating || r.Cooling || r.cooling) {
      items.push({ category: 'HVAC', value: `${r.Heating || 'Heating'} / ${r.Cooling || 'AC'}` })
    }
    if (r.ParkingFeatures || r.GarageSpaces) {
      items.push({ category: 'Parking', value: `${r.GarageSpaces ? `${r.GarageSpaces} Car Garage` : 'Off-Street Parking'}` })
    }

    if (items.length < 4) {
      items.push({ category: 'Location', value: `Prime ${listing.city || 'Neighborhood'}` })
      items.push({ category: 'Condition', value: 'Turn-Key Ready' })
    }
    return items.slice(0, 4)
  }, [listing])

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
              className="h-1 bg-white/20 rounded-full flex-1 overflow-hidden focus:outline-none"
            >
              <div
                className="h-full bg-amber-400 transition-all duration-[5000ms] ease-linear"
                style={{
                  width: idx < activeStorySlide ? '100%' : idx === activeStorySlide && !isStoryPaused ? '100%' : '0%',
                  transitionDuration: idx === activeStorySlide && !isStoryPaused ? '5000ms' : '0s'
                }}
              />
            </button>
          ))}
        </div>

        {/* Branding header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            {companyLogoUrl ? (
              <img src={companyLogoUrl} alt={companyName} className="h-7 w-auto object-contain bg-white/90 p-0.5 rounded border border-white/20" />
            ) : (
              <div className="h-7 w-7 rounded-full bg-amber-500 text-black font-black text-[10px] flex items-center justify-center">PA</div>
            )}
            <div>
              <p className="text-xs font-bold text-white leading-none">{companyName}</p>
              <p className="text-[8px] text-amber-300/90 font-bold uppercase tracking-wider mt-0.5">Prime America Real Estate, Inc.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
                {listing.address}
              </h2>
              <p className="text-xs text-gray-300 flex items-center justify-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-amber-400" />
                Middle Village, Queens, NY {listing.zip || '11379'}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3.5 shadow-xl">
              <div>
                <p className="text-[8.5px] text-gray-300 font-bold uppercase tracking-wider">Asking Price</p>
                <p className="text-base font-black text-amber-400 mt-0.5">${listing.price?.toLocaleString() || '—'}</p>
              </div>
              <div className="border-l border-white/15">
                <p className="text-[8.5px] text-gray-300 font-bold uppercase tracking-wider">{residentialTemplate ? 'Bed / Bath' : 'Type'}</p>
                <p className="text-base font-black text-white mt-0.5 capitalize">
                  {residentialTemplate ? `${listing.bedrooms || '—'}/${listing.bathrooms || '—'}` : (listing.propertySubtype || listing.propertyType || 'Commercial')}
                </p>
              </div>
              <div className="border-l border-white/15">
                <p className="text-[8.5px] text-gray-300 font-bold uppercase tracking-wider">{residentialTemplate ? 'Total Size' : 'Building'}</p>
                <p className="text-base font-black text-white mt-0.5">{listing.sqft ? `${listing.sqft.toLocaleString()} sf` : '—'}</p>
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
                <h4 className="font-extrabold text-white text-lg leading-snug">{listingAgent?.name || agent?.name || 'Siddhartha Lama'}</h4>
                <p className="text-xs text-amber-300 font-bold mt-0.5">{isSharedLeadView ? 'Presented By' : 'Listing Agent'} • {listingAgent?.brokerage || companyName}</p>
                <p className="text-[10px] text-gray-300 mt-1">License: {agent?.license_number || '10401340123'} (NY)</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
                <a
                  href={`tel:${listingAgent?.phone || agent?.phone || '9294248950'}`}
                  onClick={(e) => e.stopPropagation()}
                  className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Phone className="h-4 w-4" /> Tap to Call
                </a>
                <a
                  href={`mailto:${listingAgent?.email || agent?.email || 'info@primeamericany.com'}`}
                  onClick={(e) => e.stopPropagation()}
                  className="min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Mail className="h-4 w-4" /> Tap to Email
                </a>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 2: Standout Features & Punchy Highlights */}
        {activeStorySlide === 2 && (
          <div className="w-full max-w-sm animate-fade-in-up space-y-4 text-left">
            <h3 className="text-base font-serif font-black text-white text-center">Standout Home Features</h3>

            <div className="grid grid-cols-2 gap-2.5">
              {dynamicStandoutFeatures.map((feat, i) => (
                <div key={i} className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3.5">
                  <p className="text-[9px] text-amber-400 font-extrabold uppercase tracking-wider">{feat.category}</p>
                  <p className="text-xs font-bold text-white mt-1 capitalize">{feat.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-4 space-y-2">
              <p className="text-xs text-gray-200 leading-relaxed">
                {showFullDesc ? listing.description : `${(listing.description || '').substring(0, 180)}...`}
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); setShowFullDesc(!showFullDesc); }}
                className="text-xs font-bold text-amber-400 hover:underline inline-flex items-center gap-1"
              >
                {showFullDesc ? 'Show less' : 'Read full description ↗'}
              </button>
            </div>
          </div>
        )}

        {/* SLIDE 3: Interactive Affordability Calculator */}
        {activeStorySlide === 3 && (
          <div className="w-full max-w-sm animate-fade-in-up space-y-4 text-left">
            <h3 className="text-base font-serif font-black text-white text-center flex items-center justify-center gap-1.5">
              <Calculator className="h-4 w-4 text-amber-400" /> Interactive Affordability
            </h3>

            <div onClick={(e) => e.stopPropagation()} className="bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl p-4 space-y-3.5">
              <div className="text-center bg-black/40 rounded-2xl p-3 border border-white/10">
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Est. Monthly Payment</p>
                <p className="text-2xl font-black text-amber-400 mt-0.5">
                  ${calculatedMonthly ? calculatedMonthly.total.toLocaleString() : '—'}<span className="text-xs text-gray-300 font-normal">/mo</span>
                </p>
                <p className="text-[10px] text-gray-300 mt-1">
                  ${calculatedMonthly?.pAndI.toLocaleString()} P&I + ${calculatedMonthly?.taxes.toLocaleString()} taxes
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

        {/* SLIDE 4: Commute & Neighborhood Map */}
        {activeStorySlide === 4 && (
          <div className="w-full max-w-sm animate-fade-in-up space-y-3.5">
            <h3 className="text-base font-serif font-black text-white text-center flex items-center justify-center gap-1.5">
              <Compass className="h-4 w-4 text-amber-400" /> Neighborhood & Location
            </h3>

            <div onClick={(e) => e.stopPropagation()} className="w-full text-left space-y-3">
              <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl overflow-hidden p-3">
                <p className="text-xs font-bold text-amber-300 mb-2 flex items-center justify-between">
                  <span>{listing.city ? `${listing.city}${listing.state ? `, ${listing.state}` : ''}` : 'Neighborhood'}</span>
                  <span className="text-[10px] text-gray-300 font-normal">Walk Score: {getDynamicWalkScore(listing.zip, listing.city)}</span>
                </p>
                <div className="h-44 rounded-2xl overflow-hidden relative">
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
            </div>
          </div>
        )}

        {/* SLIDE 5: Schedule Tour & Direct Inquiry */}
        {activeStorySlide === 5 && (
          <div className="w-full max-w-sm animate-fade-in-up space-y-4 text-center">
            <h3 className="text-xl font-serif font-black text-amber-400">Schedule Your Private Tour</h3>
            <p className="text-xs text-gray-200 leading-relaxed">
              Inquire directly with {listingAgent?.name || 'Siddhartha Lama'} to arrange a viewing for {listing.address}.
            </p>

            <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onOpenInquiry(listing)}
                className="w-full min-h-[48px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-2xl text-xs shadow-xl transition-all flex items-center justify-center gap-2"
              >
                <Calendar className="h-4 w-4" /> Schedule Tour / Request Info
              </button>

              <a
                href={`tel:${listingAgent?.phone || '9294248950'}`}
                className="w-full min-h-[44px] bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 rounded-2xl text-xs border border-white/15 flex items-center justify-center gap-2"
              >
                <Phone className="h-4 w-4 text-emerald-400" /> Direct Call: (929) 424-8950
              </a>
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
          <Calendar className="h-3.5 w-3.5" /> Schedule Tour
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
  const residentialTemplate = isResidentialType(listing)

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
              <img src={listing.heroMediaUrl.startsWith('http') ? listing.heroMediaUrl : `https://inventory.primeamericarealestate.com${listing.heroMediaUrl}`} alt="Featured" className="w-full h-full object-cover" />
            )}
            <div className="absolute top-3 left-3 bg-blue-600 text-white font-bold text-[9px] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Currently Viewing
            </div>
          </div>
          <div className="p-4 space-y-2">
            <h4 className="font-bold text-gray-900 text-xs truncate">{listing.address}</h4>
            <p className="text-[10px] text-gray-400">{listing.city}, {listing.state}</p>
            <p className="text-[9px] text-gray-500 mt-0.5">
              {residentialTemplate
                ? `${listing.bedrooms || '—'}b | ${listing.bathrooms || '—'}ba | ${listing.sqft?.toLocaleString() || '—'} sf`
                : `${listing.propertySubtype || listing.propertyType || 'Commercial'} | ${listing.sqft?.toLocaleString() || '—'} sf`}
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
              const imgUrl = l.heroMediaUrl
                ? (l.heroMediaUrl.startsWith('http') ? l.heroMediaUrl : `https://inventory.primeamericarealestate.com${l.heroMediaUrl}`)
                : ''
              const listIsResidential = isResidentialType(l)
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
                        {listIsResidential
                          ? `${l.bedrooms || '—'}b | ${l.bathrooms || '—'}ba | ${l.sqft || '—'} sf`
                          : `${l.propertySubtype || l.propertyType || 'Commercial'} | ${l.sqft || '—'} sf`}
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
