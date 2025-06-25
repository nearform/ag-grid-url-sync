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
export type FilterOperation = 'contains' | 'eq'

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
  operation: 'contains' | 'equals'
  value: string
  action: 'apply' | 'remove'
}

// Re-export GridApi for convenience
export type GridApi = AGGridApi

// Internal operation mapping
export const OPERATION_MAP = {
  contains: 'contains',
  eq: 'equals'
} as const

export const REVERSE_OPERATION_MAP = {
  contains: 'contains',
  equals: 'eq'
} as const
