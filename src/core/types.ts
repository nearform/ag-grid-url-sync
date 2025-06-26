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
 * Supported filter operations
 */
export type FilterOperation =
  | 'contains'
  | 'eq'
  | 'notContains'
  | 'notEqual'
  | 'startsWith'
  | 'endsWith'
  | 'blank'
  | 'notBlank'

/**
 * Filter state for a single column
 */
export interface ColumnFilter {
  filterType: 'text'
  type: FilterOperation
  filter: string
}

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
  value: string
  action: 'apply' | 'remove'
}

// Re-export GridApi for convenience
export type GridApi = AGGridApi

/**
 * Operation Mapping Strategy:
 *
 * We use three different naming conventions for better user experience:
 *
 * 1. URL Parameters: Short, clean names for URLs (e.g., 'eq', 'neq')
 * 2. Internal Types: Consistent naming for our FilterOperation type
 * 3. AG Grid Operations: Exact names expected by AG Grid API (e.g., 'equals', 'notEqual')
 *
 * This approach keeps URLs readable while maintaining compatibility with AG Grid.
 */

// URL parameter names to internal operation types
// Uses short names for cleaner URLs: 'eq' instead of 'equals', 'neq' instead of 'notEqual'
export const OPERATION_MAP = {
  contains: 'contains',
  eq: 'eq', // Short form for URL brevity
  notContains: 'notContains',
  neq: 'notEqual', // Short form: 'neq' -> 'notEqual'
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  blank: 'blank',
  notBlank: 'notBlank'
} as const

// Internal operation types to URL parameter names
export const INTERNAL_TO_URL_OPERATION_MAP = {
  contains: 'contains',
  eq: 'eq',
  notContains: 'notContains',
  notEqual: 'neq', // Internal 'notEqual' -> URL 'neq'
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  blank: 'blank',
  notBlank: 'notBlank'
} as const

// Internal operation types to AG Grid operation names
// AG Grid expects 'equals' not 'eq', 'notEqual' not 'neq'
export const AG_GRID_OPERATION_NAMES = {
  contains: 'contains',
  eq: 'equals', // Internal 'eq' -> AG Grid 'equals'
  notContains: 'notContains',
  notEqual: 'notEqual',
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  blank: 'blank',
  notBlank: 'notBlank'
} as const

// AG Grid operation names to internal operation types (reverse mapping)
export const REVERSE_AG_GRID_OPERATION_NAMES = {
  contains: 'contains',
  equals: 'eq', // AG Grid 'equals' -> Internal 'eq'
  notContains: 'notContains',
  notEqual: 'notEqual',
  startsWith: 'startsWith',
  endsWith: 'endsWith',
  blank: 'blank',
  notBlank: 'notBlank'
} as const
