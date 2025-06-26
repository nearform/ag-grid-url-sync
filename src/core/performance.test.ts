import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AGGridUrlSync } from './ag-grid-url-sync.js'
import { parseUrlFilters } from './url-parser.js'
import { serializeFilters, generateUrl } from './url-generator.js'
import type { GridApi } from 'ag-grid-community'
import type { FilterState, InternalConfig } from './types.js'

describe('Validation Limits Testing', () => {
  let config: InternalConfig

  beforeEach(() => {
    config = {
      gridApi: {} as any,
      paramPrefix: 'f_',
      maxValueLength: 200,
      onParseError: () => {}
    }
  })

  describe('Critical Validation Logic', () => {
    it('should reject values exceeding maxValueLength limit', () => {
      // This test protects against URL length explosion and memory issues
      const oversizedConfig = { ...config, maxValueLength: 50 }

      const filterState: FilterState = {
        test: {
          filterType: 'text',
          type: 'contains',
          filter: 'x'.repeat(100) // Exceeds limit - critical business rule
        }
      }

      // Must throw to prevent URL length issues
      expect(() => serializeFilters(filterState, oversizedConfig)).toThrow(
        'Filter value exceeds maximum length of 50 characters'
      )

      // Valid values should still work
      const validFilterState: FilterState = {
        test: {
          filterType: 'text',
          type: 'contains',
          filter: 'x'.repeat(30) // Within limit
        }
      }
      expect(() =>
        serializeFilters(validFilterState, oversizedConfig)
      ).not.toThrow()
    })

    it('should handle realistic maximum number of filters', () => {
      // Test business scenario: user has many filtered columns
      const maxFilterState: FilterState = {}
      for (let i = 0; i < 50; i++) {
        // Reduced from 100 - more realistic
        maxFilterState[`column_${i}`] = {
          filterType: 'text',
          type: i % 2 === 0 ? 'contains' : 'eq',
          filter: `value_${i}`
        }
      }

      const params = serializeFilters(maxFilterState, config)
      const url = `https://example.com?${params.toString()}`
      const parsed = parseUrlFilters(url, config)

      // Verify correct handling without errors
      expect(Object.keys(parsed)).toHaveLength(50)
      expect(parsed['column_0'].filter).toBe('value_0')
      expect(parsed['column_49'].filter).toBe('value_49')
    })
  })
})
