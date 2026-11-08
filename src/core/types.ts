import type {
  FilterModel,
  GridApi as AGGridApi,
  TextFilterModel,
  NumberFilterModel,
  DateFilterModel
} from 'ag-grid-community'
import type { GridView, ViewStore } from './view-storage.js'
import { attachColumn } from './issue-columns.js'
import { DATA_ISSUE_CODES } from './data-issue-codes.js'
import {
  operationsFor,
  isOperationFor,
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
   * from the grid API also comes here, as `GRID_ERROR`. A URL that cannot be
   * read is thrown as `INVALID_URL`, not sent here. The library never writes
   * to the console, so an issue with no handler is silent (#220).
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

  /**
   * Throw an issue instead of reporting it (#229), like TanStack Query's
   * `throwOnError`. `true` throws every issue, and a function throws the
   * issues for which it gives `true`. In the core, a thrown issue is not sent
   * to `onParseError`, and the first one stops the call. In the React hook,
   * each issue is still sent to `onIssue` one time, and a picked issue of
   * `issues` is thrown during render, so an error boundary catches it. A
   * failure, such as `GRID_ERROR`, is not in `issues` (#284), but a failed
   * address-bar write (`HISTORY_WRITE_FAILED`) is. This API does
   * not change the address bar (only `createGridUrlSync` with `history` does),
   * so remove the bad param before the boundary resets, or the same issue is
   * thrown again.
   *
   * A function that throws makes the library throw that error.
   * @default false
   */
  throwOnError?: boolean | ((issue: URLSyncError) => boolean) | undefined

  /**
   * The filter type of each column, for the operations that every type has
   * (`eq`, `notEqual`, `blank`, `notBlank`): the URL does not say the type
   * of those (#224). With no type (undefined, or no lookup), the value stays
   * text, so `?f_zip_eq=01234` keeps its leading zero. A number column reads
   * the value as a number, and a date column as a date. `createGridUrlSync`
   * takes the types from the grid's columns.
   * @example `column => (column === 'age' ? 'number' : undefined)`
   */
  columnTypes?: ((column: string) => FilterType | undefined) | undefined
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
  [
    K in Exclude<keyof AGGridUrlSyncConfig, 'throwOnError' | 'columnTypes'>
  ]-?: Exclude<AGGridUrlSyncConfig[K], undefined>
} & {
  /** Optional. resolveOptions always sets it. */
  throwOnError?: Exclude<AGGridUrlSyncConfig['throwOnError'], undefined>
  /** No lookup: a shared operation's value stays text (#224) */
  columnTypes?: AGGridUrlSyncConfig['columnTypes']
}

// ============================================================================
// FILTER OPERATION DEFINITIONS
// ============================================================================

// Every list below is derived from the operator table in `operators.ts`
// (#217). To add an operation, add a row there.

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
 *
 * Internal: the individual codec's form of a filter (#225). Not exported.
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
  // The grid has no column with this id (#312)
  | 'UNKNOWN_COLUMN'
  | 'INVALID_URL'
  | 'UNSUPPORTED_FILTER'
  // Operation failures
  | 'GRID_ERROR'
  | 'NOT_READY'
  | 'VIEW_NOT_FOUND'
  | 'VIEW_NAME_REQUIRED'
  | 'STORAGE_UNAVAILABLE'
  | 'STORAGE_FULL'
  | 'STORAGE_WRITE_FAILED'
  | 'HISTORY_WRITE_FAILED'
  | 'UNKNOWN'

/**
 * How bad an issue is (#221). A `'warning'` is a data issue: the sync goes on
 * and the bad filter (or the bad URL) is left out. An `'error'` is an
 * operation that failed.
 */
export type IssueSeverity = 'error' | 'warning'

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

  /**
   * How bad the issue is, from its code (#221). A getter, so it is not an own
   * property and `toEqual` comparisons of errors do not change.
   */
  get severity(): IssueSeverity {
    return DATA_ISSUE_CODES.has(this.code) ? 'warning' : 'error'
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
 * Union type for AG Grid filters using official AG Grid types
 */
export type AGGridFilter = TextFilterModel | NumberFilterModel | DateFilterModel

/** The result of an apply method (#229) */
export interface ApplyResult {
  /**
   * The issues of this call: filters that were dropped. The same objects
   * also go to `onIssue`. A failure, such as `GRID_ERROR`, goes there only,
   * not here (#284).
   */
  issues: readonly URLSyncError[]
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
   * Serialize an AG Grid filter model to a string
   * @param config - Caller's configuration. All serializers honour
   * maxValueLength and onParseError. JSON and Base64 drop over-length text
   * values and report them through onParseError (see #213, #207).
   */
  serialize(model: FilterModel, config?: ResolvedOptions): string
  /**
   * Deserialize a string to an AG Grid filter model
   * @param config - Caller's configuration. All serializers honour
   * maxValueLength and onParseError. JSON and Base64 drop over-length text
   * values and report them through onParseError (see #213, #207).
   */
  deserialize(value: string, config?: ResolvedOptions): FilterModel
  /** Format identifier */
  format: SerializationFormat
}

// ============================================================================
// createGridUrlSync (#221)
// ============================================================================

declare const codecBrand: unique symbol

/**
 * How the filters are written in the URL. Make one with `individual()` or
 * `grouped()`. It is opaque: only `createGridUrlSync` reads it.
 */
export interface Codec {
  readonly [codecBrand]: true
}

/**
 * The state of a sync. `'idle'`: there is no sync yet (the React hook uses
 * it). `'active'`: the sync listens to the grid. `'destroyed'`: after
 * `destroy()`, or after the grid is destroyed.
 */
export type SyncStatus = 'idle' | 'active' | 'destroyed'

/**
 * Where the work that found an issue started. `'url'`: the sync read the
 * address bar itself (on create, or on `popstate`). `'grid'`: the sync read
 * the grid after a filter change. `'api'`: a method that the app called.
 * The work that a call starts has the source of the call: the grid read
 * after its write, a later landing of that write, and a stored pointer
 * write (#313).
 */
export type IssueSource = 'url' | 'grid' | 'api'

/** The one argument of `onIssue` */
export interface IssueEvent {
  issue: URLSyncError
  source: IssueSource
}

/**
 * The state of a sync, for `useSyncExternalStore` and for apps. The same
 * object is returned until something in it changes.
 */
export interface GridUrlSyncSnapshot {
  readonly status: SyncStatus
  /** The URL with the grid's filters and the page's own params */
  readonly url: string
  /**
   * Whether the grid has a filter: `api.getFilterModel()` is not empty. Also
   * true for a filter that the URL does not hold, such as a combined (AND/OR)
   * filter, a set filter, a custom filter or a value that is too long (#315).
   */
  readonly hasFilters: boolean
  /**
   * The data issues of the latest apply and of the latest grid read, and a
   * failed address-bar write. Other failures, such as `GRID_ERROR`, go to
   * `onIssue` only (#284).
   */
  readonly issues: readonly URLSyncError[]
  /** The saved views, in save order. Empty with no `views` option. */
  readonly views: readonly GridView[]
  /** The id of the active saved view, or null */
  readonly activeViewId: string | null
}

/**
 * What a history function gets with the URL (#304). `replace` is true for a
 * write that must not add a history entry: the create-time write of the
 * grid's own filters, and the restore of a stored view. It is false for a
 * user edit, a view load and `applyFilters`. So
 * `replace ? router.replace(url) : router.push(url)` gives the history that
 * `'push'` gives.
 */
export interface HistoryWrite {
  /** True when the write must replace the history entry */
  readonly replace: boolean
}

/**
 * How the sync writes a filter change to the address bar: a user edit, a
 * view load or `applyFilters`. A URL apply writes nothing. `'none'` never
 * writes. `'replace'` and `'push'` use `window.history`. A function gets the
 * URL and a `HistoryWrite`, for example
 * `(url, { replace }) => (replace ? router.replace(url) : router.push(url))`.
 * A function with one parameter also works, for example
 * `url => router.replace(url)`.
 */
export type HistoryMode =
  | 'none'
  | 'replace'
  | 'push'
  | ((url: string, write: HistoryWrite) => void)

/**
 * The options of the public URL functions, `parseUrlFilters` and
 * `generateUrl`. The names and meanings are the same as in
 * `GridUrlSyncOptions`. One option is only here: `columnTypes`. A sync reads
 * the column types from the grid.
 */
export interface UrlOptions {
  /**
   * How the filters are written in the URL
   * @default individual()
   */
  codec?: Codec | undefined
  /**
   * Maximum length for a filter value
   * @default 200
   */
  maxValueLength?: number | undefined
  /**
   * The filter type of each column, for the operations that every type has
   * (`eq`, `notEqual`, `blank`, `notBlank`): the URL does not say the type
   * of those. With no type, the value stays text, so `?f_zip_eq=01234` keeps
   * its leading zero.
   * @example `column => (column === 'age' ? 'number' : undefined)`
   */
  columnTypes?: ((column: string) => FilterType | undefined) | undefined
  /**
   * Throw an issue instead of reporting it. `true` throws every issue, and a
   * function throws the issues for which it gives `true`. A thrown issue does
   * not go to `onIssue`, and the first one stops the call.
   * @default false
   */
  throwOnError?: boolean | ((issue: URLSyncError) => boolean) | undefined
  /** Gets each issue one time. The `source` is always `'api'`. */
  onIssue?: ((event: IssueEvent) => void) | undefined
}

/** The options of `createGridUrlSync` */
export interface GridUrlSyncOptions {
  /** The AG Grid API */
  api: AGGridApi
  /**
   * How the filters are written in the URL
   * @default individual()
   */
  codec?: Codec | undefined
  /**
   * Maximum length for a filter value
   * @default 200
   */
  maxValueLength?: number | undefined
  /** @default 'none' */
  history?: HistoryMode | undefined
  /**
   * Apply the URL when the browser's back or forward button changes it
   * @default true when `history` is `'push'`, else false
   */
  popstate?: boolean | undefined
  /**
   * Apply the address bar's filters when the sync is made. A URL with no
   * filters keeps the grid's filters, and with `history` they are written
   * to the URL with replace. AG Grid 31 applies `initialState` filters when
   * the first rows come: the sync writes them at that time.
   * @default true
   */
  applyUrlOnCreate?: boolean | undefined
  /**
   * Throw an issue instead of reporting it, in the methods that the app
   * calls (`applyUrl`, `applyFilters`, `getUrl`, `saveView`, `loadView`,
   * `deleteView`). `createGridUrlSync` and the sync's own listeners never
   * throw.
   * @default false
   */
  throwOnError?: boolean | ((issue: URLSyncError) => boolean) | undefined
  /** Gets each issue one time */
  onIssue?: ((event: IssueEvent) => void) | undefined
  /**
   * The saved views. Give `createViewStore(key)` from
   * `ag-grid-url-sync/views`, or your own `ViewStore`. With no
   * store, `views` is empty and the view methods do nothing. On create, a
   * URL that holds the stored view restores it, else a URL with at least
   * one filter wins, else the stored view is restored.
   */
  views?: ViewStore | undefined
}

/** A sync between one grid and the URL */
export interface GridUrlSync {
  /** The current state. The same object until something changes. */
  getSnapshot(): GridUrlSyncSnapshot
  /** Calls the listener after each snapshot change. Returns unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Applies the filters of a URL (default: the address bar) to the grid */
  applyUrl(url?: string): ApplyResult
  /**
   * Writes an AG Grid filter model to the grid as the app's own write. It
   * replaces the full model, as `setFilterModel` does. A filter on a column
   * that the grid does not have is left out (`UNKNOWN_COLUMN`). A filter of
   * another type than the column is left out (`TYPE_MISMATCH`). When it
   * lands, the URL is written in the `history` mode, as for a user edit.
   */
  applyFilters(model: FilterModel): ApplyResult
  /** The URL with the grid's filters (default base: the address bar) */
  getUrl(baseUrl?: string): string
  /**
   * Saves the grid's filters as a view with this name, and makes it active.
   * The same name updates that view. Returns null with no `views` option or
   * when the save fails.
   */
  saveView(name: string): GridView | null
  /**
   * Loads a saved view into the grid and makes it active. `null` clears the
   * filters. When the view lands, the URL is written in the `history` mode,
   * as for a user edit. An unknown id reports `VIEW_NOT_FOUND`.
   */
  loadView(id: string | null): void
  /**
   * Deletes a saved view. If it is active and the grid still shows it, the
   * grid is cleared.
   */
  deleteView(id: string): void
  /**
   * Removes the listeners. The snapshot keeps the last state. After this,
   * `applyUrl`, `applyFilters`, `saveView` and `loadView` report
   * `NOT_READY`.
   */
  destroy(): void
}
