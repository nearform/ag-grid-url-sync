import type { GridApi } from 'ag-grid-community'
import type {
  AGGridUrlSyncConfig,
  FilterState,
  InternalConfig,
  UrlInfo,
  ValidationResult,
  FilterType
} from './types.js'
import {
  mergeConfig,
  parseUrlFilters,
  generateUrl,
  getFilterModel,
  applyFilterModel
} from './utils.js'
import {
  createTypeDetectionEngine,
  TypeDetectionEngine
} from './type-detection.js'

/**
 * AGGridUrlSync class for synchronizing AG Grid filters with URL parameters
 * v1.0 - Comprehensive filter support (text, number, date, set)
 */
export class AGGridUrlSync {
  private config: InternalConfig
  private typeEngine: TypeDetectionEngine
  private nonFilterParams: URLSearchParams = new URLSearchParams()

  /**
   * Creates a new instance of AGGridUrlSync v1.0
   * @param gridApi - AG Grid API instance
   * @param config - Enhanced configuration options
   */
  constructor(gridApi: GridApi, config: AGGridUrlSyncConfig = {}) {
    this.config = mergeConfig(gridApi, config)
    this.typeEngine = createTypeDetectionEngine(gridApi, this.config)

    if (this.config.debug) {
      console.log('AGGridUrlSync v1.0 initialized with config:', {
        prefix: this.config.prefix,
        typeDetection: this.config.typeDetection,
        compression: this.config.compression,
        limits: this.config.limits
      })
    }
  }

  /**
   * Generates a URL with the current filter state (Phase 3 enhanced with compression)
   * @param baseUrl - Optional base URL (defaults to current URL)
   * @param options - Generation options
   * @returns Promise resolving to URL string with filter parameters
   */
  async toUrl(
    baseUrl?: string,
    options: { compress?: boolean } = {}
  ): Promise<string> {
    const startTime = this.config.performanceMonitoring ? performance.now() : 0

    try {
      const filterState = getFilterModel(this.config)
      let url =
        baseUrl ?? (typeof window !== 'undefined' ? window.location.href : '')

      // Add stored non-filter parameters to the base URL
      if (this.nonFilterParams.toString()) {
        const urlObj = new URL(url)
        for (const [key, value] of this.nonFilterParams.entries()) {
          urlObj.searchParams.set(key, value)
        }
        url = urlObj.toString()
      }

      const result = await generateUrl(url, filterState, this.config, options)

      if (this.config.performanceMonitoring) {
        const duration = performance.now() - startTime
        if (this.config.debug) {
          console.log(`URL generation completed in ${duration.toFixed(2)}ms`)
        }
      }

      return result
    } catch (error) {
      if (this.config.debug) {
        console.error('Failed to generate URL:', error)
      }
      throw error
    }
  }

  /**
   * Gets the current filter state as URL query parameters
   * @param options - Generation options
   * @returns Promise resolving to query parameter string
   */
  async toParams(options: { compress?: boolean } = {}): Promise<string> {
    const url = await this.toUrl(undefined, options)
    const urlObj = new URL(url)
    return urlObj.search
  }

  /**
   * Applies filters from a URL to the grid (Phase 3 enhanced with decompression)
   * @param url - Optional URL to parse (defaults to current URL)
   */
  async fromUrl(url?: string): Promise<void> {
    const startTime = this.config.performanceMonitoring ? performance.now() : 0

    try {
      const urlToParse =
        url ?? (typeof window !== 'undefined' ? window.location.href : '')

      // Store non-filter parameters for later use
      const urlObj = new URL(urlToParse)
      this.nonFilterParams = new URLSearchParams()
      for (const [key, value] of urlObj.searchParams.entries()) {
        if (!key.startsWith(this.config.prefix)) {
          this.nonFilterParams.append(key, value)
        }
      }

      const filterState = await parseUrlFilters(urlToParse, this.config)
      this.fromFilters(filterState)

      if (this.config.performanceMonitoring) {
        const duration = performance.now() - startTime
        if (this.config.debug) {
          console.log(
            `URL parsing and application completed in ${duration.toFixed(2)}ms`
          )
        }
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('Failed to apply filters from URL:', error)
      }
      throw error
    }
  }

  /**
   * Applies a filter state object to the grid
   * @param filterState - Filter state to apply
   */
  fromFilters(filterState: FilterState): void {
    try {
      if (this.config.validateOnApply) {
        this.validateFilterState(filterState)
      }

      applyFilterModel(filterState, this.config)

      if (this.config.debug) {
        console.log('Applied filter state:', filterState)
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('Failed to apply filter state:', error)
      }
      throw error
    }
  }

  /**
   * Gets comprehensive information about the current URL state (Phase 3 enhanced)
   * @returns Promise resolving to URL information including length, filter count, compression status, and types
   */
  async getUrlInfo(): Promise<UrlInfo> {
    try {
      const filterState = getFilterModel(this.config)
      const url = await this.toUrl()
      const columnTypes = this.typeEngine.getColumnTypes()

      // Check if URL is compressed
      const urlObj = new URL(url)
      const isCompressed = urlObj.searchParams.has(
        `${this.config.prefix}compressed`
      )
      const compressionMethod = urlObj.searchParams.get(
        `${this.config.prefix}method`
      )

      return {
        length: url.length,
        filterCount: Object.keys(filterState).length,
        compressed: isCompressed,
        ...(compressionMethod && { compressionMethod }),
        types: columnTypes
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('Failed to get URL info:', error)
      }
      throw error
    }
  }

  /**
   * Gets the detected column types for all columns
   * @returns Record mapping column IDs to their detected filter types
   */
  getColumnTypes(): Record<string, FilterType> {
    return this.typeEngine.getColumnTypes()
  }

  /**
   * Validates a URL for proper filter format (Phase 3 enhanced)
   * @param url - URL to validate
   * @returns Promise resolving to validation result with any errors or warnings
   */
  async validateUrl(url: string): Promise<ValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    try {
      // Attempt to parse the URL
      await parseUrlFilters(url, this.config)

      // Check URL length
      if (url.length > this.config.limits.urlLength) {
        warnings.push(
          `URL length (${url.length}) exceeds recommended limit (${this.config.limits.urlLength})`
        )
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      }
    } catch (error) {
      errors.push((error as Error).message)
      return {
        valid: false,
        errors,
        warnings
      }
    }
  }

  /**
   * Clears all filters from the grid
   */
  clearFilters(): void {
    try {
      this.fromFilters({})

      if (this.config.debug) {
        console.log('All filters cleared')
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('Failed to clear filters:', error)
      }
      throw error
    }
  }

  /**
   * Cleans up resources and event listeners
   */
  destroy(): void {
    try {
      // Clear type detection cache
      this.typeEngine.clearCache()

      if (this.config.debug) {
        console.log('AGGridUrlSync instance destroyed')
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('Error during cleanup:', error)
      }
    }
  }

  /**
   * Updates the configuration (useful for React re-renders)
   * @param newConfig - New configuration to merge
   */
  updateConfig(newConfig: AGGridUrlSyncConfig): void {
    this.config = mergeConfig(this.config.gridApi, newConfig)
    this.typeEngine.updateConfig(this.config)

    if (this.config.debug) {
      console.log('Configuration updated:', newConfig)
    }
  }

  /**
   * Validates a filter state object
   * @private
   */
  private validateFilterState(filterState: FilterState): void {
    for (const [column, filter] of Object.entries(filterState)) {
      if (!filter || typeof filter !== 'object') {
        throw new Error(
          `Invalid filter for column '${column}': must be an object`
        )
      }

      if (!filter.filterType) {
        throw new Error(
          `Invalid filter for column '${column}': missing filterType`
        )
      }

      // Additional validation could be added here based on filter type
    }
  }
}

/**
 * Factory function to create a new AGGridUrlSync instance
 * @param gridApi - AG Grid API instance
 * @param config - Optional configuration options
 * @returns AGGridUrlSync instance
 */
export function createUrlSync(
  gridApi: GridApi,
  config?: AGGridUrlSyncConfig
): AGGridUrlSync {
  return new AGGridUrlSync(gridApi, config)
}
