import type {
  FilterState,
  ColumnFilter,
  FilterOperation,
  InternalConfig
} from './types.js'
import { InvalidFilterError, InvalidURLError } from './types.js'

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  paramPrefix: 'f_',
  maxValueLength: 200
} as const

/**
 * Operation mapping between URL parameters and AG Grid filter types
 */
const OPERATION_MAP: Record<string, FilterOperation> = {
  contains: 'contains',
  eq: 'eq'
} as const

/**
 * Validates a filter value against configuration constraints
 */
export function validateFilterValue(
  value: string,
  config: InternalConfig
): string {
  if (value.length > config.maxValueLength) {
    throw new InvalidFilterError(
      `Filter value exceeds maximum length of ${config.maxValueLength} characters`
    )
  }
  return value
}

/**
 * Parses a URL parameter into a column filter
 */
export function parseFilterParam(param: string, value: string): ColumnFilter {
  const parts = param.split('_')
  if (parts.length !== 3) {
    throw new InvalidFilterError(`Invalid filter parameter format: ${param}`)
  }

  const [prefix, column, operation] = parts
  if (prefix !== DEFAULT_CONFIG.paramPrefix.slice(0, -1)) {
    throw new InvalidFilterError(`Invalid filter prefix: ${prefix}`)
  }

  const filterOp = OPERATION_MAP[operation as keyof typeof OPERATION_MAP]
  if (!filterOp) {
    throw new InvalidFilterError(`Unsupported filter operation: ${operation}`)
  }

  return {
    filterType: 'text',
    type: filterOp,
    filter: decodeURIComponent(value)
  }
}

/**
 * Converts URL search params into a filter state object
 */
export function parseUrlFilters(
  url: string,
  config: InternalConfig
): FilterState {
  try {
    const urlObj = new URL(url)
    const filterState: FilterState = {}

    for (const [param, value] of urlObj.searchParams.entries()) {
      if (!param.startsWith(config.paramPrefix)) continue

      try {
        const columnName = param.split('_')[1]
        if (!columnName) {
          throw new InvalidFilterError(
            `Missing column name in parameter: ${param}`
          )
        }

        const validatedValue = validateFilterValue(value, config)
        filterState[columnName] = parseFilterParam(param, validatedValue)
      } catch (err) {
        if (config.onParseError) {
          config.onParseError(err as Error)
        }
        // Skip invalid filters but continue processing
        continue
      }
    }

    return filterState
  } catch (err) {
    throw new InvalidURLError(`Failed to parse URL: ${(err as Error).message}`)
  }
}

/**
 * Converts a filter state object into URL search parameters
 */
export function serializeFilters(
  filterState: FilterState,
  config: InternalConfig
): URLSearchParams {
  const params = new URLSearchParams()

  for (const [column, filter] of Object.entries(filterState)) {
    if (filter.filterType !== 'text') continue

    const operation = filter.type === 'contains' ? 'contains' : 'eq'
    const paramName = `${config.paramPrefix}${column}_${operation}`
    const value = validateFilterValue(filter.filter, config)

    // URLSearchParams already handles encoding, so don't double-encode
    params.append(paramName, value)
  }

  return params
}

/**
 * Generates a URL with the current filter state
 */
export function generateUrl(
  baseUrl: string,
  filterState: FilterState,
  config: InternalConfig
): string {
  const url = new URL(baseUrl)
  const filterParams = serializeFilters(filterState, config)

  // Preserve existing non-filter parameters
  for (const [key, value] of url.searchParams.entries()) {
    if (!key.startsWith(config.paramPrefix)) {
      filterParams.append(key, value)
    }
  }

  url.search = filterParams.toString()
  return url.toString()
}

/**
 * Gets the current filter model from AG Grid
 */
export function getFilterModel(config: InternalConfig): FilterState {
  const model = config.gridApi.getFilterModel()
  const filterState: FilterState = {}

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
}

/**
 * Applies a filter state to AG Grid
 */
export function applyFilterModel(
  filterState: FilterState,
  config: InternalConfig
): void {
  const model: any = {}

  for (const [column, filter] of Object.entries(filterState)) {
    model[column] = {
      filterType: filter.filterType,
      type: filter.type === 'eq' ? 'equals' : filter.type,
      filter: filter.filter
    }
  }

  config.gridApi.setFilterModel(model)
}
