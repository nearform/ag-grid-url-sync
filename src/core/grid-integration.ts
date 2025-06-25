import type { FilterState, InternalConfig } from './types.js'

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
      if (filterType !== 'text' || !value) continue

      if (type === 'contains' || type === 'equals') {
        filterState[column] = {
          filterType: 'text',
          type: type === 'equals' ? 'eq' : 'contains',
          filter: value
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
        model[column] = {
          filterType: filter.filterType,
          type: filter.type === 'eq' ? 'equals' : filter.type,
          filter: filter.filter
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
