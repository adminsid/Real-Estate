import { describe, it, expect } from 'vitest'
import {
  validateEmail,
  validateAddress,
  validateOfferAutofill
} from '../reconciliation'

describe('reconciliation utils — validateEmail', () => {
  it('identifies correct emails', () => {
    expect(validateEmail('test@example.com')).toBe(true)
    expect(validateEmail('user.name+label@sub.domain.co')).toBe(true)
  })

  it('rejects incorrect emails', () => {
    expect(validateEmail('plainaddress')).toBe(false)
    expect(validateEmail('@missingusername.com')).toBe(false)
    expect(validateEmail('username@.com')).toBe(false)
  })
})

describe('reconciliation utils — validateAddress', () => {
  it('validates correct formats', () => {
    expect(validateAddress('123 Main St, New York, NY 10001').valid).toBe(true)
  })

  it('detects incomplete addresses', () => {
    expect(validateAddress('Main St').valid).toBe(false)
  })
})

describe('reconciliation utils — validateOfferAutofill', () => {
  it('requires buyer name and offer price', () => {
    const res = validateOfferAutofill({
      buyerName: '',
      offerPrice: 0
    })
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('Buyer name is required for offer generation.')
    expect(res.errors).toContain('A valid offer purchase price is required.')
  })

  it('passes on valid basic details and gives warning for missing attorneys', () => {
    const res = validateOfferAutofill({
      buyerName: 'John Doe',
      offerPrice: 500000
    })
    expect(res.valid).toBe(true)
    expect(res.errors.length).toBe(0)
    expect(res.warnings).toContain('Buyer attorney is not assigned. Formal contracts will require purchaser legal counsel.')
  })

  it('errors if buyer attorney and seller attorney are the same person', () => {
    const res = validateOfferAutofill({
      buyerName: 'John Doe',
      offerPrice: 500000,
      buyerAttorneyName: 'Bob Smith',
      sellerAttorneyName: 'Bob Smith'
    })
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('Buyer attorney and Seller attorney cannot be the same person. Please verify attorney contact details.')
  })

  it('errors if buyer attorney and seller attorney email match', () => {
    const res = validateOfferAutofill({
      buyerName: 'John Doe',
      offerPrice: 500000,
      buyerAttorneyName: 'Bob Smith',
      sellerAttorneyName: 'Alice Green',
      buyerAttorneyEmail: 'bob@attorney.com',
      sellerAttorneyEmail: 'bob@attorney.com'
    })
    expect(res.valid).toBe(false)
    expect(res.errors).toContain('Buyer attorney email matches Seller attorney email. Please provide distinct attorney contact info.')
  })
})
