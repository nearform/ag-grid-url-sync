import type {
  AGGridUrlSyncConfig,
  FilterState,
  FilterType,
  ColumnFilter,
  DateFilterOperation,
  ResolvedOptions
} from './types.js'
import { InvalidFilterError } from './types.js'
import {
  operatorById,
  operatorFromUrl,
  isOperationOnlyFor,
  isSharedOperation,
  type SharedOperationId
} from './operators.js'
import {
  validateFilterValue,
  validateAndParseNumber,
  validateNumberRange,
  validateAndParseDate,
  validateAndParseDateRange,
  validateDateFilter
} from './validation.js'
import { DEFAULT_CONFIG, resolveOptions } from './options.js'
import { reportIssue, toIssue } from './issues.js'

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
 * This function does not need a grid. An option that the config leaves out
 * gets its default.
 * A text value over `config.maxValueLength` is reported through
 * `config.onParseError` and skipped. The other filters are kept.
 */
export function serializeFilters(
  filterState: FilterState,
  config: AGGridUrlSyncConfig = {}
): URLSearchParams {
  const options = resolveOptions(config)
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
          filter: validateFilterValue(filter.filter, options, filter.type)
        }
      } catch (error) {
        // Skip this filter and keep the others, the same as parsing does
        reportIssue(options, toIssue(error, 'INVALID_PARAM', column))
        continue
      }
    }

    const param = serializeColumnFilter(
      column,
      checkedFilter,
      resolveParamPrefix(options.paramPrefix)
    )

    if (param) {
      params.append(...param)
    }
  }

  return params
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
 * Parses a filter value for an operation that is already split from its
 * parameter name. `typeOf` is called only for a shared operation, so a
 * lookup sees only the columns whose type it decides.
 */
function parseFilterOperation(
  operation: string,
  value: string,
  typeOf: () => FilterType | undefined
): ColumnFilter {
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
        type: filterOp,
        filter: startDate,
        filterTo: endDate
      }
    } catch (error) {
      throw new InvalidFilterError(
        error instanceof Error ? error.message : 'Invalid date range',
        undefined,
        { code: 'INVALID_DATE' }
      )
    }
  }

  // Handle number range operations
  if (filterOp === 'inRange') {
    const rangeParts = value.split(',')

    if (rangeParts.length !== 2) {
      throw new InvalidFilterError(
        'Range operation requires exactly two values separated by comma',
        undefined,
        { code: 'INVALID_NUMBER' }
      )
    }

    const min = validateAndParseNumber(rangeParts[0] || '')
    const max = validateAndParseNumber(rangeParts[1] || '')

    const rangeValidation = validateNumberRange(min, max)

    if (!rangeValidation.valid) {
      throw new InvalidFilterError(
        rangeValidation.error || 'Invalid range values',
        undefined,
        { code: 'INVALID_NUMBER' }
      )
    }

    return {
      filterType: 'number',
      type: filterOp,
      filter: min,
      filterTo: max
    }
  }

  // Handle date-specific operations
  if (isOperationOnlyFor(filterOp, 'date')) {
    return {
      filterType: 'date',
      type: filterOp,
      filter: parseDateValue(value, filterOp)
    }
  }

  // Handle number-specific operations
  if (isOperationOnlyFor(filterOp, 'number')) {
    const numValue = validateAndParseNumber(value)

    return {
      filterType: 'number',
      type: filterOp,
      filter: numValue
    }
  }

  // Shared operations (eq, notEqual, blank, notBlank): the URL has no type,
  // so it comes from the column (#224)
  if (isSharedOperation(filterOp)) {
    return parseSharedOperation(filterOp, value, typeOf())
  }

  // Handle text-specific operations (existing logic)
  return {
    filterType: 'text',
    type: filterOp,
    filter: value || ''
  }
}

/**
 * Parses the value of an operation that every filter type has, as the type
 * of its column. With no type, the value stays text. A value that the type
 * cannot read throws, as for an operation that has one type.
 */
function parseSharedOperation(
  operation: SharedOperationId,
  value: string,
  columnType: FilterType | undefined
): ColumnFilter {
  const blank = operation === 'blank' || operation === 'notBlank'

  if (columnType === 'number') {
    // A blank filter has no value. A number filter needs a number, so it
    // gets 0, which nothing reads (#260).
    return {
      filterType: 'number',
      type: operation,
      filter: blank ? 0 : validateAndParseNumber(value)
    }
  }

  if (columnType === 'date') {
    return {
      filterType: 'date',
      type: operation,
      filter: blank ? '' : parseDateValue(value, operation)
    }
  }

  return { filterType: 'text', type: operation, filter: blank ? '' : value }
}

/** A date value for a date operation. Throws INVALID_DATE. */
function parseDateValue(value: string, operation: DateFilterOperation): string {
  try {
    const dateValue = validateAndParseDate(value)
    const validation = validateDateFilter(dateValue, operation)

    if (!validation.valid) {
      throw new InvalidFilterError(validation.error || 'Invalid date filter')
    }

    return dateValue
  } catch (error) {
    throw new InvalidFilterError(
      error instanceof Error ? error.message : 'Invalid date filter',
      undefined,
      { code: 'INVALID_DATE' }
    )
  }
}

/**
 * Parses prefixed filter parameters into a filter state object.
 * Parameters without the configured prefix are skipped. A parameter that fails
 * to parse is reported through `config.onParseError` and skipped.
 */
export function parseIndividualParams(
  searchParams: URLSearchParams,
  config: ResolvedOptions
): FilterState {
  // A Map, not a plain object: an assignment to `obj['__proto__']` would call
  // the prototype setter, and the column would be lost (#253)
  const filters = new Map<string, ColumnFilter>()
  const prefix = resolveParamPrefix(config.paramPrefix)

  for (const [param, value] of searchParams.entries()) {
    if (!param.startsWith(prefix)) continue

    // Known once the param name is split, so the issue can name the column
    let columnName: string | undefined

    try {
      // Extract column name and parse the filter parameter
      const parts = extractColumnAndOperation(param, prefix)
      columnName = parts.column
      const { operation } = parts

      const filterParam = parseFilterOperation(operation, value, () =>
        config.columnTypes?.(parts.column)
      )

      // Apply validation based on filter type
      if (filterParam.filterType === 'text') {
        const validatedValue = validateFilterValue(
          value,
          config,
          filterParam.type
        )

        filters.set(parts.column, { ...filterParam, filter: validatedValue })
      } else {
        // Number and date filters are already validated in parseFilterOperation
        filters.set(parts.column, filterParam)
      }
    } catch (error) {
      // Report the issue and skip this param
      reportIssue(config, toIssue(error, 'INVALID_PARAM', columnName))
      // Continue processing other parameters instead of failing completely
      continue
    }
  }

  // Object.fromEntries creates own keys, so `__proto__` stays a column
  return Object.fromEntries(filters)
}
