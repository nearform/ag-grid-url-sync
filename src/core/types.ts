import type {
  GridApi as AGGridApi,
  TextFilterModel,
  NumberFilterModel
} from 'ag-grid-community'

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
 * Valid text filter operations as const array
 */
export const TEXT_FILTER_OPERATIONS = [
  'contains',
  'eq',
  'notContains',
  'notEqual',
  'startsWith',
  'endsWith',
  'blank',
  'notBlank'
] as const

/**
 * Valid number filter operations as const array
 */
export const NUMBER_FILTER_OPERATIONS = [
  'eq',
  'notEqual',
  'lessThan',
  'lessThanOrEqual',
  'greaterThan',
  'greaterThanOrEqual',
  'inRange',
  'blank',
  'notBlank'
] as const

/**
 * Text-specific filter operations
 */
export type TextFilterOperation = (typeof TEXT_FILTER_OPERATIONS)[number]

/**
 * Number-specific filter operations
 */
export type NumberFilterOperation = (typeof NUMBER_FILTER_OPERATIONS)[number]

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
 * Union type for AG Grid filters using official AG Grid types
 */
export type AGGridFilter = TextFilterModel | NumberFilterModel

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

/**
 * Define special URL shorthand mappings (internal -> URL)
 * Operations not listed here use their internal name as URL param
 */
const URL_SHORTHAND_MAPPINGS = {
  notEqual: 'neq',
  lessThan: 'lt',
  lessThanOrEqual: 'lte',
  greaterThan: 'gt',
  greaterThanOrEqual: 'gte',
  inRange: 'range'
} as const

/**
 * Define special AG Grid name mappings (internal -> AG Grid)
 * Operations not listed here use their internal name for AG Grid
 */
const AG_GRID_NAME_MAPPINGS = {
  eq: 'equals'
} as const

/**
 * Helper function to create operation mappings dynamically
 */
function createOperationMaps() {
  const allOperations = [...TEXT_FILTER_OPERATIONS, ...NUMBER_FILTER_OPERATIONS]

  // Remove duplicates (like 'eq', 'blank', etc. that appear in both arrays)
  const uniqueOperations = [...new Set(allOperations)]

  // Generate URL mappings
  const operationMap = {} as Record<string, FilterOperation>
  const internalToUrlMap = {} as Record<FilterOperation, string>

  uniqueOperations.forEach(operation => {
    const urlName =
      URL_SHORTHAND_MAPPINGS[
        operation as keyof typeof URL_SHORTHAND_MAPPINGS
      ] || operation
    operationMap[urlName] = operation
    internalToUrlMap[operation] = urlName
  })

  // Generate AG Grid mappings
  const agGridMap = {} as Record<FilterOperation, string>
  const reverseAgGridMap = {} as Record<string, FilterOperation>

  uniqueOperations.forEach(operation => {
    const agGridName =
      AG_GRID_NAME_MAPPINGS[operation as keyof typeof AG_GRID_NAME_MAPPINGS] ||
      operation
    agGridMap[operation] = agGridName
    reverseAgGridMap[agGridName] = operation
  })

  return {
    operationMap,
    internalToUrlMap,
    agGridMap,
    reverseAgGridMap
  }
}

// Generate all mappings dynamically
const { operationMap, internalToUrlMap, agGridMap, reverseAgGridMap } =
  createOperationMaps()

// Export the dynamically generated maps
export const OPERATION_MAP = operationMap
export const INTERNAL_TO_URL_OPERATION_MAP = internalToUrlMap
export const AG_GRID_OPERATION_NAMES = agGridMap
export const REVERSE_AG_GRID_OPERATION_NAMES = reverseAgGridMap
