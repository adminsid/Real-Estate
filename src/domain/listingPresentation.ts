export type ListingPresentationId =
  | 'residential-sale'
  | 'condo'
  | 'coop'
  | 'residential-income'
  | 'rental'
  | 'land'
  | 'commercial-sale'
  | 'commercial-lease'
  | 'business-opportunity'

export type PresentationFact = {
  id: string
  label: string
  value: string
}

export type PresentationSection = {
  title: string
  facts: PresentationFact[]
}

export type ListingPresentation = {
  id: ListingPresentationId
  label: string
  priceLabel: string
  inquiryTitle: string
  inquiryAction: string
  inquiryPrompt: string
  highlightTitle: string
  showAffordability: boolean
  showSchools: boolean
  primaryFacts: PresentationFact[]
  sections: PresentationSection[]
}

type ListingRecord = Record<string, any>

const text = (value: unknown) => {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.filter(Boolean).join(', ')
  return String(value).trim()
}

const number = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const money = (value: unknown, suffix = '') => {
  const parsed = number(value)
  return parsed === null ? '' : `$${parsed.toLocaleString()}${suffix}`
}

const quantity = (value: unknown, suffix: string) => {
  const parsed = number(value)
  return parsed === null ? '' : `${parsed.toLocaleString()} ${suffix}`
}

const percentage = (value: unknown) => {
  const parsed = number(value)
  return parsed === null ? '' : `${parsed.toLocaleString()}%`
}

function source(listing: ListingRecord) {
  return { ...(listing.raw?.data || {}), ...(listing.raw || {}), ...listing }
}

function first(record: ListingRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value !== null && value !== undefined && text(value) !== '') return value
  }
  return null
}

function fact(id: string, label: string, value: unknown): PresentationFact | null {
  const normalized = text(value)
  return normalized ? { id, label, value: normalized } : null
}

function facts(items: Array<PresentationFact | null>) {
  return items.filter((item): item is PresentationFact => Boolean(item))
}

function section(title: string, items: Array<PresentationFact | null>): PresentationSection | null {
  const available = facts(items)
  return available.length ? { title, facts: available } : null
}

export function resolveListingPresentationId(listing: ListingRecord | null | undefined): ListingPresentationId {
  const record = source(listing || {})
  const type = text(first(record, 'propertyType', 'PropertyType', 'type')).toLowerCase()
  const subtype = text(first(record, 'propertySubtype', 'PropertySubType', 'subtype')).toLowerCase()
  const combined = `${type} ${subtype}`

  if (combined.includes('business opportunity')) return 'business-opportunity'
  if (type.includes('commercial lease')) return 'commercial-lease'
  if (type.includes('commercial')) return 'commercial-sale'
  if (type.includes('land') || subtype.includes('land')) return 'land'
  if (type.includes('residential income') || /duplex|triplex|quadruplex|2-4/.test(combined)) return 'residential-income'
  if (type.includes('rental') || type === 'lease') return 'rental'
  if (/stock cooperative|co-op|coop/.test(subtype)) return 'coop'
  if (subtype.includes('condominium') || subtype === 'condo') return 'condo'
  return 'residential-sale'
}

export function getListingPresentation(listing: ListingRecord | null | undefined): ListingPresentation {
  const record = source(listing || {})
  const id = resolveListingPresentationId(record)
  const price = first(record, 'price', 'ListPrice', 'listPrice')
  const bedrooms = first(record, 'bedrooms', 'BedroomsTotal', 'bedroomsTotal')
  const bathrooms = first(record, 'bathrooms', 'BathroomsTotalInteger', 'bathroomsTotalInteger')
  const area = first(record, 'sqft', 'LivingArea', 'livingArea', 'buildingArea')
  const lotArea = first(record, 'lotSize', 'LotSizeArea', 'lotSizeArea')
  const yearBuilt = first(record, 'yearBuilt', 'YearBuilt', 'year_built')
  const taxes = first(record, 'taxAnnualAmount', 'TaxAnnualAmount')
  const commonCharges = first(record, 'common_charges', 'hoaFee', 'AssociationFee', 'associationFee')
  const maintenance = first(record, 'maintenanceFee', 'monthlyMaintenance', 'maintenance')
  const units = first(record, 'numberOfUnitsTotal', 'NumberOfUnitsTotal', 'numberOfUnitsInCommunity', 'unitstotal')
  const zoning = first(record, 'zoning', 'Zoning', 'mlsAreaMajor')
  const noi = first(record, 'netOperatingIncome', 'NetOperatingIncome', 'noi')
  const capRate = first(record, 'capRate', 'CapRate')
  const occupancy = first(record, 'occupancy', 'Occupancy')
  const availability = first(record, 'availabilityDate', 'AvailabilityDate', 'availableOn')
  const leaseTerm = first(record, 'leaseTerm', 'LeaseTerm', 'leaseLength')
  const utilities = first(record, 'utilities', 'Utilities', 'utilitiesIncluded')
  const far = first(record, 'floorAreaRatio', 'FloorAreaRatio', 'far')
  const askingRent = first(record, 'leaseAmount', 'LeaseAmount', 'price', 'ListPrice')
  const cam = first(record, 'camCharges', 'CAMCharges', 'commonAreaMaintenance')
  const delivery = first(record, 'deliveryCondition', 'DeliveryCondition')
  const permittedUse = first(record, 'permittedUse', 'PermittedUse', 'businessType', 'BusinessType')
  const revenue = first(record, 'grossRevenue', 'GrossRevenue', 'annualRevenue')
  const cashFlow = first(record, 'cashFlow', 'CashFlow', 'sellerDiscretionaryEarnings')
  const parking = first(record, 'parkingFeatures', 'ParkingFeatures', 'parking')
  const heating = first(record, 'heating', 'Heating')
  const cooling = first(record, 'cooling', 'Cooling')
  const appliances = first(record, 'appliances', 'Appliances')
  const flooring = first(record, 'flooring', 'Flooring')
  const basement = first(record, 'basement', 'Basement')
  const exterior = first(record, 'exteriorFeatures', 'ExteriorFeatures', 'exterior')
  const roof = first(record, 'roof', 'Roof')
  const construction = first(record, 'constructionMaterials', 'ConstructionMaterials')
  const sewer = first(record, 'sewer', 'Sewer')
  const water = first(record, 'waterSource', 'WaterSource')
  const garage = first(record, 'garageSpaces', 'GarageSpaces')
  const petPolicy = first(record, 'petPolicy', 'PetsAllowed', 'petsAllowed')
  const financing = first(record, 'financingAllowed', 'FinancingAllowed', 'minimumDownPayment')

  const sharedSections = [
    section('Property Details', [
      fact('year-built', 'Year Built', yearBuilt),
      fact('zoning', 'Zoning', zoning),
      fact('taxes', 'Annual Taxes', money(taxes)),
      fact('parking', 'Parking', parking),
    ]),
    section('Interior & Systems', [
      fact('heating', 'Heating', heating),
      fact('cooling', 'Cooling', cooling),
      fact('appliances', 'Appliances', appliances),
      fact('flooring', 'Flooring', flooring),
      fact('basement', 'Basement', basement),
      fact('utilities', 'Utilities', utilities),
    ]),
    section('Exterior & Utilities', [
      fact('exterior', 'Exterior Features', exterior),
      fact('roof', 'Roof', roof),
      fact('construction', 'Construction', construction),
      fact('garage', 'Garage Spaces', garage),
      fact('sewer', 'Sewer', sewer),
      fact('water', 'Water', water),
    ]),
  ].filter((item): item is PresentationSection => Boolean(item))

  const base = {
    showSchools: ['residential-sale', 'condo', 'coop', 'residential-income', 'rental'].includes(id),
    highlightTitle: id === 'business-opportunity' ? 'Business Highlights' : id.includes('commercial') ? 'Commercial Highlights' : id === 'land' ? 'Site Highlights' : 'Property Highlights',
  }

  switch (id) {
    case 'condo':
      return {
        ...base, id, label: 'Condominium', priceLabel: 'Asking Price', inquiryTitle: 'Schedule a Private Tour', inquiryAction: 'Request Private Showing', inquiryPrompt: 'I would like more information about this condominium.', showAffordability: true,
        primaryFacts: facts([fact('price', 'Asking Price', money(price)), fact('beds', 'Bedrooms', bedrooms), fact('baths', 'Bathrooms', bathrooms), fact('area', 'Interior Area', quantity(area, 'sq ft')), fact('common', 'Common Charges', money(commonCharges, '/mo')), fact('taxes', 'Annual Taxes', money(taxes))]),
        sections: [section('Condominium Details', [fact('common', 'Common Charges', money(commonCharges, '/mo')), fact('taxes', 'Annual Taxes', money(taxes)), fact('financing', 'Financing', financing), fact('pets', 'Pet Policy', petPolicy)]), ...sharedSections].filter((item): item is PresentationSection => Boolean(item)),
      }
    case 'coop':
      return {
        ...base, id, label: 'Cooperative', priceLabel: 'Asking Price', inquiryTitle: 'Schedule a Private Tour', inquiryAction: 'Request Private Showing', inquiryPrompt: 'I would like more information about this cooperative apartment.', showAffordability: true,
        primaryFacts: facts([fact('price', 'Asking Price', money(price)), fact('beds', 'Bedrooms', bedrooms), fact('baths', 'Bathrooms', bathrooms), fact('area', 'Interior Area', quantity(area, 'sq ft')), fact('maintenance', 'Maintenance', money(maintenance || commonCharges, '/mo')), fact('year-built', 'Year Built', yearBuilt)]),
        sections: [section('Co-op Details', [fact('maintenance', 'Monthly Maintenance', money(maintenance || commonCharges, '/mo')), fact('financing', 'Financing / Down Payment', financing), fact('pets', 'Pet Policy', petPolicy), fact('lease', 'Sublet Policy', first(record, 'subletPolicy', 'SubletPolicy'))]), ...sharedSections].filter((item): item is PresentationSection => Boolean(item)),
      }
    case 'residential-income':
      return {
        ...base, id, label: 'Residential Income', priceLabel: 'Asking Price', inquiryTitle: 'Request Investment Details', inquiryAction: 'Request Property Package', inquiryPrompt: 'I would like the available investment details for this income property.', showAffordability: false,
        primaryFacts: facts([fact('price', 'Asking Price', money(price)), fact('units', 'Units', units), fact('area', 'Building Area', quantity(area, 'sq ft')), fact('noi', 'NOI', money(noi, '/yr')), fact('cap-rate', 'Cap Rate', percentage(capRate)), fact('occupancy', 'Occupancy', occupancy)]),
        sections: [section('Investment Details', [fact('units', 'Unit Count', units), fact('noi', 'Net Operating Income', money(noi, '/yr')), fact('cap-rate', 'Cap Rate', percentage(capRate)), fact('occupancy', 'Occupancy', occupancy)]), ...sharedSections].filter((item): item is PresentationSection => Boolean(item)),
      }
    case 'rental':
      return {
        ...base, id, label: 'Rental', priceLabel: 'Monthly Rent', inquiryTitle: 'Schedule a Rental Tour', inquiryAction: 'Request Rental Showing', inquiryPrompt: 'I would like more information about renting this property.', showAffordability: false,
        primaryFacts: facts([fact('rent', 'Monthly Rent', money(price, '/mo')), fact('beds', 'Bedrooms', bedrooms), fact('baths', 'Bathrooms', bathrooms), fact('area', 'Interior Area', quantity(area, 'sq ft')), fact('available', 'Available', availability), fact('term', 'Lease Term', leaseTerm)]),
        sections: [section('Lease Details', [fact('available', 'Availability', availability), fact('term', 'Lease Term', leaseTerm), fact('utilities', 'Utilities', utilities), fact('pets', 'Pet Policy', petPolicy)]), ...sharedSections].filter((item): item is PresentationSection => Boolean(item)),
      }
    case 'land':
      return {
        ...base, id, label: 'Land', priceLabel: 'Asking Price', inquiryTitle: 'Request Site Information', inquiryAction: 'Request Site Details', inquiryPrompt: 'I would like the available site and zoning information for this land listing.', showAffordability: false,
        primaryFacts: facts([fact('price', 'Asking Price', money(price)), fact('lot-area', 'Lot Area', quantity(lotArea, 'sq ft')), fact('zoning', 'Zoning', zoning), fact('far', 'FAR', far), fact('use', 'Permitted Use', permittedUse), fact('utilities', 'Utilities', utilities)]),
        sections: [section('Site & Development', [fact('lot-area', 'Lot Area', quantity(lotArea, 'sq ft')), fact('zoning', 'Zoning', zoning), fact('far', 'Floor Area Ratio', far), fact('use', 'Permitted Use', permittedUse), fact('utilities', 'Utilities', utilities)])].filter((item): item is PresentationSection => Boolean(item)),
      }
    case 'commercial-sale':
      return {
        ...base, id, label: 'Commercial Sale', priceLabel: 'Asking Price', inquiryTitle: 'Request Commercial Details', inquiryAction: 'Request Offering Details', inquiryPrompt: 'I would like the available commercial property and financial details.', showAffordability: false,
        primaryFacts: facts([fact('price', 'Asking Price', money(price)), fact('area', 'Building Area', quantity(area, 'sq ft')), fact('lot-area', 'Lot Area', quantity(lotArea, 'sq ft')), fact('zoning', 'Zoning', zoning), fact('noi', 'NOI', money(noi, '/yr')), fact('cap-rate', 'Cap Rate', percentage(capRate))]),
        sections: [section('Commercial & Investment', [fact('area', 'Building Area', quantity(area, 'sq ft')), fact('lot-area', 'Lot Area', quantity(lotArea, 'sq ft')), fact('zoning', 'Zoning', zoning), fact('noi', 'Net Operating Income', money(noi, '/yr')), fact('cap-rate', 'Cap Rate', percentage(capRate)), fact('occupancy', 'Occupancy', occupancy), fact('use', 'Permitted Use', permittedUse)])].filter((item): item is PresentationSection => Boolean(item)),
      }
    case 'commercial-lease':
      return {
        ...base, id, label: 'Commercial Lease', priceLabel: 'Asking Rent', inquiryTitle: 'Request a Space Tour', inquiryAction: 'Request Leasing Details', inquiryPrompt: 'I would like the available lease terms and space details.', showAffordability: false,
        primaryFacts: facts([fact('rent', 'Asking Rent', money(askingRent)), fact('area', 'Available Area', quantity(area, 'sq ft')), fact('term', 'Lease Term', leaseTerm), fact('cam', 'CAM / Additional', money(cam)), fact('zoning', 'Zoning', zoning), fact('delivery', 'Delivery', delivery)]),
        sections: [section('Lease & Space Details', [fact('rent', 'Asking Rent', money(askingRent)), fact('area', 'Available Area', quantity(area, 'sq ft')), fact('term', 'Lease Term', leaseTerm), fact('cam', 'CAM / Additional Charges', money(cam)), fact('delivery', 'Delivery Condition', delivery), fact('use', 'Permitted Use', permittedUse), fact('utilities', 'Utilities', utilities)])].filter((item): item is PresentationSection => Boolean(item)),
      }
    case 'business-opportunity':
      return {
        ...base, id, label: 'Business Opportunity', priceLabel: 'Asking Price', inquiryTitle: 'Request Business Information', inquiryAction: 'Request Confidential Details', inquiryPrompt: 'I would like more information about this business opportunity and any available confidentiality requirements.', showAffordability: false,
        primaryFacts: facts([fact('price', 'Asking Price', money(price)), fact('type', 'Business Type', permittedUse), fact('revenue', 'Gross Revenue', money(revenue, '/yr')), fact('cash-flow', 'Cash Flow', money(cashFlow, '/yr')), fact('term', 'Lease Term', leaseTerm), fact('area', 'Premises', quantity(area, 'sq ft'))]),
        sections: [section('Business Summary', [fact('type', 'Business Type', permittedUse), fact('revenue', 'Gross Revenue', money(revenue, '/yr')), fact('cash-flow', 'Cash Flow', money(cashFlow, '/yr')), fact('term', 'Premises Lease', leaseTerm), fact('area', 'Premises Area', quantity(area, 'sq ft'))])].filter((item): item is PresentationSection => Boolean(item)),
      }
    default:
      return {
        ...base, id, label: 'Residential Sale', priceLabel: 'Asking Price', inquiryTitle: 'Schedule a Private Tour', inquiryAction: 'Request Private Showing', inquiryPrompt: 'I would like more information about this property.', showAffordability: true,
        primaryFacts: facts([fact('price', 'Asking Price', money(price)), fact('beds', 'Bedrooms', bedrooms), fact('baths', 'Bathrooms', bathrooms), fact('area', 'Living Area', quantity(area, 'sq ft')), fact('year-built', 'Year Built', yearBuilt), fact('taxes', 'Annual Taxes', money(taxes))]),
        sections: sharedSections,
      }
  }
}
