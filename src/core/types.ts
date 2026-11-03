import type {
  GridApi as AGGridApi,
  TextFilterModel,
  NumberFilterModel,
  DateFilterModel
} from 'ag-grid-community'
import { attachColumn } from './issue-columns.js'
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
   * Prefix for URL parameters (only used in individual mode).
   * A prefix without a trailing `_` gets one, so 'filter' and 'filter_' both
   * give `?filter_name_contains=john`. An empty prefix means the default.
   * @default 'f_'
   * @example 'filter_' results in URLs like '?filter_name_contains=john'
   */
  paramPrefix?: string | undefined

  /**
   * Maximum length for filter values to prevent URL length issues
   * @default 200
   */
  maxValueLength?: number | undefined

  /**
   * Optional handler for issues: a filter that is dropped or not valid, in a
   * URL, a value, or the grid model. The filter is skipped and the others are
   * kept. Each error is a `URLSyncError` with a `code` (for example
   * `VALUE_TOO_LONG`) and, when it is known, a `column`. In the core, an error
   * from the grid API also comes here, as `GRID_ERROR` (the React hook sends it
   * to `onError`). A URL that cannot be read is thrown as `INVALID_URL`, not
   * sent here. The library never writes to the console, so an issue with no
   * handler is silent (#220).
   *
   * In grouped mode, an error that comes from the grouped URL value is an
   * `InvalidSerializationError`, and the original error is in `error.cause`.
   * The wrapper has the code and the column of the original issue, so a check
   * on `error.code` works the same in both modes.
   */
  onParseError?: ((error: Error) => void) | undefined

  /**
   * Serialization mode for URL parameters
   * @default 'individual'
   */
  serialization?: SerializationMode | undefined

  /**
   * Parameter name for grouped serialization
   * @default 'grid_filters'
   */
  groupedParam?: string | undefined

  /**
   * Serialization format for grouped mode
   * @default 'querystring'
   */
  format?: SerializationFormat | undefined
}

/**
 * The options with a value for each one: the config after the defaults are
 * filled in. It has no `gridApi`: the grid is an argument of the functions
 * that read it (#219).
 *
 * A caller can set an option to undefined (#258), so `Required` is not enough:
 * it keeps the undefined.
 */
export type ResolvedOptions = {
  [K in keyof AGGridUrlSyncConfig]-?: Exclude<AGGridUrlSyncConfig[K], undefined>
}

/**
 * Configuration for URL parsing and serialization operations that don't require GridApi.
 *
 * @deprecated The parse and serialize functions take a partial
 * `AGGridUrlSyncConfig` and fill in the defaults, so you do not need this
 * type. Use `ResolvedOptions` for a config with every option set. This type
 * will be removed in v1.0.
 */
export interface ParseConfig extends ResolvedOptions {
  /** AG Grid API instance - not read by parsing/serialization operations */
  gridApi?: AGGridApi | null
}

/**
 * Internal configuration with all required fields and runtime dependencies
 *
 * @deprecated Give the grid API to `getFilterModel(gridApi, options)` and
 * `applyFilterModel(filterState, gridApi, options)` as an argument. This type
 * will be removed in v1.0.
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
 * The reason for an issue (#220). Data issues are a filter that is dropped or
 * not valid. The other codes are failures of an operation.
 */
export type IssueCode =
  // Data issues
  | 'INVALID_PARAM'
  | 'INVALID_NUMBER'
  | 'INVALID_DATE'
  | 'VALUE_TOO_LONG'
  | 'INVALID_GROUPED'
  | 'TYPE_MISMATCH'
  | 'INVALID_URL'
  // Operation failures
  | 'GRID_ERROR'
  | 'NOT_READY'
  | 'VIEW_NOT_FOUND'
  | 'VIEW_NAME_REQUIRED'
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_FULL'
  | 'STORAGE_WRITE_FAILED'
  | 'UNKNOWN'

/** The code and the column of an issue, when the default is not right */
export interface IssueDetails {
  code?: IssueCode | undefined
  column?: string | undefined
}

/**
 * Base error class for all URL sync operations
 */
export class URLSyncError extends Error {
  /** The reason for the error */
  readonly code: IssueCode

  /** The column of the filter, when it is known */
  declare readonly column?: string

  constructor(
    message: string,
    public override readonly cause?: Error,
    details: IssueDetails = {}
  ) {
    super(message)
    this.name = 'URLSyncError'
    this.code = details.code ?? 'UNKNOWN'

    if (details.column !== undefined) attachColumn(this, details.column)
  }
}

/**
 * Error thrown when filter validation fails
 */
export class InvalidFilterError extends URLSyncError {
  constructor(message: string, cause?: Error, details: IssueDetails = {}) {
    super(message, cause, { ...details, code: details.code ?? 'INVALID_PARAM' })
    this.name = 'InvalidFilterError'
  }
}

/**
 * Error thrown when URL parsing fails
 */
export class InvalidURLError extends URLSyncError {
  constructor(message: string, cause?: Error, details: IssueDetails = {}) {
    super(message, cause, { ...details, code: details.code ?? 'INVALID_URL' })
    this.name = 'InvalidURLError'
  }
}

/**
 * Error thrown when date validation fails
 */
export class InvalidDateError extends InvalidFilterError {
  constructor(message: string, cause?: Error, details: IssueDetails = {}) {
    super(message, cause, { ...details, code: details.code ?? 'INVALID_DATE' })
    this.name = 'InvalidDateError'
  }
}

/**
 * Error thrown when serialization/deserialization fails.
 *
 * When the cause is an issue inside the grouped value (for example a value
 * over maxValueLength), this error has the same code and column, so a filter
 * gives the same code in both modes. `INVALID_GROUPED` means that the grouped
 * value itself does not decode.
 */
export class InvalidSerializationError extends URLSyncError {
  /** The grouped format: querystring, json or base64 */
  readonly format: string

  constructor(format: string, cause: Error) {
    super(
      `Invalid ${format} serialization: ${cause.message}`,
      cause,
      cause instanceof URLSyncError
        ? { code: cause.code, column: cause.column }
        : { code: 'INVALID_GROUPED' }
    )
    this.name = 'InvalidSerializationError'
    this.format = format
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
 * The URL with the current filter state, and whether the grid has filters
 */
export interface UrlState {
  /** The URL with the current filter state and the page's own params */
  url: string
  /** Whether the grid has filters that the library supports */
  hasFilters: boolean
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
  serialize(filterState: FilterState, config?: ResolvedOptions): string
  /**
   * Deserialize string to filter state
   * @param config - Caller's configuration. All serializers honour
   * maxValueLength and onParseError. JSON and Base64 drop over-length text
   * values and report them through onParseError (see #213, #207).
   */
  deserialize(value: string, config?: ResolvedOptions): FilterState
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
export const INTERNAL_TO_URL_OPERATION_MAP =
  // SAFETY: FilterOperation is OPERATORS[number]['id'], and the map has one
  // entry for each row of OPERATORS, so it has a key for each operation
  Object.fromEntries(OPERATORS.map(op => [op.id, op.url])) as Record<
    FilterOperation,
    string
  >

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
