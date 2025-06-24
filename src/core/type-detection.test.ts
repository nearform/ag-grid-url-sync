import { describe, test, expect } from 'vitest'
import { createTypeDetectionEngine } from './type-detection.js'
import { mergeConfig } from './utils.js'
import { createMockGridApi, testRowData } from './test-helpers.js'

describe('Type Detection System', () => {
  describe('Type Detection Hierarchy', () => {
    test('detects types from user configuration (highest priority)', () => {
      const gridApi = createMockGridApi([
        { field: 'age', filter: 'agTextColumnFilter' } // Grid says text
      ])

      const config = mergeConfig(gridApi, {
        columnTypes: { age: 'number' } // User says number
      })

      const engine = createTypeDetectionEngine(gridApi, config)
      const result = engine.detectColumnType('age')

      expect(result.type).toBe('number')
      expect(result.source).toBe('user')
      expect(result.confidence).toBe('high')
    })

    test('falls back to type hints when no user config', () => {
      const gridApi = createMockGridApi([{ field: 'salary' }])

      const config = mergeConfig(gridApi, {
        typeHints: {
          numberColumns: ['salary']
        }
      })

      const engine = createTypeDetectionEngine(gridApi, config)
      const result = engine.detectColumnType('salary')

      expect(result.type).toBe('number')
      expect(result.source).toBe('hint')
      expect(result.confidence).toBe('high')
    })

    test('detects from AG Grid column filter configuration', () => {
      const gridApi = createMockGridApi([
        { field: 'price', filter: 'agNumberColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)
      const result = engine.detectColumnType('price')

      expect(result.type).toBe('number')
      expect(result.source).toBe('grid')
      expect(result.confidence).toBe('high')
    })

    test('detects from AG Grid cell data type', () => {
      const gridApi = createMockGridApi([
        { field: 'score', cellDataType: 'number' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)
      const result = engine.detectColumnType('score')

      expect(result.type).toBe('number')
      expect(result.source).toBe('grid')
      expect(result.confidence).toBe('medium')
    })

    test('performs smart analysis on actual data', () => {
      const rowData = [
        { rating: 4.5 },
        { rating: 3.8 },
        { rating: 5.0 },
        { rating: 2.2 }
      ]

      const gridApi = createMockGridApi([{ field: 'rating' }], rowData)

      const config = mergeConfig(gridApi, {
        typeDetection: 'smart'
      })

      const engine = createTypeDetectionEngine(gridApi, config)
      const result = engine.detectColumnType('rating')

      expect(result.type).toBe('number')
      expect(result.source).toBe('data')
      expect(result.confidence).toBe('medium')
    })

    test('defaults to text filter as fallback', () => {
      const gridApi = createMockGridApi([{ field: 'unknown' }])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)
      const result = engine.detectColumnType('unknown')

      expect(result.type).toBe('text')
      expect(result.source).toBe('default')
      expect(result.confidence).toBe('low')
    })
  })

  describe('Caching Performance', () => {
    test('caches type detection results for performance', () => {
      const gridApi = createMockGridApi([
        { field: 'amount', filter: 'agNumberColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {
        performanceMonitoring: true
      })

      const engine = createTypeDetectionEngine(gridApi, config)

      // First call should detect and cache
      const result1 = engine.detectColumnType('amount')

      // Second call should use cache
      const result2 = engine.detectColumnType('amount')

      expect(result1).toEqual(result2)
      expect(engine.getCacheStats().size).toBe(1)
    })

    test('clears cache when requested', () => {
      const gridApi = createMockGridApi([
        { field: 'amount', filter: 'agNumberColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      engine.detectColumnType('amount')
      expect(engine.getCacheStats().size).toBe(1)

      engine.clearCache()
      expect(engine.getCacheStats().size).toBe(0)
    })
  })

  describe('Performance Benchmarks', () => {
    test('type detection completes under 10ms per column', () => {
      const gridApi = createMockGridApi([
        { field: 'col1', filter: 'agNumberColumnFilter' },
        { field: 'col2', filter: 'agTextColumnFilter' },
        { field: 'col3', cellDataType: 'date' }
      ])

      const config = mergeConfig(gridApi, {
        performanceMonitoring: true
      })

      const engine = createTypeDetectionEngine(gridApi, config)

      const start = performance.now()
      engine.detectColumnType('col1')
      const duration = performance.now() - start

      expect(duration).toBeLessThan(10) // Should be under 10ms
    })

    test('cached type detection completes under 1ms', () => {
      const gridApi = createMockGridApi([
        { field: 'cached_col', filter: 'agNumberColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {
        performanceMonitoring: true
      })

      const engine = createTypeDetectionEngine(gridApi, config)

      // First call to populate cache
      engine.detectColumnType('cached_col')

      // Second call should be cached and fast
      const start = performance.now()
      engine.detectColumnType('cached_col')
      const duration = performance.now() - start

      expect(duration).toBeLessThan(1) // Should be under 1ms
    })

    test('date filter type detection is cached and fast', () => {
      const gridApi = createMockGridApi([
        { field: 'cached_date', filter: 'agDateColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {
        performanceMonitoring: true
      })

      const engine = createTypeDetectionEngine(gridApi, config)

      // First call to populate cache
      engine.detectColumnType('cached_date')

      // Multiple subsequent calls should be cached and fast
      const start = performance.now()
      for (let i = 0; i < 10; i++) {
        engine.detectColumnType('cached_date')
      }
      const duration = performance.now() - start

      expect(duration).toBeLessThan(1) // Should be under 1ms for 10 cached calls
    })
  })
})
