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
 * Serializes a single column filter to a `[name, value]` URL param pair, or
 * null when the filter has nothing to write. The pair is appended to
 * URLSearchParams as is, so any character in the column id or the value is
 * encoded correctly.
 */
function serializeColumnFilter(
  columnName: string,
  filter: ColumnFilter,
  paramPrefix: string
): [name: string, value: string] | null {
  const urlOperation =
    INTERNAL_TO_URL_OPERATION_MAP[
      filter.type as keyof typeof INTERNAL_TO_URL_OPERATION_MAP
    ]
  if (!urlOperation) return null

  const paramName = `${paramPrefix}${columnName}_${urlOperation}`

  // Range operations write both values, separated by a comma
  if (filter.type === 'dateRange' || filter.type === 'inRange') {
    return 'filterTo' in filter && filter.filterTo !== undefined
      ? [paramName, `${filter.filter},${filter.filterTo}`]
      : null
  }

  // Blank operations (shared across text, number, and date) have no value
  if (filter.type === 'blank' || filter.type === 'notBlank') {
    return [paramName, 'true']
  }

  // Number and date (ISO format) filters
  if (
    filter.filterType === FILTER_TYPES.NUMBER ||
    filter.filterType === FILTER_TYPES.DATE
  ) {
    return [paramName, String(filter.filter)]
  }

  // Text filters: an empty value writes nothing
  if (filter.filterType === FILTER_TYPES.TEXT && filter.filter) {
    return [paramName, filter.filter]
  }

  return null
}

/**
 * Converts a filter state object into URL search parameters.
 * This function does not require a GridApi instance: leave `config.gridApi` out
 * (or set it to `null`) when you only need to serialize filters without a grid.
 * A text value over `config.maxValueLength` is reported through
 * `config.onParseError` and skipped. The other filters are kept.
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

    // Number and date filters are already validated. Text filters are checked
    // against maxValueLength here.
    let checkedFilter: ColumnFilter = filter
    if (filter.filterType === FILTER_TYPES.TEXT) {
      try {
        checkedFilter = {
          ...filter,
          filter: validateFilterValue(filter.filter, config, filter.type)
        }
      } catch (error) {
        // Skip this filter and keep the others, the same as parsing does
        config.onParseError?.(error as Error)
        continue
      }
    }

    const param = serializeColumnFilter(
      column,
      checkedFilter,
      config.paramPrefix
    )
    if (param) {
      params.append(...param)
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
  return parseFilterOperation(operation, value)
}

/**
 * Parses a filter value for an operation that is already split from its
 * parameter name
 */
function parseFilterOperation(operation: string, value: string): ColumnFilter {
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
      const { column: columnName, operation } = extractColumnAndOperation(
        param,
        config.paramPrefix
      )
      const filterParam = parseFilterOperation(operation, value)

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
        // Number and date filters are already validated in parseFilterOperation
        filterState[columnName] = filterParam
      }
    } catch (error) {
      // Log parsing errors through the configured error handler
      config.onParseError?.(error as Error)
      // Continue processing other parameters instead of failing completely
      continue
    }
  }

  return filterState
}
