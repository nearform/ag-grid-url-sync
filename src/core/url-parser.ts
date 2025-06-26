import type { FilterState, ColumnFilter, InternalConfig } from './types.js'
import { InvalidFilterError, InvalidURLError, OPERATION_MAP } from './types.js'
import {
  validateFilterValue,
  validateAndParseNumber,
  validateNumberRange,
  validateNumberFilter,
  DEFAULT_CONFIG
} from './validation.js'

/**
 * Detects if an operation is number-specific
 */
function isNumberOperation(operation: string): boolean {
  return [
    'lessThan',
    'lessThanOrEqual',
    'greaterThan',
    'greaterThanOrEqual',
    'inRange'
  ].includes(operation)
}

/**
 * Detects if an operation works with both text and number filters
 */
function isSharedOperation(operation: string): boolean {
  return ['eq', 'notEqual', 'blank', 'notBlank'].includes(operation)
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

  // Handle range operations
  if (filterOp === 'inRange') {
    const rangeParts = value.split(',')
    if (rangeParts.length !== 2) {
      throw new InvalidFilterError(
        'Range operation requires exactly two values separated by comma'
      )
    }

    const min = validateAndParseNumber(rangeParts[0] || '')
    const max = validateAndParseNumber(rangeParts[1] || '')

    const rangeValidation = validateNumberRange(min, max)
    if (!rangeValidation.valid) {
      throw new InvalidFilterError(
        rangeValidation.error || 'Invalid range values'
      )
    }

    return {
      filterType: 'number',
      type: filterOp as any,
      filter: min,
      filterTo: max
    }
  }

  // Handle number operations
  if (isNumberOperation(filterOp)) {
    const numValue = validateAndParseNumber(value)

    return {
      filterType: 'number',
      type: filterOp as any,
      filter: numValue
    }
  }

  // Handle blank operations first (work for both text and number but default to text)
  if (filterOp === 'blank' || filterOp === 'notBlank') {
    return {
      filterType: 'text',
      type: filterOp,
      filter: '' // Blank operations don't use the value
    }
  }

  // Handle shared operations (eq, notEqual) - detect if they should be number based on value
  if (isSharedOperation(filterOp)) {
    // Try to parse as number first
    try {
      const numValue = parseFloat(value)
      if (!isNaN(numValue) && Number.isFinite(numValue)) {
        const validation = validateNumberFilter(numValue)
        if (validation.valid) {
          return {
            filterType: 'number',
            type: filterOp as any,
            filter: numValue
          }
        }
      }
    } catch {
      // Fall through to text handling
    }

    return {
      filterType: 'text',
      type: filterOp as any,
      filter: value || ''
    }
  }

  // Handle text operations (existing logic)
  return {
    filterType: 'text',
    type: filterOp as any,
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

        // Apply validation based on filter type
        if (filterParam.filterType === 'text') {
          const validatedValue = validateFilterValue(
            value,
            config,
            filterParam.type
          )
          filterState[columnName] = {
            ...filterParam,
            filter: validatedValue
          }
        } else {
          // Number filters are already validated in parseFilterParam
          filterState[columnName] = filterParam
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
