import type {
  FilterState,
  ColumnFilter,
  FilterOperation,
  InternalConfig
} from './types.js'
import { InvalidFilterError, InvalidURLError, OPERATION_MAP } from './types.js'
import { validateFilterValue, DEFAULT_CONFIG } from './validation.js'

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

  // Special handling for blank operations - they don't use the value
  if (filterOp === 'blank' || filterOp === 'notBlank') {
    return {
      filterType: 'text',
      type: filterOp,
      filter: '' // Blank operations don't use the value
    }
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

        const validatedValue = validateFilterValue(
          value,
          config,
          filterParam.type
        )
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
