import type { GridApi as AGGridApi } from 'ag-grid-community'

/**
 * Configuration options for AG Grid URL Sync
 */
export interface AGGridUrlSyncConfig {
  /**
   * Prefix for URL parameters. Default: 'f_'
   */
  paramPrefix?: string

  /**
   * Maximum length for filter values. Default: 200
   */
  maxValueLength?: number

  /**
   * Optional error handler for parsing errors
   */
  onParseError?: (error: Error) => void
}

/**
 * Supported filter operations for both text and number filters
 */
export type FilterOperation =
  | 'contains' // Text only
  | 'eq' // Both text and number (shared)
  | 'notContains' // Text only
  | 'notEqual' // Both text and number (shared)
  | 'startsWith' // Text only
  | 'endsWith' // Text only
  | 'blank' // Both text and number (shared)
  | 'notBlank' // Both text and number (shared)
  | 'lessThan' // Number only
  | 'lessThanOrEqual' // Number only
  | 'greaterThan' // Number only
  | 'greaterThanOrEqual' // Number only
  | 'inRange' // Number only

/**
 * Text-specific filter operations
 */
export type TextFilterOperation =
  | 'contains'
  | 'eq'
  | 'notContains'
  | 'notEqual'
  | 'startsWith'
  | 'endsWith'
  | 'blank'
  | 'notBlank'

/**
 * Number-specific filter operations
 */
export type NumberFilterOperation =
  | 'eq'
  | 'notEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'inRange'
  | 'blank'
  | 'notBlank'

/**
 * Base interface for column filters
 */
interface BaseColumnFilter {
  type: FilterOperation
}

/**
 * Text filter configuration
 */
export interface TextColumnFilter extends BaseColumnFilter {
  filterType: 'text'
  type: TextFilterOperation
  filter: string
}

/**
 * Number filter configuration
 */
export interface NumberColumnFilter extends BaseColumnFilter {
  filterType: 'number'
  type: NumberFilterOperation
  filter: number
  filterTo?: number // For inRange operations
}

/**
 * Filter state for a single column (union of text and number filters)
 */
export type ColumnFilter = TextColumnFilter | NumberColumnFilter

/**
 * Complete filter state mapping
 */
export interface FilterState {
  [columnId: string]: ColumnFilter
}

/**
 * Internal configuration with defaults
 */
export interface InternalConfig extends Required<AGGridUrlSyncConfig> {
  gridApi: AGGridApi
}

/**
 * Error types for URL sync operations
 */
export class URLSyncError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'URLSyncError'
  }
}

export class InvalidFilterError extends URLSyncError {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidFilterError'
  }
}

export class InvalidURLError extends URLSyncError {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidURLError'
  }
}

export type ParsedFilterParam = {
  columnName: string
  operation: FilterOperation
  filterType: 'text' | 'number' | 'auto' // 'auto' for operations that work with both
  value: string | number
  filterTo?: number // For range operations
  action: 'apply' | 'remove'
}

// Re-export GridApi for convenience
export type GridApi = AGGridApi

/**
 * Operation Mapping Strategy:
 *
 * We use three different naming conventions for better user experience:
 *
 * 1. URL Parameters: Short, clean names for URLs (e.g., 'eq', 'neq', 'lt', 'gt')
 * 2. Internal Types: Consistent naming for our FilterOperation type
 * 3. AG Grid Operations: Exact names expected by AG Grid API (e.g., 'equals', 'notEqual')
 *
 * This approach keeps URLs readable while maintaining compatibility with AG Grid.
 */

// URL parameter names to internal operation types
// Uses short names for cleaner URLs: 'eq' instead of 'equals', 'neq' instead of 'notEqual'
export const OPERATION_MAP = {
  // Text operations (unchanged)
  contains: 'contains',
  eq: 'eq', // Short form for URL brevity
  notContains: 'notContains',
  neq: 'notEqual', // Short form: 'neq' -> 'notEqual'
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  blank: 'blank',
  notBlank: 'notBlank',

  // New number operations
  lt: 'lessThan',
  lte: 'lessThanOrEqual',
  gt: 'greaterThan',
  gte: 'greaterThanOrEqual',
  range: 'inRange'
} as const

// Internal operation types to URL parameter names
export const INTERNAL_TO_URL_OPERATION_MAP = {
  // Text operations (unchanged)
  contains: 'contains',
  eq: 'eq',
  notContains: 'notContains',
  notEqual: 'neq', // Internal 'notEqual' -> URL 'neq'
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  blank: 'blank',
  notBlank: 'notBlank',

  // New number operations
  lessThan: 'lt',
  lessThanOrEqual: 'lte',
  greaterThan: 'gt',
  greaterThanOrEqual: 'gte',
  inRange: 'range'
} as const

// Internal operation types to AG Grid operation names
// AG Grid expects 'equals' not 'eq', 'notEqual' not 'neq'
export const AG_GRID_OPERATION_NAMES = {
  // Text operations (unchanged)
  contains: 'contains',
  eq: 'equals', // Internal 'eq' -> AG Grid 'equals'
  notContains: 'notContains',
  notEqual: 'notEqual',
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  blank: 'blank',
  notBlank: 'notBlank',

  // New number operations
  lessThan: 'lessThan',
  lessThanOrEqual: 'lessThanOrEqual',
  greaterThan: 'greaterThan',
  greaterThanOrEqual: 'greaterThanOrEqual',
  inRange: 'inRange'
} as const

// AG Grid operation names to internal operation types (reverse mapping)
export const REVERSE_AG_GRID_OPERATION_NAMES = {
  // Text operations (unchanged)
  contains: 'contains',
  equals: 'eq', // AG Grid 'equals' -> Internal 'eq'
  notContains: 'notContains',
  notEqual: 'notEqual',
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  blank: 'blank',
  notBlank: 'notBlank',

  // New number operations
  lessThan: 'lessThan',
  lessThanOrEqual: 'lessThanOrEqual',
  greaterThan: 'greaterThan',
  greaterThanOrEqual: 'greaterThanOrEqual',
  inRange: 'inRange'
} as const
