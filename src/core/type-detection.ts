/**
 * @fileoverview Intelligent Type Detection System for AG Grid Columns
 *
 * This module provides sophisticated type detection capabilities for AG Grid columns
 * to automatically determine the appropriate filter type (text, number, date, set)
 * for each column. It follows a hierarchical detection strategy that prioritizes
 * user preferences while providing intelligent fallbacks.
 *
 * Detection Hierarchy:
 * 1. User-defined columnTypes (highest priority)
 * 2. User-provided typeHints
 * 3. AG Grid column filter configuration
 * 4. AG Grid cell data type analysis
 * 5. Smart value analysis (when enabled)
 * 6. Default to text filter (most permissive)
 *
 * Key features:
 * - Performance-optimized with intelligent caching
 * - Configurable detection strategies (smart, strict, disabled)
 * - Comprehensive data analysis with confidence scoring
 * - Robust error handling and fallback mechanisms
 * - Integration with AG Grid's native type system
 *
 */

import type { GridApi, ColDef } from 'ag-grid-community'
import type {
  FilterType,
  InternalConfig,
  TypeDetectionResult
} from './types.js'
import { TypeDetectionError } from './types.js'

/**
 * Performance-optimized cache for type detection results.
 *
 * Stores type detection results to avoid redundant analysis of the same columns.
 * The cache can be disabled for debugging or when column types change frequently.
 */
class TypeDetectionCache {
  private cache = new Map<string, TypeDetectionResult>()
  private cacheEnabled: boolean

  constructor(enabled = true) {
    this.cacheEnabled = enabled
  }

  get(columnId: string): TypeDetectionResult | undefined {
    return this.cacheEnabled ? this.cache.get(columnId) : undefined
  }

  set(columnId: string, result: TypeDetectionResult): void {
    if (this.cacheEnabled) {
      this.cache.set(columnId, result)
    }
  }

  clear(): void {
    this.cache.clear()
  }

  size(): number {
    return this.cache.size
  }
}

/**
 * Intelligent type detection engine with hierarchical analysis.
 *
 * The TypeDetectionEngine implements a sophisticated type detection system that
 * follows a prioritized hierarchy to determine the most appropriate filter type
 * for each column. It balances accuracy with performance through intelligent
 * caching and configurable analysis depth.
 *
 * The engine supports multiple detection strategies:
 * - 'smart': Full analysis including data sampling (slower but more accurate)
 * - 'strict': Only explicit type information (faster but less flexible)
 * - 'disabled': Skip type detection entirely (fastest, defaults to text)
 *
 * @example
 * ```typescript
 * const engine = new TypeDetectionEngine(gridApi, config);
 * const result = engine.detectColumnType('age');
 * console.log(`Column 'age' detected as ${result.type} with ${result.confidence} confidence`);
 * ```
 */
export class TypeDetectionEngine {
  private cache = new TypeDetectionCache()
  private gridApi: GridApi
  private config: InternalConfig

  constructor(gridApi: GridApi, config: InternalConfig) {
    this.gridApi = gridApi
    this.config = config
  }

  /**
   * Detects the filter type for a column following the detection hierarchy
   * 1. User-defined columnTypes (highest priority)
   * 2. User-provided typeHints
   * 3. AG Grid column filter configuration
   * 4. AG Grid cell data type
   * 5. Smart value analysis (optional, performance cost)
   * 6. Default to text filter (most permissive)
   */
  detectColumnType(columnId: string): TypeDetectionResult {
    // Check cache first
    const cached = this.cache.get(columnId)
    if (cached) {
      return cached
    }

    const startTime = this.config.performanceMonitoring ? performance.now() : 0

    try {
      let result: TypeDetectionResult

      // 1. User-defined columnTypes (highest priority)
      if (this.config.columnTypes[columnId]) {
        result = {
          type: this.config.columnTypes[columnId],
          confidence: 'high',
          source: 'user'
        }
      }
      // 2. User-provided typeHints
      else if (this.checkTypeHints(columnId)) {
        result = this.checkTypeHints(columnId)!
      }
      // 3. AG Grid column filter configuration
      else if (this.checkGridFilterConfig(columnId)) {
        result = this.checkGridFilterConfig(columnId)!
      }
      // 4. AG Grid cell data type
      else if (this.checkCellDataType(columnId)) {
        result = this.checkCellDataType(columnId)!
      }
      // 5. Smart value analysis (if enabled)
      else if (
        this.config.typeDetection === 'smart' &&
        this.checkSmartAnalysis(columnId)
      ) {
        result = this.checkSmartAnalysis(columnId)!
      }
      // 6. Default to text filter
      else {
        result = {
          type: 'text',
          confidence: 'low',
          source: 'default'
        }
      }

      // Cache the result
      this.cache.set(columnId, result)

      if (this.config.performanceMonitoring) {
        const duration = performance.now() - startTime
        if (this.config.debug) {
          console.log(
            `Type detection for column '${columnId}': ${duration.toFixed(2)}ms`
          )
        }
      }

      if (this.config.debug) {
        console.log(`Detected type for column '${columnId}':`, result)
      }

      return result
    } catch (error) {
      const typeError = new TypeDetectionError(
        `Failed to detect type for column '${columnId}': ${(error as Error).message}`,
        { columnId, error }
      )

      this.config.onError.typeDetection(typeError, columnId)

      // Return default type on error
      const fallbackResult = {
        type: 'text' as FilterType,
        confidence: 'low' as const,
        source: 'default' as const
      }

      this.cache.set(columnId, fallbackResult)
      return fallbackResult
    }
  }

  /**
   * Check user-provided type hints
   */
  private checkTypeHints(columnId: string): TypeDetectionResult | null {
    const { dateColumns, numberColumns, setColumns } = this.config.typeHints

    if (dateColumns.includes(columnId)) {
      return {
        type: 'date',
        confidence: 'high',
        source: 'hint'
      }
    }

    if (numberColumns.includes(columnId)) {
      return {
        type: 'number',
        confidence: 'high',
        source: 'hint'
      }
    }

    if (setColumns.includes(columnId)) {
      return {
        type: 'set',
        confidence: 'high',
        source: 'hint'
      }
    }

    return null
  }

  /**
   * Check AG Grid column filter configuration
   */
  private checkGridFilterConfig(columnId: string): TypeDetectionResult | null {
    try {
      const columnDefs = this.gridApi.getColumnDefs()
      if (!columnDefs) return null

      const column = columnDefs.find(col => {
        // Only check ColDef, not ColGroupDef
        if ('field' in col || 'colId' in col) {
          const colDef = col as ColDef
          return colDef.field === columnId || colDef.colId === columnId
        }
        return false
      }) as ColDef | undefined

      if (!column) return null

      // Check filter property
      if (typeof column.filter === 'string') {
        switch (column.filter) {
          case 'agNumberColumnFilter':
            return {
              type: 'number',
              confidence: 'high',
              source: 'grid'
            }
          case 'agDateColumnFilter':
            return {
              type: 'date',
              confidence: 'high',
              source: 'grid'
            }
          case 'agSetColumnFilter':
            return {
              type: 'set',
              confidence: 'high',
              source: 'grid'
            }
          case 'agTextColumnFilter':
            return {
              type: 'text',
              confidence: 'high',
              source: 'grid'
            }
        }
      }

      return null
    } catch (error) {
      if (this.config.debug) {
        console.warn(
          `Failed to check grid filter config for column '${columnId}':`,
          error
        )
      }
      return null
    }
  }

  /**
   * Check AG Grid cell data type
   */
  private checkCellDataType(columnId: string): TypeDetectionResult | null {
    try {
      const columnDefs = this.gridApi.getColumnDefs()
      if (!columnDefs) return null

      const column = columnDefs.find(col => {
        // Only check ColDef, not ColGroupDef
        if ('field' in col || 'colId' in col) {
          const colDef = col as ColDef
          return colDef.field === columnId || colDef.colId === columnId
        }
        return false
      }) as ColDef | undefined

      if (!column) return null

      switch (column.cellDataType) {
        case 'number':
          return {
            type: 'number',
            confidence: 'medium',
            source: 'grid'
          }
        case 'date':
          return {
            type: 'date',
            confidence: 'medium',
            source: 'grid'
          }
        case 'text':
          return {
            type: 'text',
            confidence: 'medium',
            source: 'grid'
          }
        default:
          return null
      }
    } catch (error) {
      if (this.config.debug) {
        console.warn(
          `Failed to check cell data type for column '${columnId}':`,
          error
        )
      }
      return null
    }
  }

  /**
   * Smart value analysis by examining actual data (performance cost)
   */
  private checkSmartAnalysis(columnId: string): TypeDetectionResult | null {
    try {
      const rowData: any[] = []

      // Get sample of row data (limit to first 20 rows for performance)
      this.gridApi.forEachNode((node, index) => {
        if (index < 20 && node.data) {
          const value = node.data[columnId]
          if (value !== null && value !== undefined && value !== '') {
            rowData.push(value)
          }
        }
      })

      if (rowData.length === 0) return null

      // Analyze the sample data
      const analysis = this.analyzeDataTypes(rowData)

      if (analysis.confidence === 'high') {
        return {
          type: analysis.type,
          confidence: 'medium', // Lower confidence for data-based detection
          source: 'data'
        }
      }

      return null
    } catch (error) {
      if (this.config.debug) {
        console.warn(
          `Failed to perform smart analysis for column '${columnId}':`,
          error
        )
      }
      return null
    }
  }

  /**
   * Analyze a sample of data to determine the most likely type
   */
  private analyzeDataTypes(values: any[]): {
    type: FilterType
    confidence: 'high' | 'low'
  } {
    let numberCount = 0
    let dateCount = 0
    let textCount = 0

    for (const value of values) {
      if (this.isNumber(value)) {
        numberCount++
      } else if (this.isDate(value)) {
        dateCount++
      } else {
        textCount++
      }
    }

    const total = values.length
    const numberRatio = numberCount / total
    const dateRatio = dateCount / total

    // High confidence threshold: 80% of values match the type
    const highConfidenceThreshold = 0.8

    if (numberRatio >= highConfidenceThreshold) {
      return { type: 'number', confidence: 'high' }
    }

    if (dateRatio >= highConfidenceThreshold) {
      return { type: 'date', confidence: 'high' }
    }

    // If no clear type emerges, default to text
    return { type: 'text', confidence: 'low' }
  }

  /**
   * Check if a value is a number
   */
  private isNumber(value: any): boolean {
    if (typeof value === 'number') {
      return !isNaN(value) && isFinite(value)
    }

    if (typeof value === 'string') {
      // Handle scientific notation, decimals, negatives
      const numberRegex = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
      return numberRegex.test(value.trim()) && !isNaN(parseFloat(value))
    }

    return false
  }

  /**
   * Check if a value is a date (ISO format or common date formats)
   */
  private isDate(value: any): boolean {
    if (value instanceof Date) {
      return !isNaN(value.getTime())
    }

    if (typeof value === 'string') {
      // ISO date format (YYYY-MM-DD)
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (isoDateRegex.test(value)) {
        const date = new Date(value)
        return !isNaN(date.getTime())
      }

      // Other common date formats for detection
      const date = new Date(value)
      return !isNaN(date.getTime()) && value.length > 5 // Avoid false positives with short strings
    }

    return false
  }

  /**
   * Get all detected column types
   */
  getColumnTypes(): Record<string, FilterType> {
    const columnDefs = this.gridApi.getColumnDefs()
    if (!columnDefs) return {}

    const result: Record<string, FilterType> = {}

    for (const col of columnDefs) {
      const column = col as ColDef
      const columnId = column.field || column.colId
      if (columnId) {
        const detection = this.detectColumnType(columnId)
        result[columnId] = detection.type
      }
    }

    return result
  }

  /**
   * Clear the type detection cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats() {
    return {
      size: this.cache.size(),
      enabled: this.config.typeDetection !== 'disabled'
    }
  }

  /**
   * Update configuration (useful for React re-renders)
   */
  updateConfig(config: InternalConfig): void {
    this.config = config
    // Clear cache if configuration changes that affect detection
    this.clearCache()
  }
}

/**
 * Factory function to create a type detection engine
 */
export function createTypeDetectionEngine(
  gridApi: GridApi,
  config: InternalConfig
): TypeDetectionEngine {
  return new TypeDetectionEngine(gridApi, config)
}
