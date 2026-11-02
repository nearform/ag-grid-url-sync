import type { FilterState, ColumnFilter, ParseConfig } from './types.js'
import {
  InvalidFilterError,
  OPERATION_MAP,
  INTERNAL_TO_URL_OPERATION_MAP
} from './types.js'
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

// Individual (prefixed) URL parameter serialization and parsing.
//
// This module must not import serialization/grouped.ts. QueryStringSerializer
// uses it, and grouped.ts imports QueryStringSerializer, so an import of
// grouped.ts here would make a circular import (#202).

const FILTER_TYPES = {
  TEXT: 'text',
  NUMBER: 'number',
  DATE: 'date'
} as const

/**
 * Serializes a single column filter to URL parameter
 */
function serializeColumnFilter(
  columnName: string,
  filter: ColumnFilter,
  paramPrefix: string
): string {
  const urlOperation =
    INTERNAL_TO_URL_OPERATION_MAP[
      filter.type as keyof typeof INTERNAL_TO_URL_OPERATION_MAP
    ]
  if (!urlOperation) return ''

  const paramName = `${paramPrefix}${columnName}_${urlOperation}`

  // Handle date range operations
  if (filter.type === 'dateRange' && filter.filterType === FILTER_TYPES.DATE) {
    // Type guard: ensure this is a DateColumnFilter with dateRange operation
    if ('filterTo' in filter && filter.filterTo !== undefined) {
      // Don't encode the comma for range values - handle this directly
      return `${paramName}=${filter.filter},${filter.filterTo}`
    }
    return ''
  }

  // Handle number range operations
  if (filter.type === 'inRange' && filter.filterType === FILTER_TYPES.NUMBER) {
    // Type guard: ensure this is a NumberColumnFilter with inRange operation
    if ('filterTo' in filter && filter.filterTo !== undefined) {
      // Don't encode the comma for range values - handle this directly
      return `${paramName}=${filter.filter},${filter.filterTo}`
    }
    return ''
  }

  // Handle blank operations (shared across text, number, and date)
  if (filter.type === 'blank' || filter.type === 'notBlank') {
    return `${paramName}=true`
  }

  // Handle date operations (ISO date format preservation)
  if (filter.filterType === FILTER_TYPES.DATE) {
    return `${paramName}=${filter.filter}` // ISO dates don't need URL encoding
  }

  // Handle number operations
  if (filter.filterType === FILTER_TYPES.NUMBER) {
    return `${paramName}=${filter.filter}`
  }

  // Handle text operations (existing logic)
  if (filter.filterType === FILTER_TYPES.TEXT && filter.filter) {
    // Note: Validation should be done at the serializeFilters level, not here
    return `${paramName}=${encodeURIComponent(filter.filter.toString())}`
  }

  return ''
}

/**
 * Helper function to append a serialized parameter to URLSearchParams
 */
function appendSerializedParam(
  serialized: string,
  params: URLSearchParams,
  isRangeOperation = false
): void {
  const [paramName, paramValue] = serialized.split('=')
  if (paramName && paramValue) {
    if (isRangeOperation) {
      // For range operations (which contain commas), don't decode
      params.append(paramName, paramValue)
    } else {
      // For regular operations, decode special characters for text filters
      params.append(paramName, decodeURIComponent(paramValue))
    }
  }
}

/**
 * Converts a filter state object into URL search parameters.
 * This function does not require a GridApi instance - you can omit `gridApi` (or
 * pass `null`) when you only need to serialize filters without a grid.
 */
export function serializeFilters(
  filterState: FilterState,
  config: ParseConfig
): URLSearchParams {
  const params = new URLSearchParams()

  for (const [column, filter] of Object.entries(filterState)) {
    // Support text, number, and date filters
    if (
      filter.filterType !== FILTER_TYPES.TEXT &&
      filter.filterType !== FILTER_TYPES.NUMBER &&
      filter.filterType !== FILTER_TYPES.DATE
    )
      continue

    // Apply validation for text filters before serialization
    if (filter.filterType === FILTER_TYPES.TEXT) {
      const validatedValue = validateFilterValue(
        filter.filter,
        config,
        filter.type
      )
      const updatedFilter = { ...filter, filter: validatedValue }
      const serialized = serializeColumnFilter(
        column,
        updatedFilter,
        config.paramPrefix
      )
      if (serialized) {
        appendSerializedParam(serialized, params, false) // Text filters are not range operations
      }
    } else {
      // Number and date filters don't need additional validation as they're already validated
      const serialized = serializeColumnFilter(
        column,
        filter,
        config.paramPrefix
      )
      if (serialized) {
        // Check if this is a range operation
        const isRangeOp =
          filter.type === 'inRange' || filter.type === 'dateRange'
        appendSerializedParam(serialized, params, isRangeOp)
      }
    }
  }

  return params
}

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
 * Parses prefixed filter parameters into a filter state object.
 * Parameters without the configured prefix are skipped. A parameter that fails
 * to parse is reported through `config.onParseError` and skipped.
 */
export function parseIndividualParams(
  searchParams: URLSearchParams,
  config: ParseConfig
): FilterState {
  const filterState: FilterState = {}

  for (const [param, value] of searchParams.entries()) {
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
}
