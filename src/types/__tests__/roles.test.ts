import { describe, it, expect } from 'vitest'
import { ROLE_HIERARCHY, roleAtLeast, assertRole } from '../roles'

describe('Role Hierarchy & Privilege Matrix', () => {
  it('correctly orders all 6 canonical roles from lowest to highest privilege', () => {
    expect(ROLE_HIERARCHY).toEqual([
      'partner',
      'vendor',
      'assistant',
      'salesperson',
      'broker',
      'admin',
    ])
  })

  describe('roleAtLeast', () => {
    it('admin satisfies all role minimums', () => {
      for (const role of ROLE_HIERARCHY) {
        expect(roleAtLeast('admin', role)).toBe(true)
      }
    })

    it('broker satisfies broker, salesperson, assistant, vendor, partner but NOT admin', () => {
      expect(roleAtLeast('broker', 'admin')).toBe(false)
      expect(roleAtLeast('broker', 'broker')).toBe(true)
      expect(roleAtLeast('broker', 'salesperson')).toBe(true)
      expect(roleAtLeast('broker', 'assistant')).toBe(true)
      expect(roleAtLeast('broker', 'vendor')).toBe(true)
      expect(roleAtLeast('broker', 'partner')).toBe(true)
    })

    it('salesperson meets salesperson, assistant, vendor, partner requirements', () => {
      expect(roleAtLeast('salesperson', 'admin')).toBe(false)
      expect(roleAtLeast('salesperson', 'broker')).toBe(false)
      expect(roleAtLeast('salesperson', 'salesperson')).toBe(true)
      expect(roleAtLeast('salesperson', 'assistant')).toBe(true)
      expect(roleAtLeast('salesperson', 'vendor')).toBe(true)
      expect(roleAtLeast('salesperson', 'partner')).toBe(true)
    })

    it('returns false for unknown role strings', () => {
      expect(roleAtLeast('unknown_role', 'salesperson')).toBe(false)
    })
  })

  describe('assertRole', () => {
    it('does not throw when user meets or exceeds role', () => {
      expect(() => assertRole('admin', 'broker')).not.toThrow()
      expect(() => assertRole('broker', 'salesperson')).not.toThrow()
    })

    it('throws descriptive error when role is insufficient', () => {
      expect(() => assertRole('salesperson', 'admin')).toThrow(
        /Insufficient privileges: role 'salesperson' does not meet minimum required role 'admin'/
      )
    })
  })
})
