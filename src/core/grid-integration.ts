import type {
  FilterState,
  InternalConfig,
  ColumnFilter,
  TextFilterOperation,
  NumberFilterOperation,
  FilterOperation
} from './types.js'
import {
  AG_GRID_OPERATION_NAMES,
  REVERSE_AG_GRID_OPERATION_NAMES,
  TEXT_FILTER_OPERATIONS,
  NUMBER_FILTER_OPERATIONS
} from './types.js'
import type { GridApi } from 'ag-grid-community'

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
 * Detects the expected filter type for a column based on AG Grid configuration
 */
export function detectColumnFilterType(
  gridApi: GridApi,
  columnId: string
): 'text' | 'number' | null {
  try {
    const column = gridApi.getColumn(columnId)
    if (!column) return null

    const colDef = column.getColDef()

    // 1. Explicit filter configuration takes priority
    if (colDef.filter === 'agNumberColumnFilter') return 'number'
    if (colDef.filter === 'agTextColumnFilter') return 'text'

    // 2. Cell data type configuration
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

      const { filterType, type, filter: value, filterTo } = filter as any

      // Handle both text and number filters
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
            filter: value || ''
          }
        }
      } else if (filterType === 'number') {
        // Map AG Grid number operations back to our internal operations
        const internalOperation =
          REVERSE_AG_GRID_OPERATION_NAMES[
            type as keyof typeof REVERSE_AG_GRID_OPERATION_NAMES
          ]

        // Use type predicate to validate and narrow the type
        if (internalOperation && isNumberFilterOperation(internalOperation)) {
          const numberFilter: ColumnFilter = {
            filterType: 'number',
            type: internalOperation, // Now properly typed as NumberFilterOperation
            filter: typeof value === 'number' ? value : 0
          }

          // Handle range operations
          if (internalOperation === 'inRange' && typeof filterTo === 'number') {
            ;(numberFilter as any).filterTo = filterTo
          }

          filterState[column] = numberFilter
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
function convertToAGGridFilter(filter: ColumnFilter): any {
  if (filter.filterType === 'number') {
    const agGridOperation =
      AG_GRID_OPERATION_NAMES[
        filter.type as keyof typeof AG_GRID_OPERATION_NAMES
      ]

    if (filter.type === 'inRange') {
      return {
        filterType: 'number',
        type: agGridOperation,
        filter: filter.filter,
        filterTo: (filter as any).filterTo
      }
    }

    return {
      filterType: 'number',
      type: agGridOperation,
      filter: filter.filter
    }
  }

  // Text filter handling (existing logic)
  const agGridOperation =
    AG_GRID_OPERATION_NAMES[filter.type as keyof typeof AG_GRID_OPERATION_NAMES]
  return {
    filterType: filter.filterType,
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
      if (filter.filterType === 'number' && expectedType !== 'number') {
        console.warn(
          `Column '${column}' expects a text filter but received a number filter. This may indicate a configuration mismatch in the column definition or filter application.`
        )
        continue
      }

      // Convert to AG Grid filter model
      const agGridFilter = convertToAGGridFilter(filter)
      if (agGridFilter) {
        model[column] = agGridFilter
      }
    }

    config.gridApi.setFilterModel(model)
  } catch (error) {
    if (config.onParseError) {
      config.onParseError(error as Error)
    }
  }
}
