import type { FilterState, ColumnFilter, ParseConfig } from './types.js'
import { InvalidFilterError } from './types.js'
import {
  operatorById,
  operatorFromUrl,
  isOperationOnlyFor,
  isSharedOperation
} from './operators.js'
import {
  validateFilterValue,
  validateAndParseNumber,
  validateNumberRange,
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
 * The prefix that filter param names start with. An empty prefix means the
 * default (`f_`), and a prefix without a trailing `_` gets one, so 'filter'
 * gives `filter_name_contains`. The writer, the parser and the URL checks all
 * use this, so a URL that the library writes parses back (#228).
 */
export function resolveParamPrefix(paramPrefix?: string): string {
  const prefix = paramPrefix || DEFAULT_CONFIG.paramPrefix

  return prefix.endsWith('_') ? prefix : `${prefix}_`
}

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
  const urlOperation = operatorById(filter.type)?.url

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

  // Number and date (ISO format) filters. An incomplete date filter in the
  // grid has an empty value, which writes nothing.
  if (
    filter.filterType === FILTER_TYPES.NUMBER ||
    filter.filterType === FILTER_TYPES.DATE
  ) {
    const value = String(filter.filter)

    return value ? [paramName, value] : null
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
      resolveParamPrefix(config.paramPrefix)
    )

    if (param) {
      params.append(...param)
    }
  }

  return params
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
 * Parses the value as a number only if the whole value is a valid number.
 * Returns null otherwise. `parseFloat` alone accepts a number at the start of
 * the value, so "3M" became 3 (#214).
 */
function tryParseNumber(value: string): number | null {
  try {
    return validateAndParseNumber(value)
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
    if (tryParseNumber(value) !== null) {
      return 'number'
    }

    // Default to text
    return 'text'
  }

  return 'text'
}

/** A filter param name split into its column and its URL operation */
interface FilterParamName {
  column: string
  operation: string
}

/**
 * Extracts column name and operation from a filter parameter
 */
function extractColumnAndOperation(
  param: string,
  expectedPrefix?: string
): FilterParamName {
  const prefix = resolveParamPrefix(expectedPrefix)

  if (!param.startsWith(prefix)) {
    throw new InvalidFilterError(`Invalid filter prefix in parameter: ${param}`)
  }

  // Remove prefix and find the last underscore to separate column from operation
  const withoutPrefix = param.substring(prefix.length)
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
  const filterOp = operatorFromUrl(operation)?.id

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
  if (isOperationOnlyFor(filterOp, 'date')) {
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
  if (isOperationOnlyFor(filterOp, 'number')) {
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
      const numValue = tryParseNumber(value)

      if (numValue !== null) {
        return {
          filterType: 'number',
          type: filterOp as any,
          filter: numValue
        }
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
  const prefix = resolveParamPrefix(config.paramPrefix)

  for (const [param, value] of searchParams.entries()) {
    if (!param.startsWith(prefix)) continue

    try {
      // Extract column name and parse the filter parameter
      const { column: columnName, operation } = extractColumnAndOperation(
        param,
        prefix
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
