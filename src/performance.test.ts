import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AGGridUrlSync } from './ag-grid-url-sync.js'
import { parseUrlFilters, serializeFilters, generateUrl } from './utils.js'
import type { GridApi } from 'ag-grid-community'
import type { FilterState, InternalConfig } from './types.js'

describe('Performance Benchmarks', () => {
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

  describe('serializeFilters Performance', () => {
    it('should serialize 100 filters in <10ms', () => {
      // Create 100 filters
      const filterState: FilterState = {}
      for (let i = 0; i < 100; i++) {
        filterState[`column${i}`] = {
          filterType: 'text',
          type: 'contains',
          filter: `value${i}`
        }
      }

      const startTime = performance.now()
      const result = serializeFilters(filterState, config)
      const endTime = performance.now()

      const duration = endTime - startTime
      console.log(`serializeFilters (100 filters): ${duration.toFixed(2)}ms`)

      expect(duration).toBeLessThan(10)
      expect(result.toString()).toContain('f_column0_contains=value0')
      expect(result.toString()).toContain('f_column99_contains=value99')
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

      const startTime = performance.now()
      const result = serializeFilters(filterState, config)
      const endTime = performance.now()

      const duration = endTime - startTime
      console.log(`serializeFilters (1000 filters): ${duration.toFixed(2)}ms`)

      // Should complete in reasonable time even with 1000 filters
      expect(duration).toBeLessThan(100)
      expect(result.toString().length).toBeGreaterThan(1000)
    })
  })

  describe('parseUrlFilters Performance', () => {
    it('should parse complex URLs in <5ms', () => {
      // Create a complex URL with many parameters
      const params: string[] = []
      for (let i = 0; i < 50; i++) {
        params.push(`f_column${i}_contains=value${i}`)
        params.push(`f_status${i}_eq=active${i}`)
      }
      const url = `https://example.com?${params.join('&')}&other=ignore&more=params`

      const startTime = performance.now()
      const result = parseUrlFilters(url, config)
      const endTime = performance.now()

      const duration = endTime - startTime
      console.log(`parseUrlFilters (complex URL): ${duration.toFixed(2)}ms`)

      expect(duration).toBeLessThan(5)
      expect(Object.keys(result)).toHaveLength(100) // 50 contains + 50 eq
    })

    it('should handle very long URLs efficiently', () => {
      // Create URL with long filter values
      const longValue = 'x'.repeat(190) // Near max length
      const params: string[] = []
      for (let i = 0; i < 10; i++) {
        params.push(`f_col${i}_contains=${encodeURIComponent(longValue + i)}`)
      }
      const url = `https://example.com?${params.join('&')}`

      const startTime = performance.now()
      const result = parseUrlFilters(url, config)
      const endTime = performance.now()

      const duration = endTime - startTime
      console.log(`parseUrlFilters (long values): ${duration.toFixed(2)}ms`)

      expect(duration).toBeLessThan(5)
      expect(Object.keys(result)).toHaveLength(10)
    })
  })

  describe('generateUrl Performance', () => {
    it('should generate URLs in <5ms for typical use cases', () => {
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

      const startTime = performance.now()
      const result = urlSync.generateUrl('https://example.com')
      const endTime = performance.now()

      const duration = endTime - startTime
      console.log(`generateUrl (typical): ${duration.toFixed(2)}ms`)

      expect(duration).toBeLessThan(5)
      expect(result).toContain('f_column0_contains=value0')
    })

    it('should handle large filter models efficiently', () => {
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

      const startTime = performance.now()
      const result = urlSync.generateUrl('https://example.com')
      const endTime = performance.now()

      const duration = endTime - startTime
      console.log(`generateUrl (100 filters): ${duration.toFixed(2)}ms`)

      expect(duration).toBeLessThan(20)
      expect(result.length).toBeGreaterThan(1000)
    })
  })

  describe('Memory Usage Tests', () => {
    it('should not leak memory with repeated operations', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)

      // Simulate memory usage monitoring (basic)
      const initialMemory = process.memoryUsage?.() || { heapUsed: 0 }

      // Perform many operations
      for (let i = 0; i < 1000; i++) {
        urlSync.generateUrl(`https://example.com/${i}`)
        urlSync.applyFromUrl(`https://example.com?f_test_contains=value${i}`)

        // Trigger garbage collection periodically if available
        if (global.gc && i % 100 === 0) {
          global.gc()
        }
      }

      const finalMemory = process.memoryUsage?.() || { heapUsed: 0 }
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      console.log(
        `Memory increase after 1000 operations: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`
      )

      // Should not use excessive memory (relaxed for test environment)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024) // 50MB (test environment is variable)
    })

    it('should handle large filter sets without excessive memory usage', () => {
      const initialMemory = process.memoryUsage?.() || { heapUsed: 0 }

      // Create very large filter state
      const largeFilterState: FilterState = {}
      for (let i = 0; i < 1000; i++) {
        largeFilterState[`column${i}`] = {
          filterType: 'text',
          type: 'contains',
          filter: `value${i}`.repeat(10) // Longer values
        }
      }

      // Perform operations with large data
      serializeFilters(largeFilterState, config)
      parseUrlFilters('https://example.com', config)

      const finalMemory = process.memoryUsage?.() || { heapUsed: 0 }
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      console.log(
        `Memory usage for large filter set: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`
      )

      // Should not use excessive memory
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024) // 10MB
    })
  })

  describe('Rapid Successive Calls', () => {
    it('should handle rapid successive calls without performance degradation', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)
      const times: number[] = []

      // Measure each call
      for (let i = 0; i < 100; i++) {
        const startTime = performance.now()
        urlSync.generateUrl(`https://example.com?iteration=${i}`)
        const endTime = performance.now()
        times.push(endTime - startTime)
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length
      const maxTime = Math.max(...times)

      console.log(
        `Rapid calls - Average: ${avgTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`
      )

      // Performance should remain consistent
      expect(avgTime).toBeLessThan(2)
      expect(maxTime).toBeLessThan(10)
    })

    it('should handle concurrent-like operations efficiently', () => {
      const urlSync = new AGGridUrlSync(mockGridApi)

      const startTime = performance.now()

      // Simulate rapid operations like a user quickly changing filters
      const promises: Promise<unknown>[] = []
      for (let i = 0; i < 50; i++) {
        // Simulate async-like operations
        promises.push(
          new Promise(resolve => {
            setTimeout(() => {
              urlSync.generateUrl(`https://example.com?test=${i}`)
              urlSync.applyFromUrl(
                `https://example.com?f_test_contains=value${i}`
              )
              resolve(i)
            }, Math.random() * 10)
          })
        )
      }

      return Promise.all(promises).then(() => {
        const endTime = performance.now()
        const totalTime = endTime - startTime

        console.log(`Concurrent-like operations: ${totalTime.toFixed(2)}ms`)

        // Should complete reasonably quickly
        expect(totalTime).toBeLessThan(1000) // 1 second
      })
    })
  })

  describe('Scale Testing', () => {
    it('should handle maximum practical filter counts', () => {
      // Test with a realistic maximum number of filters (100 columns)
      const maxFilterState: FilterState = {}
      for (let i = 0; i < 100; i++) {
        maxFilterState[`column_${i}`] = {
          filterType: 'text',
          type: i % 2 === 0 ? 'contains' : 'eq',
          filter: `filter_value_${i}_with_some_length`
        }
      }

      const startTime = performance.now()
      const params = serializeFilters(maxFilterState, config)
      const url = `https://example.com?${params.toString()}`
      const parsed = parseUrlFilters(url, config)
      const endTime = performance.now()

      const duration = endTime - startTime
      console.log(`Scale test (100 filters): ${duration.toFixed(2)}ms`)

      expect(duration).toBeLessThan(20)
      expect(Object.keys(parsed)).toHaveLength(100)
      expect(parsed['column_0'].filter).toBe('filter_value_0_with_some_length')
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

      const startTime = performance.now()
      expect(() => serializeFilters(filterState, oversizedConfig)).toThrow()
      const endTime = performance.now()

      const duration = endTime - startTime
      console.log(`Validation rejection: ${duration.toFixed(2)}ms`)

      // Validation should be fast
      expect(duration).toBeLessThan(1)
    })
  })
})
