import type {
  FilterState,
  ColumnFilter,
  FilterOperation,
  InternalConfig,
  AGGridUrlSyncConfig,
  ParseContext,
  FilterInfo,
  UrlInfo,
  ValidationResult,
  NumberFilter,
  DateFilter,
  SetFilter,
  TextFilter,
  FilterType
} from './types.js'
import {
  InvalidFilterError,
  InvalidURLError,
  URLSyncError,
  TypeDetectionError,
  OPERATION_MAP,
  REVERSE_OPERATION_MAP
} from './types.js'
import {
  createTypeDetectionEngine,
  TypeDetectionEngine
} from './type-detection.js'
import { compressFilterData, decompressFilterData } from './compression.js'

/**
 * Merges user configuration with defaults for v1.0
 */
export function mergeConfig(
  gridApi: any,
  userConfig: AGGridUrlSyncConfig = {}
): InternalConfig {
  // Use v1.0 clean configuration properties
  const prefix = userConfig.prefix ?? 'f_'
  const valueLength = userConfig.limits?.valueLength ?? 200

  // Handle compression configuration (Phase 3)
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
 * Validates a filter value against configuration constraints
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
 * Extracts column name and operation from a filter parameter
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
 * Parses a number value, handling scientific notation and validation
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
 * Parses a date value in ISO format (YYYY-MM-DD)
 */
function parseDateValue(value: string, columnId: string): string {
  if (!value || value.trim() === '') {
    throw new InvalidFilterError(`Empty date value for column '${columnId}'`)
  }

  const trimmed = value.trim()

  // Validate ISO date format
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!isoDateRegex.test(trimmed)) {
    throw new InvalidFilterError(
      `Invalid date format '${value}' for column '${columnId}': expected YYYY-MM-DD`
    )
  }

  // Validate actual date
  const date = new Date(trimmed)
  if (isNaN(date.getTime()) || date.toISOString().split('T')[0] !== trimmed) {
    throw new InvalidFilterError(
      `Invalid date '${value}' for column '${columnId}': not a valid date`
    )
  }

  return trimmed
}

/**
 * Parses a range value (for number or date ranges)
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
 * Parses set filter values (comma-separated list)
 */
function parseSetValues(
  value: string,
  columnId: string,
  config: InternalConfig
): string[] {
  if (!value || value.trim() === '') {
    return []
  }

  // Split by comma and decode URL-encoded commas (%2C)
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
 * Parse number filter from URL parameter
 */
function parseNumberFilter(
  columnName: string,
  operation: string,
  value: string,
  config: InternalConfig
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
 * Parse date filter from URL parameter
 */
function parseDateFilter(
  columnName: string,
  operation: string,
  value: string,
  config: InternalConfig
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
 * Parse set filter from URL parameter
 */
function parseSetFilter(
  columnName: string,
  operation: string,
  value: string,
  config: InternalConfig
): SetFilter {
  if (operation !== 'in') {
    throw new InvalidFilterError(
      `Unsupported set filter operation: ${operation}`
    )
  }

  return {
    filterType: 'set',
    type: 'in',
    values: parseSetValues(value, columnName, config)
  }
}

/**
 * Parse text filter from URL parameter (legacy support)
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
 * Enhanced filter parsing with type detection
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
 * Converts URL search params into a filter state object (Phase 3 enhanced with decompression)
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

    // Phase 3: Check for compressed data first
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
 * Serializes a filter value for URL parameters
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
 * Converts a filter state object into URL search parameters
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
 * Generates a URL with the current filter state (Phase 3 enhanced with compression)
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

  // Phase 3: Apply compression if needed
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
 * Gets the current filter model from AG Grid
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
 * Converts AG Grid filter format to our internal format
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
 * Applies a filter state object to the grid
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
 * Converts our internal filter format to AG Grid filter format
 */
function convertToAGGridFilter(
  filter: ColumnFilter,
  typeEngine: TypeDetectionEngine
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
