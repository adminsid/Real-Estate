export interface CanonicalContact {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  type: string
  status: string
  source: string | null
  notes: string | null
  tags: string[]
  address: string | null
  assigned_to: string | null
  timeline?: string | null
  budget_min?: number | null
  budget_max?: number | null
  financing_readiness?: string | null
  move_date?: string | null
  seller_motivation?: string | null
  representation_status?: string | null
  urgency?: string | null
  preferred_contact_method?: string | null
  language?: string | null
  next_follow_up_date?: string | null
  next_action?: string | null
  lead_stage?: string | null
  created_at: string
  updated_at: string
}

export interface AutofillValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validates offer/LOI participant field mappings to prevent client-facing output errors.
 */
export function validateOfferAutofill(offerData: {
  buyerName?: string
  sellerName?: string
  buyerAttorneyName?: string
  sellerAttorneyName?: string
  buyerAttorneyEmail?: string
  sellerAttorneyEmail?: string
  loanOfficerName?: string
  offerPrice?: number
}): AutofillValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!offerData.buyerName || !offerData.buyerName.trim()) {
    errors.push('Buyer name is required for offer generation.')
  }
  if (!offerData.offerPrice || offerData.offerPrice <= 0) {
    errors.push('A valid offer purchase price is required.')
  }

  // Check Buyer Attorney vs Seller Attorney collision
  if (
    offerData.buyerAttorneyName &&
    offerData.sellerAttorneyName &&
    offerData.buyerAttorneyName.trim().toLowerCase() === offerData.sellerAttorneyName.trim().toLowerCase()
  ) {
    errors.push('Buyer attorney and Seller attorney cannot be the same person. Please verify attorney contact details.')
  }

  if (
    offerData.buyerAttorneyEmail &&
    offerData.sellerAttorneyEmail &&
    offerData.buyerAttorneyEmail.trim().toLowerCase() === offerData.sellerAttorneyEmail.trim().toLowerCase()
  ) {
    errors.push('Buyer attorney email matches Seller attorney email. Please provide distinct attorney contact info.')
  }

  if (!offerData.buyerAttorneyName) {
    warnings.push('Buyer attorney is not assigned. Formal contracts will require purchaser legal counsel.')
  }
  if (!offerData.sellerAttorneyName) {
    warnings.push('Seller attorney is not assigned.')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

export interface DuplicateMatchResult {
  contact: CanonicalContact
  matchType: 'exact_email' | 'exact_phone' | 'name_similarity'
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Validates email format using standard regex.
 */
export function validateEmail(email: string): boolean {
  if (!email || !email.trim()) return true // Empty is valid (optional field)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email.trim())
}

export interface AddressValidationResult {
  valid: boolean
  normalized?: string
  errors: string[]
}

/**
 * Validates address structure (street, city, state, ZIP).
 * Accepts flexible formats but requires at least street + city + state + ZIP.
 */
export function validateAddress(address: string): AddressValidationResult {
  const errors: string[] = []
  if (!address || !address.trim()) {
    return { valid: true, errors: [] } // Empty is valid (optional field)
  }

  const trimmed = address.trim()
  // Check for basic US address components
  const hasStreet = /\d+/.test(trimmed) // Has a number (street number)
  const hasCityStateZip = /[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5}/.test(trimmed) // City, State ZIP

  if (!hasStreet) {
    errors.push('Address should include a street number and name.')
  }
  if (!hasCityStateZip) {
    errors.push('Address should include City, State, and ZIP code (e.g., "New York, NY 10001").')
  }

  // Normalize: ensure consistent spacing around commas
  const normalized = trimmed
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s{2,}/g, ' ')

  return {
    valid: errors.length === 0,
    normalized: errors.length === 0 ? normalized : undefined,
    errors,
  }
}

/**
 * Resolves the client-facing professional title for a user.
 * Falls back to a role-based title when no explicit title is stored.
 * Handles associate_broker (set by the NY DOS sync) and generic agent roles.
 */
export function getClientFacingTitle(user: { title?: string | null; role?: string } | null | undefined): string {
  if (user?.title && user.title.trim()) return user.title.trim()
  const role = (user?.role || '').toLowerCase()
  if (role === 'broker' || role === 'associate_broker') return 'Licensed Real Estate Broker'
  if (role === 'admin') return 'Managing Broker / Admin'
  if (role === 'salesperson' || role === 'agent') return 'Licensed Real Estate Salesperson'
  return 'Licensed Real Estate Salesperson'
}

/**
 * Finds potential duplicate contacts matching email or phone strictly, or soft-warning on name similarity.
 * Includes fuzzy name matching as fallback for records without email/phone.
 */
export function findDuplicateContacts(
  candidate: { firstName: string; lastName: string; email?: string; phone?: string },
  existingContacts: CanonicalContact[],
  ignoreId?: string
): DuplicateMatchResult[] {
  const matches: DuplicateMatchResult[] = []

  const candEmail = candidate.email?.trim().toLowerCase()
  const candPhone = candidate.phone?.replace(/\D/g, '')
  const candFirst = candidate.firstName.trim().toLowerCase()
  const candLast = candidate.lastName.trim().toLowerCase()

  for (const c of existingContacts) {
    if (ignoreId && c.id === ignoreId) continue

    const cEmail = c.email?.trim().toLowerCase()
    const cPhone = c.phone?.replace(/\D/g, '')
    const cFirst = (c.first_name || '').trim().toLowerCase()
    const cLast = (c.last_name || '').trim().toLowerCase()

    // Exact email match (highest confidence)
    if (candEmail && cEmail && candEmail === cEmail) {
      matches.push({ contact: c, matchType: 'exact_email', confidence: 'high' })
      continue
    }

    // Exact phone match (high confidence)
    if (candPhone && cPhone && candPhone.length >= 7 && candPhone === cPhone) {
      matches.push({ contact: c, matchType: 'exact_phone', confidence: 'high' })
      continue
    }

    // Exact first + last name match (medium confidence)
    if (candFirst && candLast && cFirst === candFirst && cLast === candLast) {
      matches.push({ contact: c, matchType: 'name_similarity', confidence: 'medium' })
      continue
    }

    // Fuzzy name match: first name contains + last name exact, or vice versa (medium confidence)
    // Only if both have names and no email/phone match was found
    if (candFirst && candLast && cFirst && cLast) {
      const firstContains = candFirst.includes(cFirst) || cFirst.includes(candFirst)
      const lastContains = candLast.includes(cLast) || cLast.includes(candLast)
      if (firstContains && lastContains) {
        matches.push({ contact: c, matchType: 'name_similarity', confidence: 'medium' })
      }
    }
  }

  return matches
}
