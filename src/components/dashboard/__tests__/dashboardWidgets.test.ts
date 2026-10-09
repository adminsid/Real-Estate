import { describe, it, expect } from 'vitest'
import { OPEN_PIPELINE_STATUSES } from '@/lib/transactionStatus'

describe('Dashboard Fault-Tolerance & Status Calculation', () => {
  it('correctly filters open pipeline statuses for deals metric calculations', () => {
    const testDeals = [
      { id: '1', name: 'Deal 1', status: 'lead' },
      { id: '2', name: 'Deal 2', status: 'active' },
      { id: '3', name: 'Deal 3', status: 'under_contract' },
      { id: '4', name: 'Deal 4', status: 'closed' },
      { id: '5', name: 'Deal 5', status: 'fallen_through' },
    ]

    const openDeals = testDeals.filter(d => OPEN_PIPELINE_STATUSES.includes(d.status as any))
    expect(openDeals.length).toBe(3)
    expect(openDeals.map(d => d.id)).toEqual(['1', '2', '3'])
  })

  it('safely computes commission volume without crashing on null or missing fields', () => {
    const deals = [
      { id: '1', price: 500000, commission_rate: 2.5 },
      { id: '2', commission_amount: 15000 },
      { id: '3', price: null, commission_rate: null },
      { id: '4' },
    ]

    const getComm = (t: any) => {
      if (t.commission_amount && Number(t.commission_amount) > 0) return Number(t.commission_amount)
      if (t.price && t.commission_rate && Number(t.price) > 0 && Number(t.commission_rate) > 0) {
        return (Number(t.price) * Number(t.commission_rate)) / 100
      }
      return 0
    }

    const totalVolume = deals.reduce((acc, d) => acc + getComm(d), 0)
    expect(totalVolume).toBe(12500 + 15000)
  })

  it('safely calculates closing soon items without throwing on invalid dates', () => {
    const in14Days = Date.now() + 14 * 24 * 60 * 60 * 1000
    const deals = [
      { id: '1', target_close_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() },
      { id: '2', target_close_date: 'invalid-date-string' },
      { id: '3', target_close_date: null },
    ]

    let closingSoon = 0
    deals.forEach((t: any) => {
      if (t.target_close_date) {
        const closeDate = Date.parse(t.target_close_date)
        if (!isNaN(closeDate) && closeDate >= Date.now() && closeDate <= in14Days) {
          closingSoon++
        }
      }
    })

    expect(closingSoon).toBe(1)
  })

  it('correctly resolves visible quick links with personal overriding default', () => {
    const defaultLinks = [
      { id: '1', label: 'Company Portal', url: 'https://portal.example.com', icon: 'Globe', visibility: 'all' as const },
      { id: '2', label: 'Admin Only', url: '/admin', icon: 'Lock', visibility: 'admin' as const },
    ]

    const userPersonalLinks = [
      { id: 'u1', label: 'My MLS Search', url: 'https://mls.example.com', icon: 'Search' },
    ]

    const isQuickLinkVisible = (link: any, userRole: string, userId: string) => {
      const visibility = link.visibility || 'all'
      if (visibility === 'me') return !!link.ownerUserId && link.ownerUserId === userId
      return visibility === 'all' || userRole === visibility
    }

    // When user has personal quick links configured, they override company defaults
    const resolveQuickLinks = (personal: any[] | null, defaults: any[], userRole: string, userId: string) => {
      if (personal !== null && personal.length > 0) return personal
      return defaults.filter(l => isQuickLinkVisible(l, userRole, userId))
    }

    // User with personal links
    const salespersonPersonal = resolveQuickLinks(userPersonalLinks, defaultLinks, 'salesperson', 'user_123')
    expect(salespersonPersonal).toHaveLength(1)
    expect(salespersonPersonal[0].label).toBe('My MLS Search')

    // User without personal links (fallback to role-filtered defaults)
    const salespersonDefault = resolveQuickLinks(null, defaultLinks, 'salesperson', 'user_123')
    expect(salespersonDefault).toHaveLength(1)
    expect(salespersonDefault[0].label).toBe('Company Portal')

    const adminDefault = resolveQuickLinks(null, defaultLinks, 'admin', 'user_admin')
    expect(adminDefault).toHaveLength(2)
  })
})
