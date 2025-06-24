import { describe, test, expect } from 'vitest'
import { createTypeDetectionEngine } from './type-detection.js'
import { parseFilterParam, mergeConfig } from './utils.js'
import { createMockGridApi } from './test-helpers.js'

describe('Date Filter Support', () => {
  describe('Date Filter Parsing', () => {
    test('parses equals operation correctly', () => {
      const gridApi = createMockGridApi([
        { field: 'created_at', filter: 'agDateColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      const filter = parseFilterParam(
        'f_created_at_eq',
        '2024-01-15',
        engine,
        config
      )

      expect(filter).toEqual({
        filterType: 'date',
        type: 'equals',
        dateFrom: '2024-01-15'
      })
    })

    test('parses before operation correctly', () => {
      const gridApi = createMockGridApi([
        { field: 'deadline', filter: 'agDateColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      const filter = parseFilterParam(
        'f_deadline_before',
        '2024-12-31',
        engine,
        config
      )

      expect(filter).toEqual({
        filterType: 'date',
        type: 'before',
        dateFrom: '2024-12-31'
      })
    })

    test('parses after operation correctly', () => {
      const gridApi = createMockGridApi([
        { field: 'start_date', filter: 'agDateColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      const filter = parseFilterParam(
        'f_start_date_after',
        '2024-01-01',
        engine,
        config
      )

      expect(filter).toEqual({
        filterType: 'date',
        type: 'after',
        dateFrom: '2024-01-01'
      })
    })

    test('parses date ranges correctly', () => {
      const gridApi = createMockGridApi([
        { field: 'activity_period', filter: 'agDateColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      const filter = parseFilterParam(
        'f_activity_period_range',
        '2024-01-01,2024-12-31',
        engine,
        config
      )

      expect(filter).toEqual({
        filterType: 'date',
        type: 'inRange',
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31'
      })
    })

    test('parses notEquals operation correctly', () => {
      const gridApi = createMockGridApi([
        { field: 'excluded_date', filter: 'agDateColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      const filter = parseFilterParam(
        'f_excluded_date_neq',
        '2024-07-04',
        engine,
        config
      )

      expect(filter).toEqual({
        filterType: 'date',
        type: 'notEquals',
        dateFrom: '2024-07-04'
      })
    })
  })

  describe('Date Filter Validation', () => {
    test('validates ISO date format (YYYY-MM-DD)', () => {
      const gridApi = createMockGridApi([
        { field: 'strict_date', filter: 'agDateColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      // Valid ISO format should work
      expect(() => {
        parseFilterParam('f_strict_date_eq', '2024-02-29', engine, config)
      }).not.toThrow()

      // Invalid formats should fail
      expect(() => {
        parseFilterParam('f_strict_date_eq', '02/29/2024', engine, config)
      }).toThrow('Invalid date format')

      expect(() => {
        parseFilterParam('f_strict_date_eq', '2024-2-29', engine, config)
      }).toThrow('Invalid date format')
    })

    test('validates actual date validity', () => {
      const gridApi = createMockGridApi([
        { field: 'real_date', filter: 'agDateColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      expect(() => {
        parseFilterParam('f_real_date_eq', '2024-13-01', engine, config)
      }).toThrow('Invalid date')

      expect(() => {
        parseFilterParam('f_real_date_eq', '2024-02-30', engine, config)
      }).toThrow('Invalid date')
    })

    test('validates range order (start <= end)', () => {
      const gridApi = createMockGridApi([
        { field: 'invalid_range', filter: 'agDateColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      expect(() => {
        parseFilterParam(
          'f_invalid_range_range',
          '2024-12-31,2024-01-01',
          engine,
          config
        )
      }).toThrow('Invalid date range')
    })

    test('rejects empty date values', () => {
      const gridApi = createMockGridApi([
        { field: 'empty_date', filter: 'agDateColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      expect(() => {
        parseFilterParam('f_empty_date_eq', '', engine, config)
      }).toThrow('Empty date value')

      expect(() => {
        parseFilterParam('f_empty_date_eq', '   ', engine, config)
      }).toThrow('Empty date value')
    })
  })

  describe('Date Filter Operations', () => {
    test('supports all date filter operations', () => {
      const supportedOps = ['eq', 'neq', 'before', 'after', 'range']
      const gridApi = createMockGridApi([
        { field: 'test_date', filter: 'agDateColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      supportedOps.forEach(op => {
        const value = op === 'range' ? '2024-01-01,2024-12-31' : '2024-06-15'
        expect(() => {
          parseFilterParam(`f_test_date_${op}`, value, engine, config)
        }).not.toThrow()
      })
    })

    test('rejects unsupported date operations', () => {
      const gridApi = createMockGridApi([
        { field: 'test_date', filter: 'agDateColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      expect(() => {
        parseFilterParam('f_test_date_contains', '2024-01-01', engine, config)
      }).toThrow('Unsupported date filter operation')
    })
  })
})
