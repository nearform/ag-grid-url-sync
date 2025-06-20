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
 * Extracts column name and operation from a filter parameter
 */
function extractColumnAndOperation(
  param: string,
  expectedPrefix?: string
): { column: string; operation: string } {
  const ensureTrailingUnderscore = (prefix: string): string =>
    prefix.endsWith('_') ? prefix : prefix + '_'

  const sanitizedPrefix = expectedPrefix
    ? ensureTrailingUnderscore(expectedPrefix)
    : ensureTrailingUnderscore(DEFAULT_CONFIG.paramPrefix)

  const prefixToCheck = sanitizedPrefix.slice(0, -1)
  if (!param.startsWith(prefixToCheck + '_')) {
    throw new InvalidFilterError(`Invalid filter prefix in parameter: ${param}`)
  }

  // Remove prefix and find the last underscore to separate column from operation
  const withoutPrefix = param.substring(prefixToCheck.length + 1)
  const lastUnderscoreIndex = withoutPrefix.lastIndexOf('_')

  if (lastUnderscoreIndex === -1) {
    throw new InvalidFilterError(`Invalid filter parameter format: ${param}`)
  }

  const column = withoutPrefix.substring(0, lastUnderscoreIndex)
  const operation = withoutPrefix.substring(lastUnderscoreIndex + 1)

  if (!column.trim()) {
    throw new InvalidFilterError(`Empty column name in parameter: ${param}`)
  }

  return { column, operation }
}

/**
 * Parses a URL parameter into a column filter
 */
export function parseFilterParam(
  param: string,
  value: string,
  expectedPrefix?: string
): ColumnFilter {
  const { operation } = extractColumnAndOperation(param, expectedPrefix)

  const filterOp = OPERATION_MAP[operation as keyof typeof OPERATION_MAP]
  if (!filterOp) {
    throw new InvalidFilterError(`Unsupported filter operation: ${operation}`)
  }

  return {
    filterType: 'text',
    type: filterOp,
    filter: value || ''
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
        // Extract column name and parse the filter parameter
        const { column: columnName } = extractColumnAndOperation(
          param,
          config.paramPrefix
        )
        const filterParam = parseFilterParam(param, value, config.paramPrefix)

        const validatedValue = validateFilterValue(value, config)
        filterState[columnName] = {
          ...filterParam,
          filter: validatedValue
        }
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
