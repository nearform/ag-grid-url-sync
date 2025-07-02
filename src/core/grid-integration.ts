import type {
  FilterState,
  InternalConfig,
  ColumnFilter,
  TextFilterOperation,
  NumberFilterOperation,
  DateFilterOperation,
  FilterOperation,
  AGGridFilter,
  RawAGGridFilter
} from './types.js'
import type { ISimpleFilterModelType } from 'ag-grid-community'
import {
  AG_GRID_OPERATION_NAMES,
  REVERSE_AG_GRID_OPERATION_NAMES,
  TEXT_FILTER_OPERATIONS,
  NUMBER_FILTER_OPERATIONS,
  DATE_FILTER_OPERATIONS
} from './types.js'
import type { GridApi } from 'ag-grid-community'

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
 * Type predicate to check if an operation is a valid text filter operation
 */
function isTextFilterOperation(
  operation: FilterOperation
): operation is TextFilterOperation {
  return TEXT_FILTER_OPERATIONS.includes(operation as TextFilterOperation)
}

/**
 * Type predicate to check if an operation is a valid number filter operation
 */
function isNumberFilterOperation(
  operation: FilterOperation
): operation is NumberFilterOperation {
  return NUMBER_FILTER_OPERATIONS.includes(operation as NumberFilterOperation)
}

/**
 * Type predicate to check if an operation is a valid date filter operation
 */
function isDateFilterOperation(
  operation: FilterOperation
): operation is DateFilterOperation {
  return DATE_FILTER_OPERATIONS.includes(operation as DateFilterOperation)
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
    const model = config.gridApi.getFilterModel()
    const filterState: FilterState = {}

    if (!model || typeof model !== 'object') {
      return filterState
    }

    for (const [column, filter] of Object.entries(model)) {
      if (!filter || typeof filter !== 'object') continue

      const {
        filterType,
        type,
        filter: value,
        filterTo,
        dateFrom,
        dateTo
      } = filter as RawAGGridFilter

      // Handle text filters
      if (filterType === 'text') {
        // Map AG Grid operations back to our internal operations using centralized mapping
        const internalOperation =
          REVERSE_AG_GRID_OPERATION_NAMES[
            type as keyof typeof REVERSE_AG_GRID_OPERATION_NAMES
          ]

        // Use type predicate to validate and narrow the type
        if (internalOperation && isTextFilterOperation(internalOperation)) {
          filterState[column] = {
            filterType: 'text',
            type: internalOperation, // Now properly typed as TextFilterOperation
            filter: String(value || '')
          }
        }
      }
      // Handle number filters
      else if (filterType === 'number') {
        // For number filters, we need to handle the mapping carefully since
        // AG Grid uses the same operation names for numbers and dates
        let internalOperation = type as FilterOperation

        // Map AG Grid number operations to our internal number operations
        // Since AG Grid uses generic names, we need to be explicit about number operations
        const AG_GRID_TO_NUMBER_OPERATION_MAP: Record<string, FilterOperation> =
          {
            lessThan: 'lessThan',
            lessThanOrEqual: 'lessThanOrEqual',
            greaterThan: 'greaterThan',
            greaterThanOrEqual: 'greaterThanOrEqual',
            inRange: 'inRange',
            equals: 'eq',
            notEqual: 'notEqual',
            blank: 'blank',
            notBlank: 'notBlank'
          } as const

        // Use the explicit number mapping instead of the reverse AG Grid mapping
        internalOperation =
          (type && AG_GRID_TO_NUMBER_OPERATION_MAP[type]) ||
          (type as FilterOperation)

        // Use type predicate to validate and narrow the type
        if (internalOperation && isNumberFilterOperation(internalOperation)) {
          // Validate that the filter value is actually a number
          const numericValue = typeof value === 'number' ? value : Number(value)

          // Skip invalid number filters
          if (isNaN(numericValue)) {
            continue
          }

          const numberFilter: ColumnFilter = {
            filterType: 'number',
            type: internalOperation, // Now properly typed as NumberFilterOperation
            filter: numericValue
          }

          // Handle range operations
          if (internalOperation === 'inRange' && typeof filterTo === 'number') {
            ;(numberFilter as any).filterTo = filterTo
          }

          filterState[column] = numberFilter
        }
      }
      // Handle date filters
      else if (filterType === 'date') {
        // Map AG Grid date operations back to our internal operations
        const internalOperation =
          REVERSE_AG_GRID_OPERATION_NAMES[
            type as keyof typeof REVERSE_AG_GRID_OPERATION_NAMES
          ]

        // For date operations, we need to handle the special case where AG Grid uses
        // generic operation names but we have date-specific internal names
        let mappedOperation = internalOperation

        // Map AG Grid generic date operations to our date-specific operations
        const AG_GRID_TO_DATE_OPERATION_MAP: Record<
          string,
          DateFilterOperation
        > = {
          lessThan: 'dateBefore',
          lessThanOrEqual: 'dateBeforeOrEqual',
          greaterThan: 'dateAfter',
          greaterThanOrEqual: 'dateAfterOrEqual',
          inRange: 'dateRange'
        } as const

        mappedOperation = type
          ? AG_GRID_TO_DATE_OPERATION_MAP[type] || internalOperation
          : internalOperation

        // Use type predicate to validate and narrow the type
        if (mappedOperation && isDateFilterOperation(mappedOperation)) {
          const dateFilter: ColumnFilter = {
            filterType: 'date',
            type: mappedOperation,
            filter: toIsoDateString(dateFrom || String(value || ''))
          }

          // Handle date range operations (AG Grid uses dateFrom/dateTo)
          if (mappedOperation === 'dateRange' && dateTo) {
            ;(dateFilter as any).filterTo = toIsoDateString(dateTo)
          }

          filterState[column] = dateFilter
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

    // Map date-specific operations to AG Grid generic operations
    const dateOperationMapping: Record<string, string> = {
      dateBefore: 'lessThan',
      dateBeforeOrEqual: 'lessThanOrEqual',
      dateAfter: 'greaterThan',
      dateAfterOrEqual: 'greaterThanOrEqual'
    }

    const agOperation =
      dateOperationMapping[filter.type] ||
      (AG_GRID_OPERATION_NAMES[
        filter.type as keyof typeof AG_GRID_OPERATION_NAMES
      ] as ISimpleFilterModelType)

    return {
      filterType: 'date',
      type: agOperation as ISimpleFilterModelType,
      dateFrom: filter.filter,
      dateTo: null
    }
  }

  if (filter.filterType === 'number') {
    const agGridOperation = AG_GRID_OPERATION_NAMES[
      filter.type as keyof typeof AG_GRID_OPERATION_NAMES
    ] as ISimpleFilterModelType

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
  const agGridOperation = AG_GRID_OPERATION_NAMES[
    filter.type as keyof typeof AG_GRID_OPERATION_NAMES
  ] as ISimpleFilterModelType
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
      if (!filter || typeof filter !== 'object') continue

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
