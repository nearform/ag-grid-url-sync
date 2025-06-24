import type { GridApi as AGGridApi } from 'ag-grid-community'

/**
 * URL compression strategy options
 */
export type CompressionStrategy = 'auto' | 'always' | 'never' | 'gzip' | 'lz'

/**
 * Compression algorithm configuration
 */
export interface CompressionConfig {
  /** Compression strategy */
  strategy: CompressionStrategy
  /** Threshold for auto compression (characters) */
  threshold: number
  /** Algorithm preference order */
  algorithms: ('gzip' | 'lz' | 'base64')[]
  /** Compression level (1-9 for gzip) */
  level: number
}

/**
 * Enhanced configuration options for AG Grid URL Sync v0.3
 */
export interface AGGridUrlSyncConfig {
  /**
   * Prefix for URL parameters. Default: 'f_'
   */
  prefix?: string

  /**
   * Configuration for URL and value limits
   */
  limits?: {
    /** Maximum length for individual filter values. Default: 200 */
    valueLength?: number
    /** Maximum URL length before auto-compression. Default: 2000 */
    urlLength?: number
    /** Maximum values in set filters. Default: 50 */
    setValues?: number
  }

  /**
   * Enhanced error handling configuration
   */
  onError?: {
    /** Handler for URL parsing errors */
    parsing?: (error: Error, context: ParseContext) => void
    /** Handler for type detection errors */
    typeDetection?: (error: Error, column: string) => void
    /** Handler for URL length warnings */
    urlLength?: (info: UrlLengthInfo) => void
    /** Handler for filter validation errors */
    validation?: (error: Error, filter: FilterInfo) => void
    /** Handler for compression errors */
    compression?: (error: Error, data: CompressionContext) => void
  }

  /**
   * Type detection configuration
   */
  typeDetection?: 'smart' | 'strict' | 'disabled'

  /**
   * URL compression strategy (Phase 3)
   */
  compression?: CompressionStrategy | CompressionConfig

  /**
   * User-defined column types (highest priority)
   */
  columnTypes?: Record<string, FilterType>

  /**
   * Type hints for automatic detection
   */
  typeHints?: {
    dateColumns?: string[]
    numberColumns?: string[]
    setColumns?: string[]
  }

  /**
   * Development and debugging options
   */
  debug?: boolean
  validateOnApply?: boolean
  performanceMonitoring?: boolean
}

/**
 * Supported filter types in v0.3
 */
export type FilterType = 'text' | 'number' | 'date' | 'set'

/**
 * Supported filter operations by type
 */
export type TextOperation = 'contains' | 'equals'
export type NumberOperation =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'lessThan'
  | 'inRange'
export type DateOperation =
  | 'equals'
  | 'notEquals'
  | 'before'
  | 'after'
  | 'inRange'
export type SetOperation = 'in'

export type FilterOperation =
  | TextOperation
  | NumberOperation
  | DateOperation
  | SetOperation

/**
 * Base filter interface
 */
interface BaseFilter {
  filterType: FilterType
}

/**
 * Text filter configuration
 */
export interface TextFilter extends BaseFilter {
  filterType: 'text'
  type: TextOperation
  filter: string
}

/**
 * Number filter configuration
 */
export interface NumberFilter extends BaseFilter {
  filterType: 'number'
  type: NumberOperation
  filter?: number
  filterTo?: number // For range operations
}

/**
 * Date filter configuration
 */
export interface DateFilter extends BaseFilter {
  filterType: 'date'
  type: DateOperation
  dateFrom?: string // ISO date format YYYY-MM-DD
  dateTo?: string // For range operations
}

/**
 * Set filter configuration
 */
export interface SetFilter extends BaseFilter {
  filterType: 'set'
  type: SetOperation
  values: string[]
}

/**
 * Union type for all filter configurations
 */
export type ColumnFilter = TextFilter | NumberFilter | DateFilter | SetFilter

/**
 * Complete filter state mapping
 */
export interface FilterState {
  [columnId: string]: ColumnFilter
}

/**
 * Enhanced internal configuration with defaults
 */
export interface InternalConfig {
  gridApi: AGGridApi
  prefix: string
  limits: {
    valueLength: number
    urlLength: number
    setValues: number
  }
  onError: {
    parsing: (error: Error, context: ParseContext) => void
    typeDetection: (error: Error, column: string) => void
    urlLength: (info: UrlLengthInfo) => void
    validation: (error: Error, filter: FilterInfo) => void
    compression: (error: Error, data: CompressionContext) => void
  }
  typeDetection: 'smart' | 'strict' | 'disabled'
  compression: CompressionConfig
  columnTypes: Record<string, FilterType>
  typeHints: {
    dateColumns: string[]
    numberColumns: string[]
    setColumns: string[]
  }
  debug: boolean
  validateOnApply: boolean
  performanceMonitoring: boolean
}

/**
 * Context information for parsing operations
 */
export interface ParseContext {
  url: string
  parameter: string
  value: string
  columnName: string
  operation: string
}

/**
 * URL length information (Phase 3 enhanced)
 */
export interface UrlLengthInfo {
  originalLength: number
  compressedLength?: number
  filterCount: number
  threshold: number
  compressionRatio?: number
  compressionMethod?: string
}

/**
 * Filter information for validation
 */
export interface FilterInfo {
  column: string
  type: FilterType
  operation: FilterOperation
  value: any
}

/**
 * URL information and statistics (Phase 3 enhanced)
 */
export interface UrlInfo {
  length: number
  filterCount: number
  compressed: boolean
  compressionMethod?: string
  compressionRatio?: number
  types: Record<string, FilterType>
}

/**
 * URL validation result
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Type detection result
 */
export interface TypeDetectionResult {
  type: FilterType
  confidence: 'high' | 'medium' | 'low'
  source: 'user' | 'hint' | 'grid' | 'data' | 'default'
}

/**
 * Enhanced error types for URL sync operations
 */
export class URLSyncError extends Error {
  constructor(
    message: string,
    public context?: any
  ) {
    super(message)
    this.name = 'URLSyncError'
  }
}

export class InvalidFilterError extends URLSyncError {
  constructor(message: string, context?: any) {
    super(message, context)
    this.name = 'InvalidFilterError'
  }
}

export class InvalidURLError extends URLSyncError {
  constructor(message: string, context?: any) {
    super(message, context)
    this.name = 'InvalidURLError'
  }
}

export class TypeDetectionError extends URLSyncError {
  constructor(message: string, context?: any) {
    super(message, context)
    this.name = 'TypeDetectionError'
  }
}

/**
 * Parsed filter parameter with enhanced context
 */
export type ParsedFilterParam = {
  columnName: string
  operation: FilterOperation
  value: any
  filterType: FilterType
  action: 'apply' | 'remove'
}

// Re-export GridApi for convenience
export type GridApi = AGGridApi

/**
 * Operation mapping for URL serialization
 */
export const OPERATION_MAP = {
  // Text operations
  contains: 'contains',
  eq: 'equals',
  equals: 'equals',

  // Number operations
  neq: 'notEquals',
  notEquals: 'notEquals',
  gt: 'greaterThan',
  greaterThan: 'greaterThan',
  lt: 'lessThan',
  lessThan: 'lessThan',
  range: 'inRange',
  inRange: 'inRange',

  // Date operations
  before: 'before',
  after: 'after',

  // Set operations
  in: 'in'
} as const

/**
 * Reverse operation mapping for URL generation
 */
export const REVERSE_OPERATION_MAP = {
  // Text operations
  contains: 'contains',
  equals: 'eq',

  // Number operations
  notEquals: 'neq',
  greaterThan: 'gt',
  lessThan: 'lt',
  inRange: 'range',

  // Date operations
  before: 'before',
  after: 'after',

  // Set operations
  in: 'in'
} as const

/**
 * Compression context for error handling
 */
export interface CompressionContext {
  originalData: string
  originalLength: number
  method: string
  operation: 'compress' | 'decompress'
}

/**
 * Compression result
 */
export interface CompressionResult {
  data: string
  method: string
  originalLength: number
  compressedLength: number
  ratio: number
}

/**
 * Default configuration values for v0.3 (Phase 3 enhanced)
 */
export const DEFAULT_V3_CONFIG = {
  prefix: 'f_',
  limits: {
    valueLength: 200,
    urlLength: 2000,
    setValues: 50
  },
  typeDetection: 'smart' as const,
  compression: {
    strategy: 'auto' as const,
    threshold: 2000,
    algorithms: ['lz', 'gzip', 'base64'] as const,
    level: 6
  },
  columnTypes: {},
  typeHints: {
    dateColumns: [],
    numberColumns: [],
    setColumns: []
  },
  debug: false,
  validateOnApply: false,
  performanceMonitoring: false
} as const
