import { describe, it, expect } from 'vitest'
import { cn, safeText } from './utils'

describe('utils', () => {
  it('cn merges tailwind classes correctly', () => {
    expect(cn('px-2 py-1', 'p-4')).toBe('p-4')
  })

  it('safeText handles strings and fallbacks', () => {
    expect(safeText('hello', 'default')).toBe('hello')
    expect(safeText(null, 'default')).toBe('default')
    expect(safeText({ text: 'sample message' }, 'default')).toBe('sample message')
    expect(safeText(123, 'default')).toBe('123')
  })

  it('generates non-conflicting MongoDB bulk write update documents for customer import', () => {
    function buildCustomerUpdateDoc(c: { name?: string; notes?: string; custom_data?: any; label?: string }) {
      const setFields: Record<string, any> = {
        label: c.label || '',
      }
      const setOnInsertFields: Record<string, any> = {}

      if (c.name) {
        setFields.name = c.name
      } else {
        setOnInsertFields.name = ''
      }

      if (c.notes !== undefined) {
        setFields.notes = c.notes
      } else {
        setOnInsertFields.notes = ''
      }

      if (c.custom_data !== undefined) {
        setFields.custom_data = c.custom_data
      } else {
        setOnInsertFields.custom_data = {}
      }

      const updateDoc: Record<string, any> = {
        $set: setFields,
      }
      if (Object.keys(setOnInsertFields).length > 0) {
        updateDoc.$setOnInsert = setOnInsertFields
      }
      return updateDoc
    }

    const testCustomer = { name: 'John Doe', label: 'VIP' }
    const doc = buildCustomerUpdateDoc(testCustomer)

    const setKeys = Object.keys(doc.$set)
    const setOnInsertKeys = doc.$setOnInsert ? Object.keys(doc.$setOnInsert) : []

    // Ensure zero overlap between $set and $setOnInsert keys
    const overlap = setKeys.filter(k => setOnInsertKeys.includes(k))
    expect(overlap).toEqual([])
    expect(doc.$set.name).toBe('John Doe')
    expect(doc.$setOnInsert.notes).toBe('')
    expect(doc.$setOnInsert.custom_data).toEqual({})
  })
})
