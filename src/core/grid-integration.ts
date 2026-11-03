import * as v from 'valibot'
import type {
  AGGridUrlSyncConfig,
  FilterState,
  InternalConfig,
  ResolvedOptions,
  ColumnFilter,
  AGGridFilter
} from './types.js'
import type { ISimpleFilterModelType } from 'ag-grid-community'
import {
  InvalidFilterError,
  NUMBER_FILTER_OPERATIONS,
  isDateFilterOperation,
  isNumberFilterOperation,
  isTextFilterOperation
} from './types.js'
import { operatorById, operatorFromAgGrid } from './operators.js'
import { AgGridFilterSchema, JsonObjectSchema } from './schemas.js'
import { reportIssue, toIssue } from './issues.js'
import { readNumber } from './validation.js'
import { resolveOptions } from './options.js'
import type { GridApi } from 'ag-grid-community'

/**
 * The AG Grid name of an internal operation. Null (no operation, in AG Grid's
 * model types) for an id that is not in the operator table, which only
 * untyped input can give.
 */
function toAgGridOperation(operation: string): ISimpleFilterModelType | null {
  return operatorById(operation)?.agGrid ?? null
}

/**
 * Whether the AG Grid model has a value here. AG Grid leaves a value out, or
 * sets it to null, while a filter is being edited, and an empty input box can
 * give an empty string (#260).
 */
function hasGridValue(
  value: string | number | null | undefined
): value is string | number {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

/**
 * A number from the AG Grid model. A number value is what the grid filters
 * on, so it is kept. A string that AG Grid kept from the input box gets the
 * same check as a URL param, and the error names the column (#238).
 */
function gridNumber(
  value: string | number,
  column: string
): number | InvalidFilterError {
  if (!v.is(v.string(), value)) return Number(value)

  const number = readNumber(value)

  return number instanceof InvalidFilterError
    ? new InvalidFilterError(
        `${number.message} (column '${column}')`,
        undefined,
        {
          code: 'INVALID_NUMBER',
          column
        }
      )
    : number
}

/**
 * Converts a date string to ISO format (YYYY-MM-DD)
 * Handles both date strings and undefined values
 * Returns an empty string if the input is undefined or invalid
 */
function toIsoDateString(val: string | undefined): string {
  if (!val) return ''
  const match = val.match(/^(\d{4}-\d{2}-\d{2})/)

  return match?.[1] ? match[1] : val || ''
}

/**
 * Detects the expected filter type for a column based on AG Grid configuration
 */
export function detectColumnFilterType(
  gridApi: GridApi,
  columnId: string
): 'text' | 'number' | 'date' {
  try {
    const column = gridApi.getColumn(columnId)

    if (!column) return 'text' // Default to text for unknown columns

    const colDef = column.getColDef()

    // 1. Explicit filter configuration takes priority
    if (colDef.filter === 'agDateColumnFilter') return 'date'

    if (colDef.filter === 'agNumberColumnFilter') return 'number'

    if (colDef.filter === 'agTextColumnFilter') return 'text'

    // 2. Cell data type configuration
    if (colDef.cellDataType === 'date') return 'date'

    if (colDef.cellDataType === 'number') return 'number'

    if (colDef.cellDataType === 'text') return 'text'

    // 3. Default to text for backward compatibility
    return 'text'
  } catch {
    return 'text' // Safe fallback
  }
}

/**
 * Gets the current filter model from AG Grid as a filter state. Filter types
 * that the library does not support are skipped, and a filter that is not
 * valid is reported through `options.onParseError`.
 *
 * @param gridApi - AG Grid API instance
 * @param options - Optional options. Only `onParseError` is read.
 */
export function getFilterModel(
  gridApi: GridApi,
  options?: AGGridUrlSyncConfig
): FilterState
/**
 * Gets the current filter model from AG Grid
 *
 * @deprecated Give the grid API as an argument:
 * `getFilterModel(gridApi, options)`. This form will be removed in v1.0.
 */
export function getFilterModel(config: InternalConfig): FilterState
export function getFilterModel(
  source: GridApi | InternalConfig,
  options?: AGGridUrlSyncConfig
): FilterState {
  // The deprecated form has the grid in its config object. A GridApi has no
  // `gridApi` key.
  if ('gridApi' in source) {
    return readGridFilters(source.gridApi, resolveOptions(source))
  }

  return readGridFilters(source, resolveOptions(options))
}

function readGridFilters(
  gridApi: GridApi,
  options: ResolvedOptions
): FilterState {
  try {
    // A Map, not a plain object: an assignment to `obj['__proto__']` would
    // call the prototype setter, and the column would be lost (#253)
    const filters = new Map<string, ColumnFilter>()
    // AG Grid can hand back null despite the declared return type
    const model: unknown = gridApi.getFilterModel()

    // Checked, not parsed: Valibot's record output leaves out the keys
    // `__proto__`, `constructor` and `prototype`, and here each one is a
    // column name like any other
    if (!v.is(JsonObjectSchema, model)) {
      return {}
    }

    for (const [column, entry] of Object.entries(model)) {
      // Filter types the library does not support (set, multi) are skipped
      const parsed = v.safeParse(AgGridFilterSchema, entry)

      if (!parsed.success) continue

      const filter = parsed.output

      // Handle text filters
      if (filter.filterType === 'text') {
        // The lookup key is the filter type and the AG Grid name
        const operator = operatorFromAgGrid('text', filter.type)

        if (operator && isTextFilterOperation(operator.id)) {
          filters.set(column, {
            filterType: 'text',
            type: operator.id,
            filter: String(filter.filter || '')
          })
        }
      }
      // Handle number filters
      else if (filter.filterType === 'number') {
        // AG Grid uses the same names for number and date operations, so the
        // lookup key is the filter type and the AG Grid name
        const operator = operatorFromAgGrid('number', filter.type)
        const internalOperation = operator?.id

        // If the operation type is not recognized, report the error
        if (
          !operator ||
          !internalOperation ||
          !isNumberFilterOperation(internalOperation)
        ) {
          reportIssue(
            options,
            new InvalidFilterError(
              `Unknown number filter operation '${filter.type}' for column '${column}'. ` +
                `Supported operations: ${NUMBER_FILTER_OPERATIONS.map(toAgGridOperation).join(', ')}`,
              undefined,
              { code: 'INVALID_PARAM', column }
            )
          )

          continue
        }

        // A blank filter has no value. A number filter needs a number, so
        // this one gets 0, which nothing reads: the URL writer writes `true`
        // and the grid writer writes null (#260).
        if (operator.arity === 0) {
          filters.set(column, {
            filterType: 'number',
            type: internalOperation,
            filter: 0
          })

          continue
        }

        // A value that the operation needs is not there yet: the user is
        // still editing, so there is no filter. Null is not 0 (#260).
        if (
          !hasGridValue(filter.filter) ||
          (operator.arity === 2 && !hasGridValue(filter.filterTo))
        ) {
          continue
        }

        const numericValue = gridNumber(filter.filter, column)

        // Only inRange uses filterTo, so the other operations ignore it
        const numericTo =
          operator.arity === 2 && hasGridValue(filter.filterTo)
            ? gridNumber(filter.filterTo, column)
            : undefined

        if (numericValue instanceof InvalidFilterError) {
          reportIssue(options, numericValue)

          continue
        }

        if (numericTo instanceof InvalidFilterError) {
          reportIssue(options, numericTo)

          continue
        }

        // Skip invalid number filters
        if (isNaN(numericValue)) {
          continue
        }

        // Handle range operations
        filters.set(
          column,
          internalOperation === 'inRange' && numericTo !== undefined
            ? {
                filterType: 'number',
                type: internalOperation,
                filter: numericValue,
                filterTo: numericTo
              }
            : {
                filterType: 'number',
                type: internalOperation,
                filter: numericValue
              }
        )
      }
      // Handle date filters
      else {
        // AG Grid uses generic names for date operations (`lessThan` is
        // `dateBefore`), so the lookup key is the filter type and the name
        const operator = operatorFromAgGrid('date', filter.type)
        const mappedOperation = operator?.id

        if (
          operator &&
          mappedOperation &&
          isDateFilterOperation(mappedOperation)
        ) {
          // A blank filter has no date
          if (operator.arity === 0) {
            filters.set(column, {
              filterType: 'date',
              type: mappedOperation,
              filter: ''
            })

            continue
          }

          const from = toIsoDateString(
            filter.dateFrom || String(filter.filter || '')
          )

          // Only date ranges use dateTo (AG Grid uses dateFrom/dateTo)
          const to =
            operator.arity === 2
              ? toIsoDateString(filter.dateTo ?? undefined)
              : ''

          // A date that the operation needs is not there yet: the user is
          // still editing, so there is no filter (#260)
          if (!from || (operator.arity === 2 && !to)) continue

          filters.set(
            column,
            operator.arity === 2
              ? {
                  filterType: 'date',
                  type: mappedOperation,
                  filter: from,
                  filterTo: to
                }
              : { filterType: 'date', type: mappedOperation, filter: from }
          )
        }
      }
    }

    // Object.fromEntries creates own keys, so `__proto__` stays a column
    return Object.fromEntries(filters)
  } catch (error) {
    // The grid API threw, which is not a problem with a filter
    reportIssue(options, toIssue(error, 'GRID_ERROR'))

    return {}
  }
}

/**
 * Converts internal filter to AG Grid filter format
 */
function convertToAGGridFilter(filter: ColumnFilter): AGGridFilter {
  if (filter.filterType === 'date') {
    // Handle date range operations
    if (filter.type === 'dateRange') {
      return {
        filterType: 'date',
        type: 'inRange', // AG Grid uses 'inRange' for date ranges
        dateFrom: filter.filter,
        dateTo: filter.filterTo || null
      }
    }

    // Handle blank operations for dates
    if (filter.type === 'blank' || filter.type === 'notBlank') {
      return {
        filterType: 'date',
        type: filter.type,
        dateFrom: null,
        dateTo: null
      }
    }

    // Date operations use the generic AG Grid names (`dateBefore` is
    // `lessThan`)
    return {
      filterType: 'date',
      type: toAgGridOperation(filter.type),
      dateFrom: filter.filter,
      dateTo: null
    }
  }

  if (filter.filterType === 'number') {
    const agGridOperation = toAgGridOperation(filter.type)

    // A blank filter has no value. The 0 in the filter state is only there
    // because a number filter needs a number (#260).
    if (filter.type === 'blank' || filter.type === 'notBlank') {
      return { filterType: 'number', type: agGridOperation, filter: null }
    }

    if (filter.type === 'inRange') {
      const baseFilter = {
        filterType: 'number',
        type: agGridOperation,
        filter: filter.filter
      } as const

      // Only include filterTo if it's defined
      return filter.filterTo !== undefined
        ? { ...baseFilter, filterTo: filter.filterTo }
        : baseFilter
    }

    return {
      filterType: 'number',
      type: agGridOperation,
      filter: filter.filter
    }
  }

  // Text filter handling
  const agGridOperation = toAgGridOperation(filter.type)

  return {
    filterType: 'text',
    type: agGridOperation,
    filter: filter.filter
  }
}

/**
 * Applies a filter state to AG Grid. A filter whose type does not match the
 * column is skipped with a warning. An error from the grid is reported
 * through `options.onParseError`.
 *
 * @param filterState - Filter state to apply
 * @param gridApi - AG Grid API instance
 * @param options - Optional options. Only `onParseError` is read.
 */
export function applyFilterModel(
  filterState: FilterState,
  gridApi: GridApi,
  options?: AGGridUrlSyncConfig
): void
/**
 * Applies a filter state to AG Grid
 *
 * @deprecated Give the grid API as an argument:
 * `applyFilterModel(filterState, gridApi, options)`. This form will be
 * removed in v1.0.
 */
export function applyFilterModel(
  filterState: FilterState,
  config: InternalConfig
): void
export function applyFilterModel(
  filterState: FilterState,
  target: GridApi | InternalConfig,
  options?: AGGridUrlSyncConfig
): void {
  // The deprecated form has the grid in its config object. A GridApi has no
  // `gridApi` key.
  if ('gridApi' in target) {
    writeGridFilters(filterState, target.gridApi, resolveOptions(target))

    return
  }

  writeGridFilters(filterState, target, resolveOptions(options))
}

function writeGridFilters(
  filterState: FilterState,
  gridApi: GridApi,
  options: ResolvedOptions
): void {
  try {
    // A Map, not a plain object: an assignment to `obj['__proto__']` would
    // call the prototype setter, and the column would be lost (#253)
    const model = new Map<string, AGGridFilter>()

    for (const [column, filter] of Object.entries(filterState)) {
      // A JavaScript caller can pass anything here
      if (!v.is(JsonObjectSchema, filter)) continue

      // Detect expected filter type for this column
      const expectedType = detectColumnFilterType(gridApi, column)

      // Validate filter type compatibility
      if (filter.filterType === 'date' && expectedType !== 'date') {
        reportIssue(
          options,
          new InvalidFilterError(
            `Column '${column}' expects a ${expectedType} filter but received a date filter. This may indicate a configuration mismatch in the column definition or filter application.`,
            undefined,
            { code: 'TYPE_MISMATCH', column }
          )
        )
        continue
      }

      if (filter.filterType === 'number' && expectedType !== 'number') {
        reportIssue(
          options,
          new InvalidFilterError(
            `Column '${column}' expects a ${expectedType} filter but received a number filter. This may indicate a configuration mismatch in the column definition or filter application.`,
            undefined,
            { code: 'TYPE_MISMATCH', column }
          )
        )
        continue
      }

      // Convert to AG Grid filter model
      const agGridFilter = convertToAGGridFilter(filter)

      if (agGridFilter) {
        model.set(column, agGridFilter)
      }
    }

    // Apply the filter model to AG Grid
    // Object.fromEntries creates own keys, so `__proto__` stays a column
    gridApi.setFilterModel(Object.fromEntries(model))
  } catch (error) {
    // The grid API threw, which is not a problem with a filter
    reportIssue(options, toIssue(error, 'GRID_ERROR'))
  }
}
