import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AGGridUrlSync } from './ag-grid-url-sync.js'
import { parseUrlFilters, serializeFilters, generateUrl } from './utils.js'
import type { GridApi } from 'ag-grid-community'
import type { FilterState, InternalConfig } from './types.js'

describe('Scale & Stress Testing', () => {
  let mockGridApi: GridApi
  let config: InternalConfig

  beforeEach(() => {
    mockGridApi = {
      getFilterModel: vi.fn().mockReturnValue({}),
      setFilterModel: vi.fn()
    } as unknown as GridApi

    config = {
      gridApi: mockGridApi,
      paramPrefix: 'f_',
      maxValueLength: 200,
      onParseError: () => {}
    }
  })

  describe('serializeFilters Scale Testing', () => {
    it('should serialize 100 filters correctly', () => {
      // Create 100 filters
      const filterState: FilterState = {}
      for (let i = 0; i < 100; i++) {
        filterState[`column${i}`] = {
          filterType: 'text',
          type: 'contains',
          filter: `value${i}`
        }
      }

      const result = serializeFilters(filterState, config)

      // Verify correctness of serialization
      expect(result.toString()).toContain('f_column0_contains=value0')
      expect(result.toString()).toContain('f_column99_contains=value99')
      expect(result.toString().split('&')).toHaveLength(100)
    })

    it('should handle stress test with 1000 filters', () => {
      // Stress test with 1000 filters
      const filterState: FilterState = {}
      for (let i = 0; i < 1000; i++) {
        filterState[`col${i}`] = {
          filterType: 'text',
          type: i % 2 === 0 ? 'contains' : 'eq',
          filter: `testvalue${i}`.repeat(10) // Make values longer
        }
      }

      const result = serializeFilters(filterState, config)

      // Verify it can handle large scale without errors
      expect(result.toString().length).toBeGreaterThan(1000)
      expect(result.toString().split('&')).toHaveLength(1000)
      expect(result.toString()).toContain('f_col0_contains=')
      expect(result.toString()).toContain('f_col999_eq=')
    })
  })

  describe('parseUrlFilters Scale Testing', () => {
    it('should parse complex URLs with many parameters', () => {
      // Create a complex URL with many parameters
      const params: string[] = []
      for (let i = 0; i < 50; i++) {
        params.push(`f_column${i}_contains=value${i}`)
        params.push(`f_status${i}_eq=active${i}`)
      }
      const url = `https://example.com?${params.join('&')}&other=ignore&more=params`

      const result = parseUrlFilters(url, config)

      // Verify correct parsing of complex URLs
      expect(Object.keys(result)).toHaveLength(100) // 50 contains + 50 eq
      expect(result.column0.filter).toBe('value0')
      expect(result.status0.filter).toBe('active0')
      expect(result.column49.type).toBe('contains')
      expect(result.status49.type).toBe('eq')
    })

    it('should handle very long URLs with large filter values', () => {
      // Create URL with long filter values
      const longValue = 'x'.repeat(190) // Near max length
      const params: string[] = []
      for (let i = 0; i < 10; i++) {
        params.push(`f_col${i}_contains=${encodeURIComponent(longValue + i)}`)
      }
      const url = `https://example.com?${params.join('&')}`

      const result = parseUrlFilters(url, config)

      // Verify correct parsing of long URLs
      expect(Object.keys(result)).toHaveLength(10)
      expect(result.col0.filter).toBe(longValue + '0')
      expect(result.col9.filter).toBe(longValue + '9')
      expect(result.col0.type).toBe('contains')
    })
  })

  describe('generateUrl Scale Testing', () => {
    it('should generate URLs correctly for typical use cases', () => {
      // Mock typical filter model
      const typicalFilterModel = {}
      for (let i = 0; i < 10; i++) {
        typicalFilterModel[`column${i}`] = {
          filterType: 'text',
          type: i % 2 === 0 ? 'contains' : 'equals',
          filter: `value${i}`
        }
      }

      mockGridApi.getFilterModel = vi.fn().mockReturnValue(typicalFilterModel)
      const urlSync = new AGGridUrlSync(mockGridApi)

      const result = urlSync.generateUrl('https://example.com')

      // Verify correct URL generation
      expect(result).toContain('f_column0_contains=value0')
      expect(result).toContain('f_column1_eq=value1')
      expect(result).toContain('f_column9_eq=value9')
      expect(result.split('?')[1].split('&')).toHaveLength(10)
    })

    it('should handle large filter models correctly', () => {
      // Mock large filter model
      const largeFilterModel = {}
      for (let i = 0; i < 100; i++) {
        largeFilterModel[`column${i}`] = {
          filterType: 'text',
          type: 'contains',
          filter: `value${i}`
        }
      }

      mockGridApi.getFilterModel = vi.fn().mockReturnValue(largeFilterModel)
      const urlSync = new AGGridUrlSync(mockGridApi)

      const result = urlSync.generateUrl('https://example.com')

      // Verify correct handling of large filter models
      expect(result.length).toBeGreaterThan(1000)
      expect(result.split('?')[1].split('&')).toHaveLength(100)
      expect(result).toContain('f_column0_contains=value0')
      expect(result).toContain('f_column99_contains=value99')
    })
  })

  describe('Stress Testing', () => {
    it('should handle repeated operations without errors', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)

      // Perform many operations to test stability
      for (let i = 0; i < 100; i++) {
        const result = urlSync.generateUrl(`https://example.com/${i}`)
        expect(result).toContain('https://example.com/')

        urlSync.applyFromUrl(`https://example.com?f_test_contains=value${i}`)
        expect(mockGridApi.setFilterModel).toHaveBeenCalled()
      }

      // Should complete without throwing errors
      expect(mockGridApi.setFilterModel).toHaveBeenCalledTimes(100)
    })

    it('should handle large filter sets correctly', () => {
      // Create very large filter state
      const largeFilterState: FilterState = {}
      for (let i = 0; i < 100; i++) {
        largeFilterState[`column${i}`] = {
          filterType: 'text',
          type: 'contains',
          filter: `value${i}`.repeat(10) // Longer values
        }
      }

      // Perform operations with large data
      const serialized = serializeFilters(largeFilterState, config)
      expect(serialized.toString().split('&')).toHaveLength(100)

      const url = `https://example.com?${serialized.toString()}`
      const parsed = parseUrlFilters(url, config)
      expect(Object.keys(parsed)).toHaveLength(100)
      expect(parsed.column0.filter).toContain('value0')
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle rapid successive calls correctly', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)

      // Test rapid successive calls for correctness
      const results: string[] = []
      for (let i = 0; i < 50; i++) {
        const result = urlSync.generateUrl(`https://example.com?iteration=${i}`)
        results.push(result)
      }

      // All results should be valid URLs
      results.forEach((result, index) => {
        expect(result).toContain('https://example.com')
        expect(result).toContain(`iteration=${index}`)
      })
    })

    it('should handle concurrent-like operations correctly', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)

      // Simulate rapid operations like a user quickly changing filters
      const promises: Promise<unknown>[] = []
      for (let i = 0; i < 20; i++) {
        // Simulate async-like operations
        promises.push(
          new Promise(resolve => {
            setTimeout(() => {
              const result = urlSync.generateUrl(
                `https://example.com?test=${i}`
              )
              expect(result).toContain('https://example.com')

              urlSync.applyFromUrl(
                `https://example.com?f_test_contains=value${i}`
              )
              resolve(i)
            }, Math.random() * 10)
          })
        )
      }

      return Promise.all(promises).then(() => {
        // Should complete without errors and all operations should work
        expect(mockGridApi.setFilterModel).toHaveBeenCalled()
      })
    })
  })

  describe('Scale Testing', () => {
    it('should handle maximum practical filter counts correctly', () => {
      // Test with a realistic maximum number of filters (100 columns)
      const maxFilterState: FilterState = {}
      for (let i = 0; i < 100; i++) {
        maxFilterState[`column_${i}`] = {
          filterType: 'text',
          type: i % 2 === 0 ? 'contains' : 'eq',
          filter: `filter_value_${i}_with_some_length`
        }
      }

      const params = serializeFilters(maxFilterState, config)
      const url = `https://example.com?${params.toString()}`
      const parsed = parseUrlFilters(url, config)

      // Verify correct handling of large scale
      expect(Object.keys(parsed)).toHaveLength(100)
      expect(parsed['column_0'].filter).toBe('filter_value_0_with_some_length')
      expect(parsed['column_99'].filter).toBe(
        'filter_value_99_with_some_length'
      )
      expect(parsed['column_0'].type).toBe('contains')
      expect(parsed['column_1'].type).toBe('eq')
    })

    it('should reject values exceeding limits gracefully', () => {
      const oversizedConfig = { ...config, maxValueLength: 50 }

      const filterState: FilterState = {
        test: {
          filterType: 'text',
          type: 'contains',
          filter: 'x'.repeat(100) // Exceeds limit
        }
      }

      // Test that validation works correctly (timing removed for CI reliability)
      expect(() => serializeFilters(filterState, oversizedConfig)).toThrow()

      // Also test that valid values still work
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
  })
})
