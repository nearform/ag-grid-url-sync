/**
 * @fileoverview Core Utility Functions for AG Grid URL Synchronization
 *
 * This module contains the core utility functions for parsing, generating, and managing
 * URL filter parameters. It handles filter serialization/deserialization, URL construction,
 * validation, and type conversion between AG Grid filters and URL parameters.
 *
 * Key responsibilities:
 * - Configuration management and merging
 * - URL parameter parsing and generation
 * - Filter state serialization/deserialization
 * - Type-specific filter handling (text, number, date, set)
 * - Validation and error handling
 * - AG Grid integration utilities
 *
 */

import type {
  FilterState,
  ColumnFilter,
  InternalConfig,
  AGGridUrlSyncConfig,
  ParseContext,
  FilterInfo,
  NumberFilter,
  DateFilter,
  SetFilter,
  TextFilter
} from './types.js'
import {
  InvalidFilterError,
  InvalidURLError,
  URLSyncError,
  OPERATION_MAP,
  REVERSE_OPERATION_MAP
} from './types.js'
import {
  createTypeDetectionEngine,
  TypeDetectionEngine
} from './type-detection.js'
import { compressFilterData, decompressFilterData } from './compression.js'

/**
 * Merges user configuration with defaults to create internal configuration.
 *
 * Takes user-provided configuration and merges it with sensible defaults
 * to create a complete internal configuration object. Handles both simple
 * and complex configuration properties including compression settings.
 *
 * @param gridApi - The AG Grid API instance
 * @param userConfig - User-provided configuration options
 * @returns Complete internal configuration object
 */
export function mergeConfig(
  gridApi: any,
  userConfig: AGGridUrlSyncConfig = {}
): InternalConfig {
  // Create clean configuration properties with proper defaults
  const prefix = userConfig.prefix ?? 'f_'
  const valueLength = userConfig.limits?.valueLength ?? 200

  // Handle compression configuration - supports both simple string and detailed object formats
  let compression = userConfig.compression ?? 'auto'
  let compressionConfig

  if (typeof compression === 'string') {
    // Convert string strategy to full config
    compressionConfig = {
      strategy: compression,
      threshold: 2000,
      algorithms: ['lz', 'gzip', 'base64'] as ('gzip' | 'lz' | 'base64')[],
      level: 6
    }
  } else {
    // Merge with defaults
    compressionConfig = {
      strategy: compression.strategy ?? 'auto',
      threshold: compression.threshold ?? 2000,
      algorithms: compression.algorithms ?? ['lz', 'gzip', 'base64'],
      level: compression.level ?? 6
    }
  }

  return {
    gridApi,
    prefix,
    limits: {
      valueLength,
      urlLength: userConfig.limits?.urlLength ?? 2000,
      setValues: userConfig.limits?.setValues ?? 50
    },
    onError: {
      parsing: userConfig.onError?.parsing ?? (() => {}),
      typeDetection: userConfig.onError?.typeDetection ?? (() => {}),
      urlLength: userConfig.onError?.urlLength ?? (() => {}),
      validation: userConfig.onError?.validation ?? (() => {}),
      compression: userConfig.onError?.compression ?? (() => {})
    },
    typeDetection: userConfig.typeDetection ?? 'smart',
    compression: compressionConfig,
    columnTypes: userConfig.columnTypes ?? {},
    typeHints: {
      dateColumns: userConfig.typeHints?.dateColumns ?? [],
      numberColumns: userConfig.typeHints?.numberColumns ?? [],
      setColumns: userConfig.typeHints?.setColumns ?? []
    },
    debug: userConfig.debug ?? false,
    validateOnApply: userConfig.validateOnApply ?? true,
    performanceMonitoring: userConfig.performanceMonitoring ?? false
  }
}

/**
 * Validates a filter value against configuration constraints.
 *
 * Ensures that filter values don't exceed the maximum allowed length and
 * triggers error handlers if validation fails. This is a critical security
 * and performance function that prevents overly long filter values.
 *
 * @param value - The filter value to validate
 * @param config - Internal configuration containing limits and error handlers
 * @param context - Optional context information for error reporting
 * @returns The validated value (unchanged if valid)
 * @throws {InvalidFilterError} When value exceeds maximum length
 *
 * @example
 * ```typescript
 * const validValue = validateFilterValue('john', config);
 * // Returns 'john' if within limits
 *
 * const invalidValue = validateFilterValue('very_long_string...', config);
 * // Throws InvalidFilterError if too long
 * ```
 */
export function validateFilterValue(
  value: string,
  config: InternalConfig,
  context?: FilterInfo
): string {
  if (value.length > config.limits.valueLength) {
    const error = new InvalidFilterError(
      `Filter value exceeds maximum length of ${config.limits.valueLength} characters`,
      { value, context }
    )
    if (context) {
      config.onError.validation(error, context)
    }
    throw error
  }
  return value
}

/**
 * Extracts column name and operation from a filter parameter.
 *
 * Parses URL parameter names to extract the column name and filter operation.
 * Handles prefix normalization and validates parameter format. This is a core
 * parsing function used throughout the URL parameter processing pipeline.
 *
 * @param param - The URL parameter name (e.g., 'f_name_contains')
 * @param prefix - The configured parameter prefix (e.g., 'f_')
 * @returns Object containing the extracted column name and operation
 * @throws {InvalidFilterError} When parameter format is invalid or prefix doesn't match
 *
 * @example
 * ```typescript
 * const result = extractColumnAndOperation('f_name_contains', 'f_');
 * // Returns: { column: 'name', operation: 'contains' }
 *
 * const result2 = extractColumnAndOperation('filter_age_gt', 'filter_');
 * // Returns: { column: 'age', operation: 'gt' }
 * ```
 */
function extractColumnAndOperation(
  param: string,
  prefix: string
): { column: string; operation: string } {
  const ensureTrailingUnderscore = (p: string): string =>
    p.endsWith('_') ? p : p + '_'

  const sanitizedPrefix = ensureTrailingUnderscore(prefix)
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
 * Parses a number value with comprehensive validation and format support.
 *
 * Converts string values to numbers while handling edge cases like scientific
 * notation, infinity, and NaN. Provides detailed error messages for debugging
 * and ensures only valid finite numbers are accepted.
 *
 * @param value - The string value to parse as a number
 * @param columnId - Column identifier for error reporting
 * @returns The parsed number value
 * @throws {InvalidFilterError} When value is empty, non-numeric, or infinite
 *
 * @example
 * ```typescript
 * const num1 = parseNumberValue('123.45', 'price');  // Returns: 123.45
 * const num2 = parseNumberValue('1.23e4', 'quantity'); // Returns: 12300
 * const invalid = parseNumberValue('abc', 'age'); // Throws InvalidFilterError
 * ```
 */
function parseNumberValue(value: string, columnId: string): number {
  if (!value || value.trim() === '') {
    throw new InvalidFilterError(`Empty number value for column '${columnId}'`)
  }

  const trimmed = value.trim()
  const parsed = parseFloat(trimmed)

  if (isNaN(parsed) || !isFinite(parsed)) {
    throw new InvalidFilterError(
      `Invalid number value '${value}' for column '${columnId}': must be numeric`
    )
  }

  return parsed
}

/**
 * Parses and validates a date value in ISO format (YYYY-MM-DD).
 *
 * Strictly validates date strings to ensure they conform to ISO 8601 date format
 * and represent valid calendar dates. This prevents invalid dates like '2024-02-30'
 * from being accepted and ensures consistent date handling across the system.
 *
 * @param value - The string value to parse as a date
 * @param columnId - Column identifier for error reporting
 * @returns The validated date string in YYYY-MM-DD format
 * @throws {InvalidFilterError} When value is empty, wrong format, or invalid date
 *
 * @example
 * ```typescript
 * const date1 = parseDateValue('2024-03-15', 'created_at'); // Returns: '2024-03-15'
 * const date2 = parseDateValue('2024-02-29', 'updated_at'); // Returns: '2024-02-29' (valid leap year)
 * const invalid = parseDateValue('2024-13-01', 'date'); // Throws InvalidFilterError
 * const invalid2 = parseDateValue('2024/03/15', 'date'); // Throws InvalidFilterError (wrong format)
 * ```
 */
function parseDateValue(value: string, columnId: string): string {
  if (!value || value.trim() === '') {
    throw new InvalidFilterError(`Empty date value for column '${columnId}'`)
  }

  const trimmed = value.trim()

  // Validate ISO date format using regex pattern for YYYY-MM-DD
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!isoDateRegex.test(trimmed)) {
    throw new InvalidFilterError(
      `Invalid date format '${value}' for column '${columnId}': expected YYYY-MM-DD`
    )
  }

  // Validate actual date - ensures it's a real calendar date (prevents 2024-02-30, etc.)
  const date = new Date(trimmed)
  if (isNaN(date.getTime()) || date.toISOString().split('T')[0] !== trimmed) {
    throw new InvalidFilterError(
      `Invalid date '${value}' for column '${columnId}': not a valid date`
    )
  }

  return trimmed
}

/**
 * Parses and validates range values for number or date range filters.
 *
 * Handles comma-separated range values like '100,500' for numbers or '2024-01-01,2024-12-31'
 * for dates. Validates that the range is logical (start <= end) and that both values
 * are valid according to their respective type validation rules.
 *
 * @param value - The comma-separated range string (e.g., '100,500' or '2024-01-01,2024-12-31')
 * @param type - The type of range to parse ('number' or 'date')
 * @param columnId - Column identifier for error reporting
 * @returns Tuple containing the parsed start and end values
 * @throws {InvalidFilterError} When range format is invalid, values are invalid, or start > end
 *
 * @example
 * ```typescript
 * const numRange = parseRangeValue('100,500', 'number', 'price');
 * // Returns: [100, 500]
 *
 * const dateRange = parseRangeValue('2024-01-01,2024-12-31', 'date', 'created_at');
 * // Returns: ['2024-01-01', '2024-12-31']
 *
 * const invalid = parseRangeValue('500,100', 'number', 'price');
 * // Throws InvalidFilterError (start > end)
 * ```
 */
function parseRangeValue(
  value: string,
  type: 'number' | 'date',
  columnId: string
): [number, number] | [string, string] {
  if (!value || value.trim() === '') {
    throw new InvalidFilterError(`Empty range value for column '${columnId}'`)
  }

  const parts = value.split(',')
  if (parts.length !== 2) {
    throw new InvalidFilterError(
      `Invalid range format '${value}' for column '${columnId}': expected 'value1,value2'`
    )
  }

  const [start, end] = parts
    .map(p => p?.trim())
    .filter(p => p !== undefined) as [string, string]

  if (start === undefined || end === undefined) {
    throw new InvalidFilterError(
      `Invalid range values for column '${columnId}': both start and end must be provided`
    )
  }

  if (type === 'number') {
    const startNum = parseNumberValue(start, columnId)
    const endNum = parseNumberValue(end, columnId)

    if (startNum > endNum) {
      throw new InvalidFilterError(
        `Invalid number range for column '${columnId}': start value ${startNum} > end value ${endNum}`
      )
    }

    return [startNum, endNum]
  } else {
    const startDate = parseDateValue(start, columnId)
    const endDate = parseDateValue(end, columnId)

    if (new Date(startDate) > new Date(endDate)) {
      throw new InvalidFilterError(
        `Invalid date range for column '${columnId}': start date ${startDate} after end date ${endDate}`
      )
    }

    return [startDate, endDate]
  }
}

/**
 * Parses and validates set filter values from comma-separated list.
 *
 * Processes comma-separated values for set filters, handling URL encoding/decoding,
 * duplicate removal, and enforcing configured limits. Provides warnings when
 * approaching performance limits for large value sets.
 *
 * @param value - Comma-separated list of values (URL-encoded)
 * @param columnId - Column identifier for error reporting
 * @param config - Internal configuration containing limits and error handlers
 * @returns Array of unique decoded values
 * @throws {InvalidFilterError} When value count exceeds configured limits
 *
 * @example
 * ```typescript
 * const values1 = parseSetValues('A,B,C', 'category', config);
 * // Returns: ['A', 'B', 'C']
 *
 * const values2 = parseSetValues('Red%2C%20Blue,Green', 'color', config);
 * // Returns: ['Red, Blue', 'Green'] (URL-decoded)
 *
 * const values3 = parseSetValues('A,B,A,C', 'type', config);
 * // Returns: ['A', 'B', 'C'] (duplicates removed)
 * ```
 */
function parseSetValues(
  value: string,
  columnId: string,
  config: InternalConfig
): string[] {
  if (!value || value.trim() === '') {
    return []
  }

  // Split by comma and decode URL-encoded commas (%2C) to handle values containing commas
  const values = value
    .split(',')
    .map(v => decodeURIComponent(v.trim()))
    .filter(v => v !== '')

  // Remove duplicates
  const uniqueValues = [...new Set(values)]

  if (uniqueValues.length > config.limits.setValues) {
    const error = new InvalidFilterError(
      `Set filter for column '${columnId}' has ${uniqueValues.length} values, exceeding limit of ${config.limits.setValues}`
    )
    const context: FilterInfo = {
      column: columnId,
      type: 'set',
      operation: 'in',
      value: uniqueValues
    }
    config.onError.validation(error, context)

    if (config.debug) {
      console.warn(
        `Set filter for '${columnId}' has ${uniqueValues.length}+ values, consider pagination or server-side filtering`
      )
    }
  }

  return uniqueValues
}

/**
 * Parses number filter configuration from URL parameter.
 *
 * Converts URL parameter values into NumberFilter objects, handling all supported
 * number operations including range filters. Maps URL operation codes to internal
 * filter types and validates numeric values.
 *
 * @param columnName - The column name for the filter
 * @param operation - The filter operation code from URL (e.g., 'gt', 'inRange')
 * @param value - The filter value(s) from URL parameter
 * @param config - Internal configuration for validation and error handling
 * @returns Configured NumberFilter object
 * @throws {InvalidFilterError} When operation is unsupported or values are invalid
 *
 * @example
 * ```typescript
 * const filter1 = parseNumberFilter('price', 'gt', '100', config);
 * // Returns: { filterType: 'number', type: 'greaterThan', filter: 100 }
 *
 * const filter2 = parseNumberFilter('price', 'inRange', '100,500', config);
 * // Returns: { filterType: 'number', type: 'inRange', filter: 100, filterTo: 500 }
 * ```
 */
function parseNumberFilter(
  columnName: string,
  operation: string,
  value: string,
  _config: InternalConfig
): NumberFilter {
  const mappedOp = OPERATION_MAP[operation as keyof typeof OPERATION_MAP]

  if (
    !mappedOp ||
    !['equals', 'notEquals', 'greaterThan', 'lessThan', 'inRange'].includes(
      mappedOp
    )
  ) {
    throw new InvalidFilterError(
      `Unsupported number filter operation: ${operation}`
    )
  }

  const filter: NumberFilter = {
    filterType: 'number',
    type: mappedOp as any
  }

  if (mappedOp === 'inRange') {
    const [start, end] = parseRangeValue(value, 'number', columnName) as [
      number,
      number
    ]
    filter.filter = start
    filter.filterTo = end
  } else {
    filter.filter = parseNumberValue(value, columnName)
  }

  return filter
}

/**
 * Parses date filter configuration from URL parameter.
 *
 * Converts URL parameter values into DateFilter objects, handling all supported
 * date operations including range filters. Maps URL operation codes to internal
 * filter types and validates ISO date formats.
 *
 * @param columnName - The column name for the filter
 * @param operation - The filter operation code from URL (e.g., 'after', 'inRange')
 * @param value - The filter value(s) from URL parameter
 * @param config - Internal configuration for validation and error handling
 * @returns Configured DateFilter object
 * @throws {InvalidFilterError} When operation is unsupported or date values are invalid
 *
 * @example
 * ```typescript
 * const filter1 = parseDateFilter('created_at', 'after', '2024-01-01', config);
 * // Returns: { filterType: 'date', type: 'after', dateFrom: '2024-01-01' }
 *
 * const filter2 = parseDateFilter('created_at', 'inRange', '2024-01-01,2024-12-31', config);
 * // Returns: { filterType: 'date', type: 'inRange', dateFrom: '2024-01-01', dateTo: '2024-12-31' }
 * ```
 */
function parseDateFilter(
  columnName: string,
  operation: string,
  value: string,
  _config: InternalConfig
): DateFilter {
  const mappedOp = OPERATION_MAP[operation as keyof typeof OPERATION_MAP]

  if (
    !mappedOp ||
    !['equals', 'notEquals', 'before', 'after', 'inRange'].includes(mappedOp)
  ) {
    throw new InvalidFilterError(
      `Unsupported date filter operation: ${operation}`
    )
  }

  const filter: DateFilter = {
    filterType: 'date',
    type: mappedOp as any
  }

  if (mappedOp === 'inRange') {
    const [start, end] = parseRangeValue(value, 'date', columnName) as [
      string,
      string
    ]
    filter.dateFrom = start
    filter.dateTo = end
  } else {
    const dateValue = parseDateValue(value, columnName)
    filter.dateFrom = dateValue
  }

  return filter
}

/**
 * Parses set filter configuration from URL parameter.
 *
 * Converts URL parameter values into SetFilter objects for multi-value selection
 * filters. Currently only supports 'in' operation but designed for future extension.
 * Handles URL decoding and value validation.
 *
 * @param columnName - The column name for the filter
 * @param operation - The filter operation code from URL (currently only 'in')
 * @param value - The comma-separated filter values from URL parameter
 * @param config - Internal configuration for validation and error handling
 * @returns Configured SetFilter object
 * @throws {InvalidFilterError} When operation is unsupported
 *
 * @example
 * ```typescript
 * const filter = parseSetFilter('category', 'in', 'Electronics,Books,Clothing', config);
 * // Returns: { filterType: 'set', type: 'in', values: ['Electronics', 'Books', 'Clothing'] }
 * ```
 */
function parseSetFilter(
  columnName: string,
  operation: string,
  value: string,
  _config: InternalConfig
): SetFilter {
  if (operation !== 'in') {
    throw new InvalidFilterError(
      `Unsupported set filter operation: ${operation}`
    )
  }

  return {
    filterType: 'set',
    type: 'in',
    values: parseSetValues(value, columnName, _config)
  }
}

/**
 * Parses text filter configuration from URL parameter.
 *
 * Converts URL parameter values into TextFilter objects for string-based filtering.
 * Supports 'contains' and 'equals' operations with proper value validation and
 * length constraints. Provides backward compatibility for legacy text filters.
 *
 * @param columnName - The column name for the filter
 * @param operation - The filter operation code from URL ('contains' or 'equals')
 * @param value - The filter value from URL parameter
 * @param config - Internal configuration for validation and error handling
 * @returns Configured TextFilter object
 * @throws {InvalidFilterError} When operation is unsupported or value is invalid
 *
 * @example
 * ```typescript
 * const filter1 = parseTextFilter('name', 'contains', 'john', config);
 * // Returns: { filterType: 'text', type: 'contains', filter: 'john' }
 *
 * const filter2 = parseTextFilter('status', 'equals', 'active', config);
 * // Returns: { filterType: 'text', type: 'equals', filter: 'active' }
 * ```
 */
function parseTextFilter(
  columnName: string,
  operation: string,
  value: string,
  config: InternalConfig
): TextFilter {
  const mappedOp = OPERATION_MAP[operation as keyof typeof OPERATION_MAP]

  if (!mappedOp || !['contains', 'equals'].includes(mappedOp)) {
    throw new InvalidFilterError(
      `Unsupported text filter operation: ${operation}`
    )
  }

  const context: FilterInfo = {
    column: columnName,
    type: 'text',
    operation: mappedOp as any,
    value
  }

  return {
    filterType: 'text',
    type: mappedOp as any,
    filter: validateFilterValue(value, config, context)
  }
}

/**
 * Parses filter parameters with intelligent type detection.
 *
 * Main entry point for filter parameter parsing that combines parameter extraction,
 * type detection, and type-specific parsing. Uses the type detection engine to
 * determine the appropriate filter type and delegates to specialized parsers.
 *
 * @param param - The complete URL parameter name (e.g., 'f_name_contains')
 * @param value - The URL parameter value
 * @param typeEngine - Type detection engine for determining column filter types
 * @param config - Internal configuration for validation and error handling
 * @returns Parsed ColumnFilter object of the appropriate type
 * @throws {InvalidFilterError} When parameter format or values are invalid
 *
 * @example
 * ```typescript
 * const filter = parseFilterParam('f_price_gt', '100', typeEngine, config);
 * // Returns NumberFilter: { filterType: 'number', type: 'greaterThan', filter: 100 }
 *
 * const filter2 = parseFilterParam('f_name_contains', 'john', typeEngine, config);
 * // Returns TextFilter: { filterType: 'text', type: 'contains', filter: 'john' }
 * ```
 */
export function parseFilterParam(
  param: string,
  value: string,
  typeEngine: TypeDetectionEngine,
  config: InternalConfig
): ColumnFilter {
  const { column: columnName, operation } = extractColumnAndOperation(
    param,
    config.prefix
  )

  // Detect the filter type for this column
  const typeResult = typeEngine.detectColumnType(columnName)
  const filterType = typeResult.type

  const context: ParseContext = {
    url: '',
    parameter: param,
    value,
    columnName,
    operation
  }

  try {
    switch (filterType) {
      case 'number':
        return parseNumberFilter(columnName, operation, value, config)
      case 'date':
        return parseDateFilter(columnName, operation, value, config)
      case 'set':
        return parseSetFilter(columnName, operation, value, config)
      case 'text':
      default:
        return parseTextFilter(columnName, operation, value, config)
    }
  } catch (error) {
    config.onError.parsing(error as Error, context)
    throw error
  }
}

/**
 * Converts URL search parameters into a complete filter state object.
 *
 * Main URL parsing function that handles both compressed and uncompressed URLs.
 * Automatically detects compression, performs decompression if needed, and parses
 * all filter parameters into a structured FilterState object. Includes comprehensive
 * error handling and performance monitoring.
 *
 * @param url - The complete URL to parse for filter parameters
 * @param config - Internal configuration containing parsing rules and error handlers
 * @returns Promise resolving to FilterState object with all parsed filters
 * @throws {InvalidURLError} When URL is malformed or parsing fails critically
 *
 * @example
 * ```typescript
 * const filters = await parseUrlFilters(
 *   'https://example.com/grid?f_name_contains=john&f_age_gt=25',
 *   config
 * );
 * // Returns: {
 * //   name: { filterType: 'text', type: 'contains', filter: 'john' },
 * //   age: { filterType: 'number', type: 'greaterThan', filter: 25 }
 * // }
 * ```
 */
export async function parseUrlFilters(
  url: string,
  config: InternalConfig
): Promise<FilterState> {
  const startTime = config.performanceMonitoring ? performance.now() : 0

  try {
    const urlObj = new URL(url)
    const filterState: FilterState = {}

    // Create type detection engine
    const typeEngine = createTypeDetectionEngine(config.gridApi, config)

    // Check for compressed data first - URLs may contain compressed filter parameters for length optimization
    const compressedData = urlObj.searchParams.get(`${config.prefix}compressed`)
    const compressionMethod = urlObj.searchParams.get(`${config.prefix}method`)

    if (compressedData && compressionMethod) {
      try {
        // Import decompression utilities
        // Decompress the filter data
        const decompressedParams = await decompressFilterData(
          compressedData,
          compressionMethod,
          config
        )

        // Parse the decompressed parameters
        const decompressedUrl = new URL(
          `${urlObj.origin}${urlObj.pathname}?${decompressedParams}`
        )

        // Parse decompressed filters
        for (const [param, value] of decompressedUrl.searchParams.entries()) {
          if (!param.startsWith(config.prefix)) continue

          try {
            // Extract column name and parse the filter parameter
            const { column: columnName } = extractColumnAndOperation(
              param,
              config.prefix
            )
            const filterParam = parseFilterParam(
              param,
              value,
              typeEngine,
              config
            )

            filterState[columnName] = filterParam
          } catch (err) {
            if (config.debug) {
              console.warn(
                `Failed to parse decompressed filter parameter '${param}':`,
                err
              )
            }
            continue
          }
        }

        if (config.debug) {
          console.log(
            `Decompressed ${Object.keys(filterState).length} filters using method: ${compressionMethod}`
          )
        }

        if (config.performanceMonitoring) {
          const duration = performance.now() - startTime
          if (config.debug) {
            console.log(
              `URL parsing (with decompression) completed in ${duration.toFixed(2)}ms`
            )
          }
        }

        return filterState
      } catch (error) {
        if (config.debug) {
          console.warn(
            'Failed to decompress URL data, falling back to standard parsing:',
            error
          )
        }
        // Fall through to standard parsing
      }
    }

    // Standard parsing (uncompressed or fallback)
    for (const [param, value] of urlObj.searchParams.entries()) {
      if (!param.startsWith(config.prefix)) continue
      if (param.endsWith('compressed') || param.endsWith('method')) continue // Skip compression metadata

      try {
        // Extract column name and parse the filter parameter
        const { column: columnName } = extractColumnAndOperation(
          param,
          config.prefix
        )
        const filterParam = parseFilterParam(param, value, typeEngine, config)

        filterState[columnName] = filterParam
      } catch (err) {
        if (config.debug) {
          console.warn(`Failed to parse filter parameter '${param}':`, err)
        }
        // Skip invalid filters but continue processing
        continue
      }
    }

    if (config.performanceMonitoring) {
      const duration = performance.now() - startTime
      if (config.debug) {
        console.log(`URL parsing completed in ${duration.toFixed(2)}ms`)
      }
    }

    return filterState
  } catch (err) {
    throw new InvalidURLError(`Failed to parse URL: ${(err as Error).message}`)
  }
}

/**
 * Serializes a filter value for URL parameter encoding.
 *
 * Converts internal filter objects back to URL parameter format, handling
 * type-specific serialization rules and operation mapping. This is the inverse
 * operation of the parsing functions.
 *
 * @param filter - The ColumnFilter object to serialize
 * @returns Object containing the operation code and serialized value
 * @throws {InvalidFilterError} When filter type is unsupported
 *
 * @example
 * ```typescript
 * const result1 = serializeFilterValue({
 *   filterType: 'number', type: 'greaterThan', filter: 100
 * });
 * // Returns: { operation: 'gt', value: '100' }
 *
 * const result2 = serializeFilterValue({
 *   filterType: 'set', type: 'in', values: ['A', 'B', 'C']
 * });
 * // Returns: { operation: 'in', value: 'A,B,C' }
 * ```
 */
function serializeFilterValue(filter: ColumnFilter): {
  operation: string
  value: string
} {
  switch (filter.filterType) {
    case 'text': {
      const operation = REVERSE_OPERATION_MAP[filter.type] || filter.type
      return { operation, value: filter.filter }
    }

    case 'number': {
      const operation = REVERSE_OPERATION_MAP[filter.type] || filter.type
      if (filter.type === 'inRange' && filter.filterTo !== undefined) {
        return { operation, value: `${filter.filter},${filter.filterTo}` }
      }
      return { operation, value: String(filter.filter) }
    }

    case 'date': {
      const operation = REVERSE_OPERATION_MAP[filter.type] || filter.type
      if (filter.type === 'inRange' && filter.dateTo) {
        return { operation, value: `${filter.dateFrom},${filter.dateTo}` }
      }
      return { operation, value: filter.dateFrom || '' }
    }

    case 'set': {
      const operation = 'in'
      const values = filter.values.map(v => encodeURIComponent(v)).join(',')
      return { operation, value: values }
    }

    default:
      throw new InvalidFilterError(
        `Unsupported filter type: ${(filter as any).filterType}`
      )
  }
}

/**
 * Converts a complete filter state object into URL search parameters.
 *
 * Serializes all filters in a FilterState object to URL parameters using the
 * configured prefix and proper encoding. Handles errors gracefully by skipping
 * invalid filters while continuing to process valid ones.
 *
 * @param filterState - Complete filter state object to serialize
 * @param config - Internal configuration containing prefix and error handling
 * @returns URLSearchParams object with all serialized filter parameters
 *
 * @example
 * ```typescript
 * const params = serializeFilters({
 *   name: { filterType: 'text', type: 'contains', filter: 'john' },
 *   age: { filterType: 'number', type: 'greaterThan', filter: 25 }
 * }, config);
 * // Returns URLSearchParams with: f_name_contains=john&f_age_gt=25
 * ```
 */
export function serializeFilters(
  filterState: FilterState,
  config: InternalConfig
): URLSearchParams {
  const params = new URLSearchParams()

  for (const [column, filter] of Object.entries(filterState)) {
    try {
      const { operation, value } = serializeFilterValue(filter)
      const paramName = `${config.prefix}${column}_${operation}`

      // URLSearchParams already handles encoding, so don't double-encode
      params.append(paramName, value)
    } catch (error) {
      if (config.debug) {
        console.warn(
          `Failed to serialize filter for column '${column}':`,
          error
        )
      }
      // Skip invalid filters but continue processing
      continue
    }
  }

  return params
}

/**
 * Generates a complete URL with filter state and optional compression.
 *
 * Main URL generation function that combines filter serialization, compression
 * (when beneficial), and URL construction. Preserves existing non-filter parameters
 * and provides comprehensive length monitoring and warnings.
 *
 * @param baseUrl - The base URL to append filter parameters to
 * @param filterState - Complete filter state object to serialize
 * @param config - Internal configuration containing compression and limits
 * @param options - Optional generation settings
 * @param options.compress - Force compression on/off (overrides auto-detection)
 * @returns Promise resolving to the complete URL with filter parameters
 *
 * @example
 * ```typescript
 * const url = await generateUrl(
 *   'https://example.com/grid',
 *   { name: { filterType: 'text', type: 'contains', filter: 'john' } },
 *   config
 * );
 * // Returns: 'https://example.com/grid?f_name_contains=john'
 * ```
 */
export async function generateUrl(
  baseUrl: string,
  filterState: FilterState,
  config: InternalConfig,
  options: { compress?: boolean } = {}
): Promise<string> {
  const url = new URL(baseUrl)

  // Serialize filters to parameters
  const filterParams = serializeFilters(filterState, config)

  // Preserve existing non-filter parameters
  for (const [key, value] of url.searchParams.entries()) {
    if (!key.startsWith(config.prefix)) {
      filterParams.append(key, value)
    }
  }

  // Convert to string for length check
  let paramsString = filterParams.toString()
  const originalLength = baseUrl.length + paramsString.length + 1 // +1 for '?'

  // Apply compression if URL length exceeds threshold or compression is forced
  if (
    options.compress !== false &&
    (config.compression.strategy === 'always' ||
      (config.compression.strategy === 'auto' &&
        originalLength > config.compression.threshold))
  ) {
    try {
      // Use compression utilities
      const compressionResult = await compressFilterData(paramsString, config)

      if (
        compressionResult.method !== 'none' &&
        (config.compression.strategy === 'always' ||
          (config.compression.strategy === 'auto' &&
            originalLength > config.compression.threshold) ||
          compressionResult.ratio < 0.9)
      ) {
        // Use compressed format
        const compressedParams = new URLSearchParams()

        // Preserve non-filter params
        for (const [key, value] of url.searchParams.entries()) {
          if (!key.startsWith(config.prefix)) {
            compressedParams.append(key, value)
          }
        }

        // Add compressed filter data
        compressedParams.set(
          `${config.prefix}compressed`,
          compressionResult.data
        )
        compressedParams.set(`${config.prefix}method`, compressionResult.method)

        paramsString = compressedParams.toString()

        if (config.debug) {
          console.log(
            `URL compressed from ${originalLength} to ${paramsString.length + baseUrl.length + 1} chars (${(compressionResult.ratio * 100).toFixed(1)}% ratio)`
          )
        }
      }
    } catch (error) {
      // Compression failed, continue with uncompressed
      if (config.debug) {
        console.warn(
          'URL compression failed, using uncompressed version:',
          error
        )
      }
    }
  }

  url.search = paramsString

  // Check final URL length and provide warnings/stats
  const finalLength = url.toString().length
  if (finalLength > config.limits.urlLength) {
    const info = {
      originalLength,
      compressedLength: finalLength,
      filterCount: Object.keys(filterState).length,
      threshold: config.limits.urlLength,
      compressionRatio: originalLength > 0 ? finalLength / originalLength : 1.0,
      compressionMethod: finalLength < originalLength ? 'auto' : 'none'
    }
    config.onError.urlLength(info)
  }

  return url.toString()
}

/**
 * Extracts the current filter model from AG Grid and converts to internal format.
 *
 * Retrieves the current filter state from AG Grid's API and converts it to the
 * internal FilterState format using type detection. Handles AG Grid's native
 * filter format and converts it to our standardized filter objects.
 *
 * @param config - Internal configuration containing grid API and type detection settings
 * @returns FilterState object representing current grid filters
 * @throws {URLSyncError} When grid API access fails
 *
 * @example
 * ```typescript
 * const currentFilters = getFilterModel(config);
 * // Returns: {
 * //   name: { filterType: 'text', type: 'contains', filter: 'john' },
 * //   age: { filterType: 'number', type: 'greaterThan', filter: 25 }
 * // }
 * ```
 */
export function getFilterModel(config: InternalConfig): FilterState {
  try {
    const model = config.gridApi.getFilterModel()

    const filterState: FilterState = {}

    if (!model || typeof model !== 'object') {
      return filterState
    }

    // Create type detection engine for converting AG Grid filters
    const typeEngine = createTypeDetectionEngine(config.gridApi, config)

    for (const [column, filter] of Object.entries(model)) {
      if (!filter || typeof filter !== 'object') continue

      try {
        const convertedFilter = convertAGGridFilter(column, filter, typeEngine)

        if (convertedFilter) {
          filterState[column] = convertedFilter
        }
      } catch (error) {
        if (config.debug) {
          console.warn(
            `Failed to convert AG Grid filter for column '${column}':`,
            error
          )
        }
        // Skip invalid filters but continue processing
        continue
      }
    }

    return filterState
  } catch (err) {
    throw new URLSyncError(
      `Failed to get filter model: ${(err as Error).message}`
    )
  }
}

/**
 * Converts AG Grid's native filter format to internal ColumnFilter format.
 *
 * Handles the conversion from AG Grid's filter objects to our standardized
 * internal format, using type detection to determine the appropriate conversion
 * strategy. This enables seamless integration with AG Grid's existing filters.
 *
 * @param column - Column identifier for the filter
 * @param agFilter - AG Grid's native filter object
 * @param typeEngine - Type detection engine for determining conversion strategy
 * @returns Converted ColumnFilter object or null if conversion fails
 *
 * @example
 * ```typescript
 * const agFilter = { type: 'greaterThan', filter: 100 };
 * const converted = convertAGGridFilter('price', agFilter, typeEngine);
 * // Returns: { filterType: 'number', type: 'greaterThan', filter: 100 }
 * ```
 */
function convertAGGridFilter(
  column: string,
  agFilter: any,
  typeEngine: TypeDetectionEngine
): ColumnFilter | null {
  const typeResult = typeEngine.detectColumnType(column)

  switch (typeResult.type) {
    case 'text':
      return convertTextFilter(agFilter)
    case 'number':
      return convertNumberFilter(agFilter)
    case 'date':
      return convertDateFilter(agFilter)
    case 'set':
      return convertSetFilter(agFilter)
    default:
      return convertTextFilter(agFilter) // Fallback to text
  }
}

/**
 * Convert AG Grid text filter to internal format
 */
function convertTextFilter(agFilter: any): TextFilter | null {
  if (agFilter.type === 'contains' && agFilter.filter) {
    return {
      filterType: 'text',
      type: 'contains',
      filter: String(agFilter.filter)
    }
  }

  if (agFilter.type === 'equals' && agFilter.filter) {
    return {
      filterType: 'text',
      type: 'equals',
      filter: String(agFilter.filter)
    }
  }

  return null
}

/**
 * Convert AG Grid number filter to internal format
 */
function convertNumberFilter(agFilter: any): NumberFilter | null {
  if (agFilter.type === 'equals' && agFilter.filter !== undefined) {
    return {
      filterType: 'number',
      type: 'equals',
      filter: Number(agFilter.filter)
    }
  }

  if (agFilter.type === 'greaterThan' && agFilter.filter !== undefined) {
    return {
      filterType: 'number',
      type: 'greaterThan',
      filter: Number(agFilter.filter)
    }
  }

  if (agFilter.type === 'lessThan' && agFilter.filter !== undefined) {
    return {
      filterType: 'number',
      type: 'lessThan',
      filter: Number(agFilter.filter)
    }
  }

  if (
    agFilter.type === 'inRange' &&
    agFilter.filter !== undefined &&
    agFilter.filterTo !== undefined
  ) {
    return {
      filterType: 'number',
      type: 'inRange',
      filter: Number(agFilter.filter),
      filterTo: Number(agFilter.filterTo)
    }
  }

  return null
}

/**
 * Convert AG Grid date filter to internal format
 */
function convertDateFilter(agFilter: any): DateFilter | null {
  // Convert Date objects to ISO strings
  const convertDate = (date: any): string | undefined => {
    if (date instanceof Date) {
      return date.toISOString().split('T')[0] // YYYY-MM-DD format
    }
    if (typeof date === 'string') {
      return date
    }
    return undefined
  }

  if (agFilter.type === 'equals' && agFilter.dateFrom) {
    const dateStr = convertDate(agFilter.dateFrom)
    if (dateStr) {
      return {
        filterType: 'date',
        type: 'equals',
        dateFrom: dateStr
      }
    }
  }

  if (agFilter.type === 'greaterThan' && agFilter.dateFrom) {
    const dateStr = convertDate(agFilter.dateFrom)
    if (dateStr) {
      return {
        filterType: 'date',
        type: 'after',
        dateFrom: dateStr
      }
    }
  }

  if (agFilter.type === 'lessThan' && agFilter.dateFrom) {
    const dateStr = convertDate(agFilter.dateFrom)
    if (dateStr) {
      return {
        filterType: 'date',
        type: 'before',
        dateFrom: dateStr
      }
    }
  }

  if (agFilter.type === 'inRange' && agFilter.dateFrom && agFilter.dateTo) {
    const fromStr = convertDate(agFilter.dateFrom)
    const toStr = convertDate(agFilter.dateTo)
    if (fromStr && toStr) {
      return {
        filterType: 'date',
        type: 'inRange',
        dateFrom: fromStr,
        dateTo: toStr
      }
    }
  }

  return null
}

/**
 * Convert AG Grid set filter to internal format
 */
function convertSetFilter(agFilter: any): SetFilter | null {
  if (agFilter.values && Array.isArray(agFilter.values)) {
    return {
      filterType: 'set',
      type: 'in',
      values: agFilter.values.map(String)
    }
  }

  return null
}

/**
 * Applies a complete filter state object to the AG Grid.
 *
 * Converts internal FilterState format to AG Grid's native filter format and
 * applies it to the grid. Handles type conversion, format mapping, and provides
 * error recovery by skipping invalid filters while applying valid ones.
 *
 * @param filterState - Complete filter state object to apply
 * @param config - Internal configuration containing grid API and error handling
 * @throws {URLSyncError} When grid API access fails critically
 *
 * @example
 * ```typescript
 * applyFilterModel({
 *   name: { filterType: 'text', type: 'contains', filter: 'john' },
 *   age: { filterType: 'number', type: 'greaterThan', filter: 25 }
 * }, config);
 * // Applies both filters to the AG Grid
 * ```
 */
export function applyFilterModel(
  filterState: FilterState,
  config: InternalConfig
): void {
  try {
    const agGridModel: any = {}

    // Create type detection engine for converting our filters to AG Grid format
    const typeEngine = createTypeDetectionEngine(config.gridApi, config)

    for (const [column, filter] of Object.entries(filterState)) {
      try {
        const agFilter = convertToAGGridFilter(filter, typeEngine)

        if (agFilter) {
          agGridModel[column] = agFilter
        }
      } catch (error) {
        if (config.debug) {
          console.warn(
            `Failed to convert filter for column '${column}':`,
            error
          )
        }
        // Skip invalid filters but continue processing
        continue
      }
    }

    config.gridApi.setFilterModel(agGridModel)
  } catch (err) {
    throw new URLSyncError(
      `Failed to apply filter model: ${(err as Error).message}`
    )
  }
}

/**
 * Converts internal ColumnFilter format to AG Grid's native filter format.
 *
 * Transforms our standardized filter objects back to AG Grid's expected format
 * for applying filters to the grid. Handles type-specific conversions and
 * operation mapping to ensure compatibility with AG Grid's filter system.
 *
 * @param filter - Internal ColumnFilter object to convert
 * @param typeEngine - Type detection engine for context (currently unused but available for future enhancements)
 * @returns AG Grid compatible filter object or null if conversion fails
 *
 * @example
 * ```typescript
 * const internalFilter = { filterType: 'number', type: 'greaterThan', filter: 100 };
 * const agFilter = convertToAGGridFilter(internalFilter, typeEngine);
 * // Returns: { filterType: 'number', type: 'greaterThan', filter: 100 }
 * ```
 */
function convertToAGGridFilter(
  filter: ColumnFilter,
  _typeEngine: TypeDetectionEngine
): any {
  switch (filter.filterType) {
    case 'text':
      return {
        filterType: 'text',
        type: filter.type,
        filter: filter.filter
      }

    case 'number':
      if (filter.type === 'inRange') {
        return {
          filterType: 'number',
          type: 'inRange',
          filter: filter.filter,
          filterTo: filter.filterTo
        }
      }
      return {
        filterType: 'number',
        type:
          filter.type === 'equals'
            ? 'equals'
            : filter.type === 'greaterThan'
              ? 'greaterThan'
              : filter.type === 'lessThan'
                ? 'lessThan'
                : filter.type,
        filter: filter.filter
      }

    case 'date':
      if (filter.type === 'inRange') {
        return {
          filterType: 'date',
          type: 'inRange',
          dateFrom: filter.dateFrom,
          dateTo: filter.dateTo
        }
      }
      return {
        filterType: 'date',
        type:
          filter.type === 'after'
            ? 'greaterThan'
            : filter.type === 'before'
              ? 'lessThan'
              : filter.type,
        dateFrom: filter.dateFrom
      }

    case 'set':
      return {
        filterType: 'set',
        values: filter.values
      }

    default:
      return null
  }
}
