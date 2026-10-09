import { describe, it, expect } from 'vitest'
import {
  APP_MODULES,
  NAV_CATEGORIES,
  isCategoryVisible,
  isSubitemVisible,
} from '../constants/navigation'

describe('Navigation Constants & Roles Test Suite', () => {
  describe('APP_MODULES integrity', () => {
    it('has unique IDs for every module', () => {
      const ids = APP_MODULES.map((m) => m.id)
      const uniqueIds = new Set(ids)
      expect(ids.length).toBe(uniqueIds.size)
    })

    it('has valid categories for all modules', () => {
      const allowedCategories = ['transactions', 'inventory', 'marketing', 'learning', 'hr', 'operations']
      for (const mod of APP_MODULES) {
        expect(allowedCategories).toContain(mod.category)
        expect(mod.name).toBeTruthy()
        expect(mod.path).toBeTruthy()
      }
    })

    it('contains brand-marketing-hub with correct external url', () => {
      const brandHub = APP_MODULES.find((m) => m.id === 'brand-marketing-hub')
      expect(brandHub).toBeDefined()
      expect(brandHub?.externalUrl).toBe('/api/sso/redirect?app=brand-hub&return_to=%2Fdashboard')
    })
  })

  describe('NAV_CATEGORIES integrity', () => {
    it('has unique category IDs', () => {
      const catIds = NAV_CATEGORIES.map((c) => c.id)
      expect(new Set(catIds).size).toBe(catIds.length)
    })

    it('every category has a label, icon, and path', () => {
      for (const cat of NAV_CATEGORIES) {
        expect(cat.id).toBeTruthy()
        expect(cat.label).toBeTruthy()
        expect(cat.icon).toBeTruthy()
        expect(cat.path).toBeTruthy()
      }
    })
  })

  describe('Role Visibility: isCategoryVisible & isSubitemVisible', () => {
    const mockCanAllowAll = () => true
    const mockCanDenyAll = () => false

    it('returns false when user is null', () => {
      expect(isCategoryVisible(NAV_CATEGORIES[0], null, mockCanAllowAll)).toBe(false)
      expect(isSubitemVisible('deals', 'transactions', null, mockCanAllowAll)).toBe(false)
    })

    it('admin user can view all categories and subitems unconditionally', () => {
      const adminUser = { id: 'u1', name: 'Admin', role: 'admin' }
      for (const cat of NAV_CATEGORIES) {
        expect(isCategoryVisible(cat, adminUser, mockCanDenyAll)).toBe(true)
        for (const child of cat.children || []) {
          expect(isSubitemVisible(child.id, cat.id, adminUser, mockCanDenyAll)).toBe(true)
        }
      }
    })

    it('shows operations for authenticated users without a custom permission', () => {
      const user = { id: 'u3', name: 'Operator', role: 'salesperson' }
      const operationsCat = NAV_CATEGORIES.find((c) => c.id === 'operations')
      expect(operationsCat).toBeDefined()
      expect(isCategoryVisible(operationsCat!, user, () => false)).toBe(true)
      expect(isSubitemVisible('operations-projects', 'operations', user, () => false)).toBe(true)
    })

    it('preserves transaction access checks after moving Deals and CMA under Operations', () => {
      const salesperson = { id: 'salesperson', role: 'salesperson' }
      expect(isSubitemVisible('operations-projects', 'operations', salesperson, () => false)).toBe(true)
      for (const childId of ['deals', 'cma']) {
        expect(isSubitemVisible(childId, 'operations', salesperson, () => false)).toBe(false)
        expect(isSubitemVisible(childId, 'operations', salesperson, (module, action) => module === 'transactions' && action === 'read')).toBe(true)
      }
    })

    it('keeps assigned assistants able to find transaction tools without granting project access', () => {
      const assistant = { id: 'assistant', role: 'assistant' }
      const canReadTransactions = (module: string, action: string) => module === 'transactions' && action === 'read'
      const operations = NAV_CATEGORIES.find(cat => cat.id === 'operations')!
      expect(isCategoryVisible(operations, assistant, canReadTransactions)).toBe(true)
      expect(isSubitemVisible('operations-projects', 'operations', assistant, canReadTransactions)).toBe(false)
      expect(isSubitemVisible('deals', 'operations', assistant, canReadTransactions)).toBe(true)
      expect(isCategoryVisible(operations, assistant, () => false)).toBe(false)
    })

    it('hides satellite admin apps from salesperson role', () => {
      const agentUser = { id: 'u2', name: 'Agent', role: 'salesperson' }
      expect(isSubitemVisible('inventory-admin', 'inventory', agentUser, mockCanAllowAll)).toBe(false)
      expect(isSubitemVisible('openhouse-admin', 'marketing', agentUser, mockCanAllowAll)).toBe(false)
      expect(isSubitemVisible('prime-america-kb', 'learning', agentUser, mockCanAllowAll)).toBe(false)

      const hrCat = NAV_CATEGORIES.find((c) => c.id === 'hr')!
      expect(isCategoryVisible(hrCat, agentUser, mockCanDenyAll)).toBe(false)
    })

    it('evaluates permissions for standard agent / salesperson', () => {
      const agentUser = { id: 'u2', name: 'Agent', role: 'salesperson' }

      // When can('transactions', 'read') is true
      const canCustom = (mod: string, action: string) => {
        if (mod === 'transactions' && action === 'read') return true
        if (mod === 'crm' && action === 'read') return false
        if (mod === 'marketing' && action === 'read') return true
        return false
      }

      const txCat = NAV_CATEGORIES.find((c) => c.id === 'transactions')!
      expect(isCategoryVisible(txCat, agentUser, canCustom)).toBe(true)

      // CRM subitem should be hidden if crm:read is denied
      expect(isSubitemVisible('crm', 'marketing', agentUser, canCustom)).toBe(false)

      // Open house subitem is visible when marketing:read is allowed
      expect(isSubitemVisible('openhouse-list', 'marketing', agentUser, canCustom)).toBe(true)
    })
  })
})
