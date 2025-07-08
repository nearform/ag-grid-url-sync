import type {
  GridApi as AGGridApi,
  TextFilterModel,
  NumberFilterModel,
  DateFilterModel
} from 'ag-grid-community'

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

/**
 * Serialization modes for URL parameters
 */
export type SerializationMode = 'individual' | 'grouped'

/**
 * Serialization formats for grouped mode
 */
export type SerializationFormat = 'querystring' | 'json' | 'base64'

/**
 * Configuration options for AG Grid URL Sync
 *
 * @example
 * ```typescript
 * // Individual mode (default - backward compatible)
 * const config: AGGridUrlSyncConfig = {
 *   paramPrefix: 'filter_',
 *   maxValueLength: 500,
 *   onParseError: (error) => console.warn('Filter parse error:', error)
 * }
 *
 * // Grouped mode with base64 format
 * const groupedConfig: AGGridUrlSyncConfig = {
 *   serialization: 'grouped',
 *   format: 'base64',
 *   groupedParam: 'filters'
 * }
 * ```
 */
export interface AGGridUrlSyncConfig {
  /**
   * Prefix for URL parameters (only used in individual mode)
   * @default 'f_'
   * @example 'filter_' results in URLs like '?filter_name_contains=john'
   */
  paramPrefix?: string

  /**
   * Maximum length for filter values to prevent URL length issues
   * @default 200
   */
  maxValueLength?: number

  /**
   * Optional error handler for parsing errors.
   * Allows graceful error handling without breaking the application.
   */
  onParseError?: (error: Error) => void

  /**
   * Serialization mode for URL parameters
   * @default 'individual'
   */
  serialization?: SerializationMode

  /**
   * Parameter name for grouped serialization
   * @default 'grid_filters'
   */
  groupedParam?: string

  /**
   * Serialization format for grouped mode
   * @default 'querystring'
   */
  format?: SerializationFormat
}

/**
 * Internal configuration with all required fields and runtime dependencies
 */
export interface InternalConfig extends Required<AGGridUrlSyncConfig> {
  /** AG Grid API instance for filter operations */
  gridApi: AGGridApi
}

// ============================================================================
// FILTER OPERATION DEFINITIONS
// ============================================================================

/**
 * Text-only filter operations for string-based filtering
 */
export const TEXT_ONLY_OPERATIONS = [
  'contains',
  'notContains',
  'startsWith',
  'endsWith'
] as const

/**
 * Number-only filter operations for numeric comparisons
 */
export const NUMBER_ONLY_OPERATIONS = [
  'lessThan',
  'lessThanOrEqual',
  'greaterThan',
  'greaterThanOrEqual',
  'inRange'
] as const

/**
 * Date-specific filter operations for temporal comparisons
 */
export const DATE_ONLY_OPERATIONS = [
  'dateBefore',
  'dateBeforeOrEqual',
  'dateAfter',
  'dateAfterOrEqual',
  'dateRange'
] as const

/**
 * Operations shared across multiple filter types
 */
export const SHARED_OPERATIONS = [
  'eq',
  'notEqual',
  'blank',
  'notBlank'
] as const

/**
 * All supported filter operations across text, number, and date filters
 */
export type FilterOperation =
  | (typeof TEXT_ONLY_OPERATIONS)[number]
  | (typeof NUMBER_ONLY_OPERATIONS)[number]
  | (typeof DATE_ONLY_OPERATIONS)[number]
  | (typeof SHARED_OPERATIONS)[number]

/**
 * Complete list of valid text filter operations
 */
export const TEXT_FILTER_OPERATIONS = [
  ...TEXT_ONLY_OPERATIONS,
  ...SHARED_OPERATIONS
] as const

/**
 * Complete list of valid number filter operations
 */
export const NUMBER_FILTER_OPERATIONS = [
  ...NUMBER_ONLY_OPERATIONS,
  ...SHARED_OPERATIONS
] as const

/**
 * Valid date filter operations as const array
 */
export const DATE_FILTER_OPERATIONS = [
  ...DATE_ONLY_OPERATIONS,
  ...SHARED_OPERATIONS
] as const

// ============================================================================
// OPERATION TYPE DEFINITIONS
// ============================================================================

/**
 * Text-specific filter operations
 */
export type TextFilterOperation = (typeof TEXT_FILTER_OPERATIONS)[number]

/**
 * Number-specific filter operations
 */
export type NumberFilterOperation = (typeof NUMBER_FILTER_OPERATIONS)[number]

/**
 * Date-specific filter operations
 */
export type DateFilterOperation = (typeof DATE_FILTER_OPERATIONS)[number]

/**
 * Range operations that require two values (from/to)
 */
export type RangeOperation = 'inRange' | 'dateRange'

/**
 * Operations that don't require a filter value
 */
export type BlankOperation = 'blank' | 'notBlank'

/**
 * Supported filter types
 */
export type FilterType = 'text' | 'number' | 'date'

// ============================================================================
// FILTER CONFIGURATION INTERFACES
// ============================================================================

/**
 * Base interface for all column filters with common properties
 */
interface BaseColumnFilter<T extends FilterOperation = FilterOperation> {
  /** The filter operation type */
  type: T
}

/**
 * Text filter configuration for string-based filtering
 */
export interface TextColumnFilter
  extends BaseColumnFilter<TextFilterOperation> {
  filterType: 'text'
  /** The text value to filter by */
  filter: string
}

/**
 * Number filter configuration for numeric filtering
 */
export interface NumberColumnFilter
  extends BaseColumnFilter<NumberFilterOperation> {
  filterType: 'number'
  /** The numeric value to filter by */
  filter: number
  /** Optional second value for range operations */
  filterTo?: number
}

/**
 * Date filter configuration for temporal filtering.
 * Uses ISO date format (YYYY-MM-DD) for consistency and parseability.
 */
export interface DateColumnFilter
  extends BaseColumnFilter<DateFilterOperation> {
  filterType: 'date'
  /** ISO date string (YYYY-MM-DD) */
  filter: string
  /** Optional end date for range operations (ISO format) */
  filterTo?: string
}

/**
 * Union type for all possible column filters
 */
export type ColumnFilter =
  | TextColumnFilter
  | NumberColumnFilter
  | DateColumnFilter

/**
 * Complete filter state mapping column IDs to their filters
 */
export interface FilterState {
  [columnId: string]: ColumnFilter
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if an operation is text-specific
 */
export function isTextFilterOperation(
  op: FilterOperation
): op is TextFilterOperation {
  return TEXT_FILTER_OPERATIONS.includes(op as TextFilterOperation)
}

/**
 * Type guard to check if an operation is number-specific
 */
export function isNumberFilterOperation(
  op: FilterOperation
): op is NumberFilterOperation {
  return NUMBER_FILTER_OPERATIONS.includes(op as NumberFilterOperation)
}

/**
 * Type guard to check if an operation is date-specific
 */
export function isDateFilterOperation(
  op: FilterOperation
): op is DateFilterOperation {
  return DATE_FILTER_OPERATIONS.includes(op as DateFilterOperation)
}

/**
 * Type guard to check if an operation requires a range (two values)
 */
export function isRangeOperation(op: FilterOperation): op is RangeOperation {
  return op === 'inRange' || op === 'dateRange'
}

/**
 * Type guard to check if an operation is a blank operation
 */
export function isBlankOperation(op: FilterOperation): op is BlankOperation {
  return op === 'blank' || op === 'notBlank'
}

/**
 * Type guard to check if a filter is a text filter
 */
export function isTextFilter(filter: ColumnFilter): filter is TextColumnFilter {
  return filter.filterType === 'text'
}

/**
 * Type guard to check if a filter is a number filter
 */
export function isNumberFilter(
  filter: ColumnFilter
): filter is NumberColumnFilter {
  return filter.filterType === 'number'
}

/**
 * Type guard to check if a filter is a date filter
 */
export function isDateFilter(filter: ColumnFilter): filter is DateColumnFilter {
  return filter.filterType === 'date'
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Base error class for all URL sync operations
 */
export class URLSyncError extends Error {
  constructor(
    message: string,
    public override readonly cause?: Error
  ) {
    super(message)
    this.name = 'URLSyncError'
  }
}

/**
 * Error thrown when filter validation fails
 */
export class InvalidFilterError extends URLSyncError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
    this.name = 'InvalidFilterError'
  }
}

/**
 * Error thrown when URL parsing fails
 */
export class InvalidURLError extends URLSyncError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
    this.name = 'InvalidURLError'
  }
}

/**
 * Error thrown when date validation fails
 */
export class InvalidDateError extends InvalidFilterError {
  constructor(message: string, cause?: Error) {
    super(message, cause)
    this.name = 'InvalidDateError'
  }
}

/**
 * Error thrown when serialization/deserialization fails
 */
export class InvalidSerializationError extends Error {
  constructor(format: string, cause: Error) {
    super(`Invalid ${format} serialization: ${cause.message}`)
    this.name = 'InvalidSerializationError'
    this.cause = cause
  }
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Parsed filter parameter information for internal processing
 */
export interface ParsedFilterParam {
  columnName: string
  operation: FilterOperation
  filterType: FilterType | 'auto' // 'auto' for operations that work across types
  value: string | number
  filterTo?: number | string // For range operations
  action: 'apply' | 'remove'
}

/**
 * Re-export GridApi for convenience
 */
export type GridApi = AGGridApi

/**
 * Union type for AG Grid filters using official AG Grid types
 */
export type AGGridFilter = TextFilterModel | NumberFilterModel | DateFilterModel

/**
 * Raw AG Grid filter object structure from getFilterModel()
 * Used for type-safe destructuring of filter objects
 */
export interface RawAGGridFilter {
  filterType?: string
  type?: string
  filter?: string | number
  filterTo?: string | number
  dateFrom?: string
  dateTo?: string
}

/**
 * Grouped serialization result
 */
export interface GroupedSerializationResult {
  /** The parameter name for the grouped filters */
  paramName: string
  /** The serialized filter value */
  value: string
}

/**
 * Format-specific serializer interface
 */
export interface FormatSerializer {
  /** Serialize filter state to string */
  serialize(filterState: FilterState): string
  /** Deserialize string to filter state */
  deserialize(value: string): FilterState
  /** Format identifier */
  format: SerializationFormat
}

/**
 * Detection result for grouped parameters
 */
export interface GroupedDetectionResult {
  /** Whether grouped serialization was detected */
  isGrouped: boolean
  /** The parameter name if grouped */
  paramName?: string
  /** The detected format if grouped */
  format?: SerializationFormat
  /** The raw value if grouped */
  value?: string
}

// ============================================================================
// OPERATION MAPPINGS
// ============================================================================

/**
 * Operation Mapping Strategy:
 *
 * We use three different naming conventions for better user experience:
 *
 * 1. URL Parameters: Short, clean names for URLs (e.g., 'eq', 'neq', 'before', 'after')
 * 2. Internal Types: Consistent naming for our FilterOperation type
 * 3. AG Grid Operations: Exact names expected by AG Grid API (e.g., 'equals', 'notEqual', 'lessThan')
 *
 * This approach keeps URLs readable while maintaining compatibility with AG Grid.
 */

/**
 * URL shorthand mappings for cleaner URLs.
 * Maps internal operation names to shorter URL parameter names.
 * Operations not listed here use their internal name as URL param.
 */
const URL_SHORTHAND_MAPPINGS = {
  // Shared operations
  notEqual: 'neq',
  // Number operations
  lessThan: 'lt',
  lessThanOrEqual: 'lte',
  greaterThan: 'gt',
  greaterThanOrEqual: 'gte',
  inRange: 'range',
  // Date operations
  dateBefore: 'before',
  dateBeforeOrEqual: 'beforeEq',
  dateAfter: 'after',
  dateAfterOrEqual: 'afterEq',
  dateRange: 'daterange'
} as const

/**
 * AG Grid operation name mappings.
 * Maps internal operation names to AG Grid API operation names.
 * Operations not listed here use their internal name for AG Grid.
 */
const AG_GRID_NAME_MAPPINGS = {
  // Shared operations
  eq: 'equals',
  // Date operations (AG Grid uses generic names)
  dateBefore: 'lessThan',
  dateBeforeOrEqual: 'lessThanOrEqual',
  dateAfter: 'greaterThan',
  dateAfterOrEqual: 'greaterThanOrEqual',
  dateRange: 'inRange'
} as const

/**
 * Creates operation mapping tables for URL and AG Grid integration
 */
function createOperationMaps() {
  // Get all unique operations across filter types
  const allOperations = [
    ...TEXT_FILTER_OPERATIONS,
    ...NUMBER_FILTER_OPERATIONS,
    ...DATE_FILTER_OPERATIONS
  ]

  // Remove duplicates (operations like 'eq', 'blank' appear in multiple arrays)
  const uniqueOperations = [...new Set(allOperations)]

  // Generate URL mappings (bidirectional)
  const operationMap: Record<string, FilterOperation> = {}
  const internalToUrlMap = {} as Record<FilterOperation, string>

  uniqueOperations.forEach(operation => {
    const urlName =
      URL_SHORTHAND_MAPPINGS[
        operation as keyof typeof URL_SHORTHAND_MAPPINGS
      ] || operation
    operationMap[urlName] = operation
    internalToUrlMap[operation] = urlName
  })

  // Generate AG Grid mappings (bidirectional)
  const agGridMap: Record<string, string> = {}
  const reverseAgGridMap: Record<string, FilterOperation> = {}

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
  } as const
}

// Generate all mappings dynamically
const mappings = createOperationMaps()

/**
 * Maps URL operation names to internal operation types
 */
export const OPERATION_MAP = mappings.operationMap

/**
 * Maps internal operation types to URL operation names
 */
export const INTERNAL_TO_URL_OPERATION_MAP = mappings.internalToUrlMap

/**
 * Maps internal operation types to AG Grid operation names
 */
export const AG_GRID_OPERATION_NAMES = mappings.agGridMap

/**
 * Maps AG Grid operation names to internal operation types
 */
export const REVERSE_AG_GRID_OPERATION_NAMES = mappings.reverseAgGridMap
