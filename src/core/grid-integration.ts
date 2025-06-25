import type { FilterState, InternalConfig } from './types.js'
import {
  AG_GRID_OPERATION_NAMES,
  REVERSE_AG_GRID_OPERATION_NAMES
} from './types.js'

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

      const { filterType, type, filter: value } = filter as any
      if (filterType !== 'text') continue

      // Map AG Grid operations back to our internal operations using centralized mapping
      const internalOperation =
        REVERSE_AG_GRID_OPERATION_NAMES[
          type as keyof typeof REVERSE_AG_GRID_OPERATION_NAMES
        ]

      if (internalOperation) {
        filterState[column] = {
          filterType: 'text',
          type: internalOperation as any,
          filter: value || ''
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
 * Applies a filter state to AG Grid
 */
export function applyFilterModel(
  filterState: FilterState,
  config: InternalConfig
): void {
  try {
    const model: any = {}

    for (const [column, filter] of Object.entries(filterState)) {
      if (
        filter &&
        typeof filter === 'object' &&
        filter.filterType === 'text'
      ) {
        // Convert our internal operation to AG Grid operation using centralized mapping
        const agGridOperation =
          AG_GRID_OPERATION_NAMES[
            filter.type as keyof typeof AG_GRID_OPERATION_NAMES
          ]
        if (agGridOperation) {
          model[column] = {
            filterType: filter.filterType,
            type: agGridOperation,
            filter: filter.filter
          }
        }
      }
    }

    config.gridApi.setFilterModel(model)
  } catch (error) {
    if (config.onParseError) {
      config.onParseError(error as Error)
    }
  }
}
