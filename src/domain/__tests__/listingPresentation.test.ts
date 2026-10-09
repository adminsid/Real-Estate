import { describe, expect, it } from 'vitest'
import { getListingPresentation, resolveListingPresentationId } from '../listingPresentation'

describe('listing presentation profiles', () => {
  it.each([
    [{ propertyType: 'Residential', propertySubtype: 'Condominium' }, 'condo'],
    [{ propertyType: 'Residential', propertySubtype: 'Stock Cooperative' }, 'coop'],
    [{ propertyType: 'Residential Income', propertySubtype: 'Duplex' }, 'residential-income'],
    [{ propertyType: 'Rental' }, 'rental'],
    [{ propertyType: 'Land' }, 'land'],
    [{ propertyType: 'Commercial Sale' }, 'commercial-sale'],
    [{ propertyType: 'Commercial Lease' }, 'commercial-lease'],
    [{ propertyType: 'Business Opportunity' }, 'business-opportunity'],
  ])('selects the correct presentation for %o', (listing, expected) => {
    expect(resolveListingPresentationId(listing)).toBe(expected)
  })

  it('prioritizes condo charges without inventing unavailable facts', () => {
    const result = getListingPresentation({
      propertyType: 'Residential', propertySubtype: 'Condominium', price: 650000,
      bedrooms: 2, bathrooms: 2, raw: { data: { AssociationFee: 825 } },
    })
    expect(result.primaryFacts).toContainEqual({ id: 'common', label: 'Common Charges', value: '$825/mo' })
    expect(JSON.stringify(result)).not.toContain('Turn-Key')
    expect(result.primaryFacts.some((item) => item.id === 'taxes')).toBe(false)
  })

  it('uses rental-specific labels and disables mortgage affordability', () => {
    const result = getListingPresentation({ propertyType: 'Rental', price: 3200, availabilityDate: 'October 1' })
    expect(result.priceLabel).toBe('Monthly Rent')
    expect(result.primaryFacts[0]).toEqual({ id: 'rent', label: 'Monthly Rent', value: '$3,200/mo' })
    expect(result.showAffordability).toBe(false)
    expect(result.inquiryAction).toBe('Request Rental Showing')
  })

  it('surfaces investment facts for residential income property', () => {
    const result = getListingPresentation({ propertyType: 'Residential Income', numberOfUnitsTotal: 4, netOperatingIncome: 72000, capRate: 6.25 })
    expect(result.primaryFacts.map((item) => item.id)).toEqual(['units', 'noi', 'cap-rate'])
  })
})
