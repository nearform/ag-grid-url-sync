import type {
  FilterState,
  SerializationFormat,
  FormatSerializer,
  GroupedSerializationResult,
  InternalConfig
} from '../types.js'
import { InvalidSerializationError } from '../types.js'
import {
  QueryStringSerializer,
  JsonSerializer,
  Base64Serializer
} from './formats.js'

/**
 * Registry of available format serializers
 */
const FORMAT_SERIALIZERS: Record<SerializationFormat, FormatSerializer> = {
  querystring: new QueryStringSerializer(),
  json: new JsonSerializer(),
  base64: new Base64Serializer()
}

/**
 * Serialize filter state using grouped serialization
 * @param filterState - The filter state to serialize
 * @param config - Internal configuration
 * @returns Grouped serialization result with parameter name and value
 */
export function serializeGrouped(
  filterState: FilterState,
  config: InternalConfig
): GroupedSerializationResult {
  try {
    const serializer = FORMAT_SERIALIZERS[config.format]
    if (!serializer) {
      throw new Error(`Unknown serialization format: ${config.format}`)
    }

    const value = serializer.serialize(filterState)

    return {
      paramName: config.groupedParam,
      value
    }
  } catch (error) {
    const serializationError = new InvalidSerializationError(
      config.format,
      error as Error
    )
    config.onParseError(serializationError)

    // Return empty state on error
    return {
      paramName: config.groupedParam,
      value: ''
    }
  }
}

/**
 * Deserialize grouped filter state from URL parameter value
 * @param value - The serialized value from URL parameter
 * @param format - The serialization format to use
 * @param config - Internal configuration for error handling
 * @returns Deserialized filter state
 */
export function deserializeGrouped(
  value: string,
  format: SerializationFormat,
  config: InternalConfig
): FilterState {
  try {
    const serializer = FORMAT_SERIALIZERS[format]
    if (!serializer) {
      throw new Error(`Unknown serialization format: ${format}`)
    }

    return serializer.deserialize(value)
  } catch (error) {
    const serializationError = new InvalidSerializationError(
      format,
      error as Error
    )
    config.onParseError(serializationError)

    // Return empty state on error
    return {}
  }
}

/**
 * Detect if a URL contains grouped serialization parameters
 * @param url - URL to analyze
 * @param possibleParams - Array of possible grouped parameter names to check
 * @returns Detection result with format and value if found
 */
export function detectGroupedSerialization(
  url: string,
  possibleParams: string[]
): {
  isGrouped: boolean
  paramName?: string
  format?: SerializationFormat
  value?: string
} {
  try {
    const urlObj = new URL(url)

    // Check each possible parameter name
    for (const paramName of possibleParams) {
      const value = urlObj.searchParams.get(paramName)
      if (value) {
        // Try to detect format by attempting to parse
        const format = detectFormat(value)
        if (format) {
          return {
            isGrouped: true,
            paramName,
            format,
            value
          }
        }
      }
    }

    return { isGrouped: false }
  } catch {
    return { isGrouped: false }
  }
}

/**
 * Detect the serialization format of a value
 * @param value - The serialized value
 * @returns The detected format or null if none detected
 */
function detectFormat(value: string): SerializationFormat | null {
  // Try base64 first (most specific)
  if (isBase64Format(value)) {
    return 'base64'
  }

  // Try JSON format
  if (isJsonFormat(value)) {
    return 'json'
  }

  // Default to querystring format
  if (isQueryStringFormat(value)) {
    return 'querystring'
  }

  return null
}

/**
 * Check if value appears to be base64 encoded
 */
function isBase64Format(value: string): boolean {
  try {
    // Base64 pattern check
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/
    if (!base64Pattern.test(value)) {
      return false
    }

    // Try to decode and parse as JSON
    const decoded = atob(value)
    JSON.parse(decoded)
    return true
  } catch {
    return false
  }
}

/**
 * Check if value appears to be JSON
 */
function isJsonFormat(value: string): boolean {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null
  } catch {
    return false
  }
}

/**
 * Check if value appears to be query string format
 */
function isQueryStringFormat(value: string): boolean {
  // Basic check for key=value patterns
  return value.includes('=') && (value.includes('&') || !value.includes('{'))
}

/**
 * Get all available serialization formats
 */
export function getAvailableFormats(): SerializationFormat[] {
  return Object.keys(FORMAT_SERIALIZERS) as SerializationFormat[]
}

/**
 * Get a specific format serializer
 */
export function getFormatSerializer(
  format: SerializationFormat
): FormatSerializer | null {
  return FORMAT_SERIALIZERS[format] || null
}
