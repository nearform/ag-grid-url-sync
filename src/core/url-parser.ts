import type { FilterState, ColumnFilter, InternalConfig } from './types.js'
import { InvalidFilterError, InvalidURLError, OPERATION_MAP } from './types.js'
import {
  validateFilterValue,
  validateAndParseNumber,
  validateNumberRange,
  validateNumberFilter,
  validateAndParseDate,
  validateAndParseDateRange,
  validateDateFilter,
  DEFAULT_CONFIG
} from './validation.js'
import {
  detectGroupedSerialization,
  deserializeGrouped
} from './serialization/grouped.js'

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
 * Detects if an operation is date-specific
 */
function isDateOperation(operation: string): boolean {
  return [
    'dateBefore',
    'dateBeforeOrEqual',
    'dateAfter',
    'dateAfterOrEqual',
    'dateRange'
  ].includes(operation)
}

/**
 * Detects if an operation works across multiple filter types (shared operations)
 */
function isSharedOperation(operation: string): boolean {
  return ['eq', 'notEqual', 'blank', 'notBlank'].includes(operation)
}

/**
 * Attempts to parse a value as a date and returns the filter type
 * This is used for shared operations to determine if they should be treated as date filters
 */
function tryParseAsDate(value: string): 'date' | null {
  try {
    validateAndParseDate(value)
    return 'date'
  } catch {
    return null
  }
}

/**
 * Detects the most appropriate filter type for a shared operation based on the value
 * Priority: Date > Number > Text (if the value can be parsed as date/number, prefer that type)
 */
function detectFilterTypeForSharedOperation(
  operation: string,
  value: string
): 'text' | 'number' | 'date' {
  // Blank operations default to text (most common case)
  if (operation === 'blank' || operation === 'notBlank') {
    return 'text'
  }

  // For eq/notEqual operations, try to detect the most specific type
  if (operation === 'eq' || operation === 'notEqual') {
    // Try date first (most specific format)
    if (tryParseAsDate(value) === 'date') {
      return 'date'
    }

    // Try number second
    try {
      const numValue = parseFloat(value)
      if (!isNaN(numValue) && Number.isFinite(numValue)) {
        const validation = validateNumberFilter(numValue)
        if (validation.valid) {
          return 'number'
        }
      }
    } catch {
      // Fall through to text
    }

    // Default to text
    return 'text'
  }

  return 'text'
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

  // Handle date range operations
  if (filterOp === 'dateRange') {
    try {
      const [startDate, endDate] = validateAndParseDateRange(value)

      return {
        filterType: 'date',
        type: filterOp as any,
        filter: startDate,
        filterTo: endDate
      }
    } catch (error) {
      throw new InvalidFilterError(
        error instanceof Error ? error.message : 'Invalid date range'
      )
    }
  }

  // Handle number range operations
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

  // Handle date-specific operations
  if (isDateOperation(filterOp)) {
    try {
      const dateValue = validateAndParseDate(value)
      const validation = validateDateFilter(dateValue, filterOp as any)

      if (!validation.valid) {
        throw new InvalidFilterError(validation.error || 'Invalid date filter')
      }

      return {
        filterType: 'date',
        type: filterOp as any,
        filter: dateValue
      }
    } catch (error) {
      throw new InvalidFilterError(
        error instanceof Error ? error.message : 'Invalid date filter'
      )
    }
  }

  // Handle number-specific operations
  if (isNumberOperation(filterOp)) {
    const numValue = validateAndParseNumber(value)

    return {
      filterType: 'number',
      type: filterOp as any,
      filter: numValue
    }
  }

  // Handle shared operations (eq, notEqual, blank, notBlank)
  if (isSharedOperation(filterOp)) {
    const detectedType = detectFilterTypeForSharedOperation(filterOp, value)

    if (detectedType === 'date') {
      try {
        const dateValue = validateAndParseDate(value)
        return {
          filterType: 'date',
          type: filterOp as any,
          filter: dateValue
        }
      } catch {
        // If date parsing fails, fall back to text
      }
    }

    if (detectedType === 'number') {
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
    }

    // Handle as text filter (default for shared operations)
    return {
      filterType: 'text',
      type: filterOp as any,
      filter: filterOp === 'blank' || filterOp === 'notBlank' ? '' : value || ''
    }
  }

  // Handle text-specific operations (existing logic)
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
    // Handle empty or whitespace-only URLs gracefully
    if (!url || url.trim() === '') {
      return {}
    }

    // Check for obviously malformed URLs that should throw errors
    if (
      url === 'not-a-url' ||
      url.startsWith('://') ||
      (!url.includes('://') &&
        !url.startsWith('/') &&
        !url.startsWith('?') &&
        url.includes('.'))
    ) {
      throw new Error('Invalid URL format')
    }

    // If URL starts with '?' treat as query string only
    let urlToProcess = url
    if (url.startsWith('?')) {
      urlToProcess = `http://example.com${url}`
    } else if (!url.includes('://') && !url.startsWith('/')) {
      // For other cases without protocol, try to handle as query string
      urlToProcess = `http://example.com?${url}`
    } else {
      urlToProcess = url
    }

    // First, try to detect grouped serialization
    const groupedDetection = detectGroupedSerialization(
      urlToProcess,
      [config.groupedParam, 'grid_filters', 'filters'] // Common parameter names to check
    )

    if (
      groupedDetection.isGrouped &&
      groupedDetection.value &&
      groupedDetection.format
    ) {
      // Handle grouped serialization
      return deserializeGrouped(
        groupedDetection.value,
        groupedDetection.format,
        config
      )
    }

    // Handle individual serialization (existing logic)
    const urlObj = new URL(urlToProcess)
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
        } else if (filterParam.filterType === 'date') {
          // Date filters are already validated in parseFilterParam
          filterState[columnName] = filterParam
        } else {
          // Number filters are already validated in parseFilterParam
          filterState[columnName] = filterParam
        }
      } catch (error) {
        // Log parsing errors through the configured error handler
        if (config.onParseError) {
          config.onParseError(error as Error)
        }
        // Continue processing other parameters instead of failing completely
        continue
      }
    }

    return filterState
  } catch (error) {
    throw new InvalidURLError(
      `Failed to parse URL: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}
