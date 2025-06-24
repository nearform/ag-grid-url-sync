/**
 * @fileoverview React-Specific Type Definitions for AG Grid URL Synchronization
 *
 * This module defines TypeScript interfaces and types specifically for the React
 * integration of AGGridUrlSync. It extends the core types with React-specific
 * functionality and provides comprehensive type definitions for the useAGGridUrlSync hook.
 *
 * Key type definitions:
 * - UseAGGridUrlSyncOptions: Configuration for the React hook
 * - UseAGGridUrlSyncReturn: Complete return type with organized API surface
 * - React lifecycle and state management types
 * - Hook-specific error handling and loading states
 *
 * The types are designed to provide both a clean, intuitive API surface and
 * an organized alternative access pattern for different use cases.
 *
 */

import type {
  AGGridUrlSyncConfig,
  FilterState,
  UrlInfo,
  ValidationResult,
  FilterType
} from '../core/types.js'

/**
 * Configuration options specific to the React hook
 */
export interface UseAGGridUrlSyncOptions extends AGGridUrlSyncConfig {
  /**
   * Automatically apply URL filters when the hook mounts
   * @default false
   */
  autoApplyOnMount?: boolean

  /**
   * Enable URL sync functionality when grid API is ready
   * @default true
   */
  enabledWhenReady?: boolean
}

/**
 * Enhanced return type for the useAGGridUrlSync hook with comprehensive filter support.
 */
export interface UseAGGridUrlSyncReturn {
  // Primary API (clean and intuitive)

  /**
   * Generate a shareable URL with current filter state
   * @param baseUrl - Optional base URL (defaults to current URL)
   * @param options - Generation options
   * @returns Promise resolving to URL string with filter parameters
   */
  shareUrl: (
    baseUrl?: string,
    options?: { compress?: boolean }
  ) => Promise<string>

  /**
   * Apply filters from a URL to the grid
   * @param url - Optional URL to parse (defaults to current URL)
   */
  applyUrlFilters: (url?: string) => void

  /**
   * Clear all filters from the grid
   */
  clearFilters: () => void

  // Status information

  /**
   * Whether the URL sync is ready to use (grid API available)
   */
  isReady: boolean

  /**
   * Whether there are currently active filters
   */
  hasFilters: boolean

  /**
   * Whether the hook is currently loading/processing
   */
  isLoading: boolean

  /**
   * Current error state, if any
   */
  error: Error | null

  // Enhanced capabilities with comprehensive filter support

  /**
   * Comprehensive URL information
   */
  urlInfo: UrlInfo

  /**
   * Detected column types for all columns
   */
  columnTypes: Record<string, FilterType>

  /**
   * Validate a URL for proper filter format
   * @param url - URL to validate
   * @returns Promise resolving to validation result with any errors or warnings
   */
  validateUrl: (url: string) => Promise<ValidationResult>

  /**
   * Apply a filter state object directly to the grid
   * @param filterState - Filter state to apply
   */
  applyFilters: (filterState: FilterState) => void

  /**
   * Get the current filter state as URL query parameters
   * @param options - Generation options
   * @returns Promise resolving to query parameter string
   */
  getQueryParams: (options?: { compress?: boolean }) => Promise<string>

  /**
   * Manually refresh the hook's state from the current grid state
   * Useful when you know the grid has changed and want to update the URL info
   */
  refresh: () => Promise<void>

  // Organized API surface (alternative access pattern)

  /**
   * URL-related operations
   */
  url: {
    /**
     * Generate a shareable URL with current filter state
     */
    share: (
      baseUrl?: string,
      options?: { compress?: boolean }
    ) => Promise<string>

    /**
     * Current URL with filters
     */
    current: string

    /**
     * URL information and statistics
     */
    info: UrlInfo

    /**
     * Validate a URL
     */
    validate: (url: string) => Promise<ValidationResult>
  }

  /**
   * Filter-related operations
   */
  filters: {
    /**
     * Apply filters from URL
     */
    apply: (url?: string) => void

    /**
     * Apply filter state object
     */
    applyState: (filterState: FilterState) => void

    /**
     * Clear all filters
     */
    clear: () => void

    /**
     * Current filter count
     */
    count: number

    /**
     * Detected column types
     */
    types: Record<string, FilterType>
  }

  /**
   * Status information
   */
  status: {
    /**
     * Ready state
     */
    ready: boolean

    /**
     * Loading state
     */
    loading: boolean

    /**
     * Error state
     */
    error: Error | null

    /**
     * Whether filters are present
     */
    hasFilters: boolean
  }
}
