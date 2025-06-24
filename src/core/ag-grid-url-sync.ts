/**
 * @fileoverview AG Grid URL Synchronization Library
 *
 * This module provides the core AGGridUrlSync class for synchronizing AG Grid filter states
 * with URL parameters. It supports comprehensive filter types including text, number, date,
 * and set filters with automatic type detection, URL compression, and robust error handling.
 *
 * The library enables users to share filtered grid views via URLs and maintain filter
 * state across browser navigation and page reloads.
 *
 */

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
 * Main class for synchronizing AG Grid filter states with URL parameters.
 *
 * Provides comprehensive filter support with automatic type detection, URL compression,
 * and error handling. Supports text, number, date, and set filters with configurable
 * behavior for different use cases.
 *
 * @example
 * ```typescript
 * const urlSync = new AGGridUrlSync(gridApi, {
 *   prefix: 'filter_',
 *   compression: 'auto',
 *   typeDetection: 'smart'
 * });
 *
 * // Apply filters from current URL
 * await urlSync.fromUrl(window.location.href);
 *
 * // Generate URL with current filters
 * const shareableUrl = await urlSync.toUrl();
 * ```
 */
export class AGGridUrlSync {
  private config: InternalConfig
  private typeEngine: TypeDetectionEngine
  private nonFilterParams: URLSearchParams = new URLSearchParams()

  /**
   * Creates a new instance of AGGridUrlSync with the specified configuration.
   *
   * Initializes the internal configuration, type detection engine, and sets up
   * debugging if enabled. The constructor validates the grid API and merges
   * user configuration with sensible defaults.
   *
   * @param gridApi - The AG Grid API instance to synchronize with
   * @param config - Optional configuration to customize behavior
   * @throws {Error} When gridApi is null or invalid
   * @throws {Error} When configuration validation fails
   *
   * @example
   * ```typescript
   * const urlSync = new AGGridUrlSync(gridApi, {
   *   prefix: 'f_',
   *   limits: { urlLength: 2000 },
   *   compression: 'auto'
   * });
   * ```
   */
  constructor(gridApi: GridApi, config: AGGridUrlSyncConfig = {}) {
    this.config = mergeConfig(gridApi, config)
    this.typeEngine = createTypeDetectionEngine(gridApi, this.config)

    if (this.config.debug) {
      console.log('AGGridUrlSync initialized with config:', {
        prefix: this.config.prefix,
        typeDetection: this.config.typeDetection,
        compression: this.config.compression,
        limits: this.config.limits
      })
    }
  }

  /**
   * Generates a complete URL with current grid filters as query parameters.
   *
   * Automatically compresses the URL if it exceeds configured length limits.
   * Preserves non-filter query parameters and handles URL construction errors gracefully.
   * Performance monitoring is available when enabled in configuration.
   *
   * @param baseUrl - Optional base URL (defaults to current window location)
   * @param options - Generation options including compression override
   * @param options.compress - Force compression on/off (overrides auto-detection)
   * @returns Promise resolving to the complete URL with filter parameters
   * @throws {Error} When URL generation fails
   * @throws {Error} When grid API is unavailable
   *
   * @example
   * ```typescript
   * // Generate URL with current filters
   * const url = await urlSync.toUrl();
   *
   * // Generate with custom base URL
   * const url = await urlSync.toUrl('https://example.com/grid');
   *
   * // Force compression
   * const url = await urlSync.toUrl(undefined, { compress: true });
   * ```
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
   * Generates query parameters string from current grid filters.
   *
   * Returns only the query parameter portion (including the leading '?') without the base URL.
   * Useful for manual URL construction or when working with routing libraries.
   * Uses the same compression logic as toUrl().
   *
   * @param options - Optional generation options
   * @param options.compress - Force compression on/off (overrides auto-detection)
   * @returns Promise resolving to query parameters string (with leading '?')
   * @throws {Error} When parameter generation fails
   *
   * @example
   * ```typescript
   * const params = await urlSync.toParams();
   * // Returns: "?f_name_contains=john&f_age_gt=25"
   *
   * // Use with router
   * router.push(`/grid${params}`);
   * ```
   */
  async toParams(options: { compress?: boolean } = {}): Promise<string> {
    const url = await this.toUrl(undefined, options)
    const urlObj = new URL(url)
    return urlObj.search
  }

  /**
   * Applies filters to the grid from a complete URL.
   *
   * Parses filter parameters from the URL and applies them to the grid.
   * Automatically handles decompression if compressed parameters are detected.
   * Preserves non-filter parameters for future URL generation and gracefully
   * handles malformed URLs and invalid parameters.
   *
   * @param url - Optional URL to parse (defaults to current window location)
   * @throws {Error} When URL parsing fails critically
   * @throws {Error} When grid API is unavailable
   *
   * @example
   * ```typescript
   * // Apply filters from current URL
   * await urlSync.fromUrl(window.location.href);
   *
   * // Apply filters from shared URL
   * await urlSync.fromUrl('https://example.com/grid?f_name_contains=john');
   * ```
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
   * Applies a filter state object directly to the grid.
   *
   * Bypasses URL parsing and directly applies the provided filter configuration.
   * Validates filter structure if validation is enabled and handles type conversion
   * automatically. This is the core method used by fromUrl() after parsing.
   *
   * @param filterState - Object containing filter definitions by column
   * @throws {Error} When filter state is invalid
   * @throws {Error} When grid API is unavailable
   *
   * @example
   * ```typescript
   * urlSync.fromFilters({
   *   name: { filterType: 'text', type: 'contains', filter: 'john' },
   *   age: { filterType: 'number', type: 'greaterThan', filter: 25 }
   * });
   * ```
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
   * Gets comprehensive information about the current URL state.
   *
   * Analyzes the current filter state to provide statistics about filter count,
   * URL length, compression status, and detected filter types. Useful for
   * debugging and monitoring URL state without applying filters to the grid.
   *
   * @returns Promise resolving to detailed URL information
   * @throws {Error} When URL analysis fails
   *
   * @example
   * ```typescript
   * const info = await urlSync.getUrlInfo();
   * console.log(`URL contains ${info.filterCount} filters`);
   * console.log(`Compression: ${info.compressed ? 'enabled' : 'disabled'}`);
   * console.log('Filter types:', info.types);
   * ```
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
   * Gets the detected column types for all columns in the grid.
   *
   * Returns a mapping of column IDs to their automatically detected filter types.
   * This information is used internally for proper filter serialization and
   * can be useful for debugging type detection issues.
   *
   * @returns Record mapping column IDs to their detected filter types
   *
   * @example
   * ```typescript
   * const types = urlSync.getColumnTypes();
   * console.log('Detected types:', types);
   * // Output: { name: 'text', age: 'number', date: 'date', status: 'set' }
   * ```
   */
  getColumnTypes(): Record<string, FilterType> {
    return this.typeEngine.getColumnTypes()
  }

  /**
   * Validates a URL and returns detailed validation results.
   *
   * Checks for valid filter parameters, proper encoding, and structural correctness.
   * Does not apply filters to the grid, only validates the URL structure.
   * Provides both errors (blocking issues) and warnings (non-critical issues).
   *
   * @param url - The URL to validate
   * @returns Promise resolving to validation results with errors and warnings
   *
   * @example
   * ```typescript
   * const result = await urlSync.validateUrl(url);
   * if (!result.valid) {
   *   console.log('Validation errors:', result.errors);
   *   console.log('Warnings:', result.warnings);
   * }
   * ```
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
   * Clears all filters from the grid.
   *
   * Removes all active filters and resets the grid to its unfiltered state.
   * This is equivalent to calling fromFilters({}) with an empty filter state.
   *
   * @throws {Error} When grid API is unavailable
   *
   * @example
   * ```typescript
   * // Clear all filters
   * urlSync.clearFilters();
   * ```
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
   * Cleans up resources and event listeners.
   *
   * Clears the type detection cache and performs any necessary cleanup.
   * Should be called when the AGGridUrlSync instance is no longer needed
   * to prevent memory leaks.
   *
   * @example
   * ```typescript
   * // Clean up when component unmounts
   * urlSync.destroy();
   * ```
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
   * Updates the configuration with new settings.
   *
   * Merges the new configuration with existing settings and updates the
   * type detection engine accordingly. Useful for React components that
   * need to update configuration during re-renders.
   *
   * @param newConfig - New configuration to merge with existing settings
   *
   * @example
   * ```typescript
   * // Update compression settings
   * urlSync.updateConfig({
   *   compression: { strategy: 'always', threshold: 1000 }
   * });
   * ```
   */
  updateConfig(newConfig: AGGridUrlSyncConfig): void {
    this.config = mergeConfig(this.config.gridApi, newConfig)
    this.typeEngine.updateConfig(this.config)

    if (this.config.debug) {
      console.log('Configuration updated:', newConfig)
    }
  }

  /**
   * Validates a filter state object for structural correctness.
   *
   * Performs basic validation on the filter state structure to ensure
   * each filter has required properties. This is used internally when
   * validateOnApply is enabled in the configuration.
   *
   * @private
   * @param filterState - The filter state object to validate
   * @throws {Error} When filter structure is invalid
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
 * Factory function to create a new AGGridUrlSync instance.
 *
 * Convenience function that creates and returns a new AGGridUrlSync instance
 * with the provided configuration. This is an alternative to using the
 * constructor directly.
 *
 * @param gridApi - The AG Grid API instance to synchronize with
 * @param config - Optional configuration to customize behavior
 * @returns A new AGGridUrlSync instance
 *
 * @example
 * ```typescript
 * const urlSync = createUrlSync(gridApi, {
 *   prefix: 'filter_',
 *   compression: 'auto'
 * });
 * ```
 */
export function createUrlSync(
  gridApi: GridApi,
  config?: AGGridUrlSyncConfig
): AGGridUrlSync {
  return new AGGridUrlSync(gridApi, config)
}
