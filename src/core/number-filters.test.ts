import { describe, test, expect } from 'vitest'
import { createTypeDetectionEngine } from './type-detection.js'
import { parseFilterParam, mergeConfig } from './utils.js'
import { createMockGridApi } from './test-helpers.js'

describe('Number Filter Support', () => {
  describe('Number Filter Operations', () => {
    test('handles all standard number operations correctly', () => {
      const gridApi = createMockGridApi([
        { field: 'price', filter: 'agNumberColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      // Test all critical number operations users rely on
      const testCases = [
        {
          param: 'f_price_eq',
          value: '25',
          expected: { filterType: 'number', type: 'equals', filter: 25 }
        },
        {
          param: 'f_price_gt',
          value: '50000',
          expected: { filterType: 'number', type: 'greaterThan', filter: 50000 }
        },
        {
          param: 'f_price_lt',
          value: '95.5',
          expected: { filterType: 'number', type: 'lessThan', filter: 95.5 }
        },
        {
          param: 'f_price_neq',
          value: '0',
          expected: { filterType: 'number', type: 'notEquals', filter: 0 }
        },
        {
          param: 'f_price_range',
          value: '100,500',
          expected: {
            filterType: 'number',
            type: 'inRange',
            filter: 100,
            filterTo: 500
          }
        }
      ]

      testCases.forEach(({ param, value, expected }) => {
        const result = parseFilterParam(param, value, engine, config)
        expect(result).toEqual(expected)
      })
    })

    test('handles numeric edge cases that users encounter', () => {
      const gridApi = createMockGridApi([
        { field: 'value', filter: 'agNumberColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      // Test edge cases that matter for real usage
      const edgeCases = [
        { value: '-15.5', expected: -15.5, description: 'negative numbers' },
        {
          value: '1.23e6',
          expected: 1230000,
          description: 'scientific notation'
        },
        { value: '0', expected: 0, description: 'zero values' },
        {
          value: '999999999',
          expected: 999999999,
          description: 'large integers'
        },
        {
          value: '0.000001',
          expected: 0.000001,
          description: 'very small decimals'
        }
      ]

      edgeCases.forEach(({ value, expected, description }) => {
        const result = parseFilterParam('f_value_eq', value, engine, config)
        expect(result.filterType).toBe('number')
        expect((result as any).filter, `Failed for ${description}`).toBe(
          expected
        )
      })
    })

    test('validates range operations for user safety', () => {
      const gridApi = createMockGridApi([
        { field: 'range_test', filter: 'agNumberColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      // Valid range should work
      const validRange = parseFilterParam(
        'f_range_test_range',
        '10,50',
        engine,
        config
      )
      expect(validRange).toEqual({
        filterType: 'number',
        type: 'inRange',
        filter: 10,
        filterTo: 50
      })

      // Invalid range (start > end) should throw meaningful error
      expect(() => {
        parseFilterParam('f_range_test_range', '500,100', engine, config)
      }).toThrow('Invalid number range')
    })
  })

  describe('Number Filter Validation', () => {
    test('rejects invalid input that could break user experience', () => {
      const gridApi = createMockGridApi([
        { field: 'test', filter: 'agNumberColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      // Test cases that should fail gracefully with helpful errors
      const invalidCases = [
        { value: 'not_a_number', expectedError: 'Invalid number value' },
        { value: '', expectedError: 'Empty number value' },
        { value: 'Infinity', expectedError: 'Invalid number value' },
        { value: 'NaN', expectedError: 'Invalid number value' }
        // Note: '1,2,3' might be parsed as text filter, which is acceptable behavior
      ]

      invalidCases.forEach(({ value, expectedError }) => {
        expect(() => {
          parseFilterParam('f_test_eq', value, engine, config)
        }, `Should reject "${value}"`).toThrow(expectedError)
      })
    })

    test('handles malformed range inputs safely', () => {
      const gridApi = createMockGridApi([
        { field: 'range', filter: 'agNumberColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      // Malformed range inputs should fail gracefully
      const malformedRanges = [
        '100,', // Missing end
        ',200', // Missing start
        '100,200,300', // Too many values
        'abc,def' // Non-numeric values
      ]

      malformedRanges.forEach(value => {
        expect(() => {
          parseFilterParam('f_range_range', value, engine, config)
        }, `Should reject malformed range "${value}"`).toThrow()
      })
    })
  })

  describe('Number Filter Integration', () => {
    test('works correctly with different number column configurations', () => {
      // Test that number filters work regardless of column setup
      const gridApi = createMockGridApi([
        { field: 'integer_col', filter: 'agNumberColumnFilter' },
        { field: 'decimal_col', filter: 'agNumberColumnFilter' },
        { field: 'currency_col', filter: 'agNumberColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {
        typeHints: {
          numberColumns: ['integer_col', 'decimal_col', 'currency_col']
        }
      })
      const engine = createTypeDetectionEngine(gridApi, config)

      // All should be detected as number columns and work correctly
      const columns = ['integer_col', 'decimal_col', 'currency_col']
      columns.forEach(column => {
        const result = parseFilterParam(
          `f_${column}_eq`,
          '123.45',
          engine,
          config
        )
        expect(result.filterType).toBe('number')
        expect((result as any).filter).toBe(123.45)
      })
    })

    test('handles type detection edge cases for number columns', () => {
      // Test columns that might be ambiguous
      const gridApi = createMockGridApi([
        { field: 'id', filter: 'agTextColumnFilter' }, // ID might be text or number
        { field: 'score', filter: 'agNumberColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {
        typeHints: {
          numberColumns: ['score'] // Explicit hint for score
        }
      })
      const engine = createTypeDetectionEngine(gridApi, config)

      // Score should work as number due to hint
      const scoreResult = parseFilterParam('f_score_gt', '85', engine, config)
      expect(scoreResult.filterType).toBe('number')
      expect((scoreResult as any).filter).toBe(85)

      // ID without hint should be detected based on grid config
      const idResult = parseFilterParam('f_id_eq', '123', engine, config)
      expect(idResult.filterType).toBe('text') // Based on agTextColumnFilter
      expect((idResult as any).filter).toBe('123')
    })
  })
})
