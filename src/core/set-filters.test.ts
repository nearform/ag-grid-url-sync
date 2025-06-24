import { describe, test, expect, vi } from 'vitest'
import { createTypeDetectionEngine } from './type-detection.js'
import { parseFilterParam, mergeConfig } from './utils.js'
import type { SetFilter } from './types.js'
import { createMockGridApi } from './test-helpers.js'

describe('Set Filter Support', () => {
  describe('Set Filter Parsing', () => {
    test('parses basic set values correctly', () => {
      const gridApi = createMockGridApi([
        { field: 'category', filter: 'agSetColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      const filter = parseFilterParam(
        'f_category_in',
        'Electronics,Books,Clothing',
        engine,
        config
      )

      expect(filter).toEqual({
        filterType: 'set',
        type: 'in',
        values: ['Electronics', 'Books', 'Clothing']
      })
    })

    test('handles URL-encoded values correctly', () => {
      const gridApi = createMockGridApi([
        { field: 'product', filter: 'agSetColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      const filter = parseFilterParam(
        'f_product_in',
        'Laptop%20%26%20Mouse,Phone%20%2F%20Case,Table%2C%20Chair',
        engine,
        config
      )

      expect(filter).toEqual({
        filterType: 'set',
        type: 'in',
        values: ['Laptop & Mouse', 'Phone / Case', 'Table, Chair']
      })
    })

    test('removes duplicate values', () => {
      const gridApi = createMockGridApi([
        { field: 'status', filter: 'agSetColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      const filter = parseFilterParam(
        'f_status_in',
        'Active,Inactive,Active,Pending',
        engine,
        config
      )

      expect(filter).toEqual({
        filterType: 'set',
        type: 'in',
        values: ['Active', 'Inactive', 'Pending']
      })
    })

    test('handles empty values gracefully', () => {
      const gridApi = createMockGridApi([
        { field: 'empty_set', filter: 'agSetColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      const filter = parseFilterParam('f_empty_set_in', '', engine, config)

      expect(filter).toEqual({
        filterType: 'set',
        type: 'in',
        values: []
      })
    })

    test('filters out empty values from list', () => {
      const gridApi = createMockGridApi([
        { field: 'mixed_set', filter: 'agSetColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      const filter = parseFilterParam(
        'f_mixed_set_in',
        'A,,B,   ,C',
        engine,
        config
      )

      expect(filter).toEqual({
        filterType: 'set',
        type: 'in',
        values: ['A', 'B', 'C']
      })
    })
  })

  describe('Set Filter Validation', () => {
    test('enforces value count limits', () => {
      const gridApi = createMockGridApi([
        { field: 'large_set', filter: 'agSetColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {
        limits: { setValues: 3 }
      })
      const engine = createTypeDetectionEngine(gridApi, config)

      // Create values that exceed the limit
      const manyValues = Array.from({ length: 5 }, (_, i) => `Value${i}`).join(
        ','
      )

      // Should not throw, but should trigger validation callback
      const validationSpy = vi.fn()
      config.onError.validation = validationSpy

      const filter = parseFilterParam(
        'f_large_set_in',
        manyValues,
        engine,
        config
      )

      expect((filter as SetFilter).values).toHaveLength(5)
      expect(validationSpy).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          column: 'large_set',
          type: 'set',
          operation: 'in'
        })
      )
    })
  })

  describe('Set Filter Operations', () => {
    test('supports in operation', () => {
      const gridApi = createMockGridApi([
        { field: 'test_set', filter: 'agSetColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      expect(() => {
        parseFilterParam('f_test_set_in', 'A,B,C', engine, config)
      }).not.toThrow()
    })

    test('rejects unsupported set operations', () => {
      const gridApi = createMockGridApi([
        { field: 'test_set', filter: 'agSetColumnFilter' }
      ])

      const config = mergeConfig(gridApi, {})
      const engine = createTypeDetectionEngine(gridApi, config)

      expect(() => {
        parseFilterParam('f_test_set_contains', 'A,B,C', engine, config)
      }).toThrow('Unsupported set filter operation')
    })
  })
})
