import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TransactionDealOutline } from './TransactionDealOutline'

const state = vi.hoisted(() => ({ outline: {} as Record<string, unknown>, parties: [] as Record<string, unknown>[] }))
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ branding: {} }) }))
vi.mock('./TransactionContext', () => ({
  useTransactionDetail: () => ({ data: { transaction: { name: 'Test deal', parties_involved: JSON.stringify(state.outline) }, parties: state.parties } }),
}))

function sellerNames(outline: Record<string, unknown>, parties: Record<string, unknown>[] = []) {
  state.outline = outline
  state.parties = parties
  const html = renderToStaticMarkup(createElement(TransactionDealOutline))
  return html.match(/Seller\(s\):<\/span> ([\s\S]*?)<\/p>/)?.[1]
}

describe('printed deal outline sellers', () => {
  it.each(['', null, undefined])('prints the seller once when the contact has last_name %s', last_name => {
    expect(sellerNames({ sellerName: 'Example Seller' }, [
      { role: 'seller', first_name: 'Example Seller', last_name },
    ])).toBe('Example Seller')
  })

  it('deduplicates additional sellers and normalized names', () => {
    expect(sellerNames({ sellerName: 'Example Seller', additionalSellers: [{ name: ' example  SELLER ' }] }))
      .toBe('Example Seller')
  })

  it('matches normalized email and preserves the edited name', () => {
    expect(sellerNames({ sellerName: 'Edited Seller', sellerEmail: ' Seller@Example.com ' }, [
      { role: 'seller', first_name: 'Original', last_name: 'Seller', email: 'seller@example.com' },
    ])).toBe('Edited Seller')
  })

  it('keeps distinct sellers with no email and ignores other roles', () => {
    expect(sellerNames({ sellerName: 'First Seller', additionalSellers: [{ name: 'Second Seller' }] }, [
      { role: 'seller', first_name: 'Third', last_name: 'Seller' },
      { role: 'buyer', first_name: 'Example', last_name: 'Buyer' },
    ])).toBe('First Seller, Second Seller, Third Seller')
  })
})
