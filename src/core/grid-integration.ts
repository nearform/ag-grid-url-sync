import * as v from 'valibot'
import type {
  FilterState,
  InternalConfig,
  ColumnFilter,
  TextFilterOperation,
  NumberFilterOperation,
  DateFilterOperation,
  AGGridFilter
} from './types.js'
import type { ISimpleFilterModelType } from 'ag-grid-community'
import { NUMBER_FILTER_OPERATIONS } from './types.js'
import { operatorById, operatorFromAgGrid } from './operators.js'
import { AgGridFilterSchema, JsonObjectSchema } from './schemas.js'
import type { GridApi } from 'ag-grid-community'

/** The AG Grid name of an internal operation */
function toAgGridOperation(operation: string): ISimpleFilterModelType {
  return operatorById(operation)?.agGrid as ISimpleFilterModelType
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
 * Gets the current filter model from AG Grid
 */
export function getFilterModel(config: InternalConfig): FilterState {
  try {
    const filterState: FilterState = {}
    // AG Grid can hand back null despite the declared return type
    const model = v.safeParse(JsonObjectSchema, config.gridApi.getFilterModel())

    if (!model.success) {
      return filterState
    }

    for (const [column, entry] of Object.entries(model.output)) {
      // Filter types the library does not support (set, multi) are skipped
      const parsed = v.safeParse(AgGridFilterSchema, entry)

      if (!parsed.success) continue

      const filter = parsed.output

      // Handle text filters
      if (filter.filterType === 'text') {
        // The lookup key is the filter type and the AG Grid name
        const operator = operatorFromAgGrid('text', filter.type)

        if (operator) {
          filterState[column] = {
            filterType: 'text',
            type: operator.id as TextFilterOperation,
            filter: String(filter.filter || '')
          }
        }
      }
      // Handle number filters
      else if (filter.filterType === 'number') {
        // AG Grid uses the same names for number and date operations, so the
        // lookup key is the filter type and the AG Grid name
        const internalOperation = operatorFromAgGrid('number', filter.type)
          ?.id as NumberFilterOperation | undefined

        // If the operation type is not recognized, report the error
        if (!internalOperation) {
          if (config.onParseError) {
            config.onParseError(
              new Error(
                `Unknown number filter operation '${filter.type}' for column '${column}'. ` +
                  `Supported operations: ${NUMBER_FILTER_OPERATIONS.map(toAgGridOperation).join(', ')}`
              )
            )
          }

          continue
        }

        // A number value, or a string AG Grid kept from the input box
        const numericValue = Number(filter.filter)

        // Skip invalid number filters
        if (isNaN(numericValue)) {
          continue
        }

        // Handle range operations
        filterState[column] =
          internalOperation === 'inRange' && filter.filterTo !== undefined
            ? {
                filterType: 'number',
                type: internalOperation,
                filter: numericValue,
                filterTo: filter.filterTo
              }
            : {
                filterType: 'number',
                type: internalOperation,
                filter: numericValue
              }
      }
      // Handle date filters
      else {
        // AG Grid uses generic names for date operations (`lessThan` is
        // `dateBefore`), so the lookup key is the filter type and the name
        const mappedOperation = operatorFromAgGrid('date', filter.type)?.id as
          | DateFilterOperation
          | undefined

        if (mappedOperation) {
          const from = toIsoDateString(
            filter.dateFrom || String(filter.filter || '')
          )

          // Handle date range operations (AG Grid uses dateFrom/dateTo)
          filterState[column] =
            mappedOperation === 'dateRange' && filter.dateTo
              ? {
                  filterType: 'date',
                  type: mappedOperation,
                  filter: from,
                  filterTo: toIsoDateString(filter.dateTo)
                }
              : { filterType: 'date', type: mappedOperation, filter: from }
        }
      }
    }

    return filterState
  } catch (error) {
    if (config.onParseError) {
      config.onParseError(error as Error)
    }

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
        type: 'inRange' as ISimpleFilterModelType, // AG Grid uses 'inRange' for date ranges
        dateFrom: filter.filter,
        dateTo: filter.filterTo || null
      }
    }

    // Handle blank operations for dates
    if (filter.type === 'blank' || filter.type === 'notBlank') {
      return {
        filterType: 'date',
        type: filter.type as ISimpleFilterModelType,
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
 * Applies a filter state to AG Grid
 */
export function applyFilterModel(
  filterState: FilterState,
  config: InternalConfig
): void {
  try {
    const model: any = {}

    for (const [column, filter] of Object.entries(filterState)) {
      // A JavaScript caller can pass anything here
      if (!v.is(JsonObjectSchema, filter)) continue

      // Detect expected filter type for this column
      const expectedType = detectColumnFilterType(config.gridApi, column)

      // Validate filter type compatibility
      if (filter.filterType === 'date' && expectedType !== 'date') {
        console.warn(
          `Column '${column}' expects a ${expectedType} filter but received a date filter. This may indicate a configuration mismatch in the column definition or filter application.`
        )
        continue
      }

      if (filter.filterType === 'number' && expectedType !== 'number') {
        console.warn(
          `Column '${column}' expects a ${expectedType} filter but received a number filter. This may indicate a configuration mismatch in the column definition or filter application.`
        )
        continue
      }

      // Convert to AG Grid filter model
      const agGridFilter = convertToAGGridFilter(filter)

      if (agGridFilter) {
        model[column] = agGridFilter
      }
    }

    // Apply the filter model to AG Grid
    config.gridApi.setFilterModel(model)
  } catch (error) {
    if (config.onParseError) {
      config.onParseError(error as Error)
    }
  }
}
