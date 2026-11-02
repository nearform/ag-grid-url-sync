import type {
  GridApi as AGGridApi,
  TextFilterModel,
  NumberFilterModel,
  DateFilterModel
} from 'ag-grid-community'
import {
  OPERATORS,
  operationsFor,
  operationsOnlyFor,
  sharedOperations,
  isOperationFor,
  operatorById,
  type Operator,
  type OperationsFor
} from './operators.js'

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
   *
   * In grouped mode, an error that comes from the grouped URL value is an
   * `InvalidSerializationError`, and the original error is in `error.cause`.
   * In individual mode, the same failure arrives with no wrapper.
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
 * Configuration for URL parsing and serialization operations that don't require GridApi.
 * Use this type when you only need to parse filters from URLs or serialize filters to URLs
 * without actually applying them to a grid.
 *
 * @example
 * ```typescript
 * // Parse filters without a grid instance
 * const config: ParseConfig = {
 *   ...DEFAULT_CONFIG,
 *   onParseError: (error) => console.error(error)
 * }
 * const filters = parseUrlFilters(url, config)
 * ```
 */
export interface ParseConfig extends Required<AGGridUrlSyncConfig> {
  /** AG Grid API instance - not read by parsing/serialization operations */
  gridApi?: AGGridApi | null
}

/**
 * Internal configuration with all required fields and runtime dependencies
 */
export interface InternalConfig extends ParseConfig {
  /** AG Grid API instance for filter operations */
  gridApi: AGGridApi
}

// ============================================================================
// FILTER OPERATION DEFINITIONS
// ============================================================================

// Every list below is derived from the operator table in `operators.ts`
// (#217). To add an operation, add a row there.

/**
 * Text-only filter operations for string-based filtering
 */
export const TEXT_ONLY_OPERATIONS = operationsOnlyFor('text')

/**
 * Number-only filter operations for numeric comparisons
 */
export const NUMBER_ONLY_OPERATIONS = operationsOnlyFor('number')

/**
 * Date-specific filter operations for temporal comparisons
 */
export const DATE_ONLY_OPERATIONS = operationsOnlyFor('date')

/**
 * Operations shared across multiple filter types
 */
export const SHARED_OPERATIONS = sharedOperations()

/**
 * All supported filter operations across text, number, and date filters
 */
export type FilterOperation = Operator['id']

/**
 * Complete list of valid text filter operations
 */
export const TEXT_FILTER_OPERATIONS = operationsFor('text')

/**
 * Complete list of valid number filter operations
 */
export const NUMBER_FILTER_OPERATIONS = operationsFor('number')

/**
 * Valid date filter operations
 */
export const DATE_FILTER_OPERATIONS = operationsFor('date')

// ============================================================================
// OPERATION TYPE DEFINITIONS
// ============================================================================

/**
 * Text-specific filter operations
 */
export type TextFilterOperation = OperationsFor<'text'>

/**
 * Number-specific filter operations
 */
export type NumberFilterOperation = OperationsFor<'number'>

/**
 * Date-specific filter operations
 */
export type DateFilterOperation = OperationsFor<'date'>

/**
 * Range operations that require two values (from/to)
 */
export type RangeOperation = Extract<Operator, { arity: 2 }>['id']

/**
 * Operations that don't require a filter value
 */
export type BlankOperation = Extract<Operator, { arity: 0 }>['id']

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
export interface TextColumnFilter extends BaseColumnFilter<TextFilterOperation> {
  filterType: 'text'
  /** The text value to filter by */
  filter: string
}

/**
 * Number filter configuration for numeric filtering
 */
export interface NumberColumnFilter extends BaseColumnFilter<NumberFilterOperation> {
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
export interface DateColumnFilter extends BaseColumnFilter<DateFilterOperation> {
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
  TextColumnFilter | NumberColumnFilter | DateColumnFilter

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
  return isOperationFor(op, 'text')
}

/**
 * Type guard to check if an operation is number-specific
 */
export function isNumberFilterOperation(
  op: FilterOperation
): op is NumberFilterOperation {
  return isOperationFor(op, 'number')
}

/**
 * Type guard to check if an operation is date-specific
 */
export function isDateFilterOperation(
  op: FilterOperation
): op is DateFilterOperation {
  return isOperationFor(op, 'date')
}

/**
 * Type guard to check if an operation requires a range (two values)
 */
export function isRangeOperation(op: FilterOperation): op is RangeOperation {
  return operatorById(op)?.arity === 2
}

/**
 * Type guard to check if an operation is a blank operation
 */
export function isBlankOperation(op: FilterOperation): op is BlankOperation {
  return operatorById(op)?.arity === 0
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
  /**
   * Serialize filter state to string
   * @param config - Caller's configuration. All serializers honour
   * maxValueLength and onParseError. JSON and Base64 drop over-length text
   * values and report them through onParseError (see #213, #207).
   */
  serialize(filterState: FilterState, config?: ParseConfig): string
  /**
   * Deserialize string to filter state
   * @param config - Caller's configuration. All serializers honour
   * maxValueLength and onParseError. JSON and Base64 drop over-length text
   * values and report them through onParseError (see #213, #207).
   */
  deserialize(value: string, config?: ParseConfig): FilterState
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
 * The operator table in `operators.ts` holds all three names for each
 * operation (#217). The maps below are derived from it and kept only for
 * callers that use them.
 */

/**
 * Maps URL operation names to internal operation types
 * @deprecated Derived from the operator table. Will be removed in v1.0.
 */
export const OPERATION_MAP: Record<string, FilterOperation> =
  Object.fromEntries(OPERATORS.map(op => [op.url, op.id]))

/**
 * Maps internal operation types to URL operation names
 * @deprecated Derived from the operator table. Will be removed in v1.0.
 */
export const INTERNAL_TO_URL_OPERATION_MAP = Object.fromEntries(
  OPERATORS.map(op => [op.id, op.url])
) as Record<FilterOperation, string>

/**
 * Maps internal operation types to AG Grid operation names
 * @deprecated Derived from the operator table. Will be removed in v1.0.
 */
export const AG_GRID_OPERATION_NAMES: Record<string, string> =
  Object.fromEntries(OPERATORS.map(op => [op.id, op.agGrid]))

/**
 * Maps AG Grid operation names to internal operation types.
 *
 * AG Grid uses one name for a number and a date operation, so this map is
 * wrong for one of them: `lessThan` gives `dateBefore`. The last row in the
 * operator table wins, as before.
 * @deprecated The key needs the filter type too. Will be removed in v1.0.
 */
export const REVERSE_AG_GRID_OPERATION_NAMES: Record<string, FilterOperation> =
  Object.fromEntries(OPERATORS.map(op => [op.agGrid, op.id]))
