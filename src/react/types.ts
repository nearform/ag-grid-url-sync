import type { AGGridUrlSyncConfig, FilterState } from '../core/types.js'

/**
 * Configuration options for the React hook
 */
export interface UseAGGridUrlSyncOptions extends AGGridUrlSyncConfig {
  /**
   * Automatically apply URL filters when the component mounts and grid API becomes ready
   * Default: false
   */
  autoApplyOnMount?: boolean

  /**
   * Whether the hook should be enabled when the grid API is ready
   * Default: true
   */
  enabledWhenReady?: boolean

  /**
   * Optional error handler for hook-level errors (initialization, URL operations, etc.)
   * This supplements the core onParseError callback for comprehensive error handling
   */
  onError?: (error: Error, context: string) => void
}

/**
 * Return type for the useAGGridUrlSync hook
 */
export interface UseAGGridUrlSyncReturn {
  /**
   * Generate a URL with current filter state
   * @param baseUrl - Optional base URL (defaults to current URL)
   * @returns URL string with filter parameters
   */
  shareUrl: (baseUrl?: string) => string

  /**
   * Get current filter state as query parameters string
   * @returns Query parameter string
   */
  getQueryParams: () => string

  /**
   * Apply filters from a URL to the grid
   * @param url - Optional URL to parse (defaults to current URL)
   */
  applyUrlFilters: (url?: string) => void

  /**
   * Clear all text filters from the grid
   */
  clearFilters: () => void

  /**
   * Whether the grid API is available and hook is ready
   */
  isReady: boolean

  /**
   * Current generated URL with filters
   */
  currentUrl: string

  /**
   * Whether the grid has any active text filters
   */
  hasFilters: boolean

  /**
   * Parse filters from a URL without applying them
   * @param url - URL to parse
   * @returns Parsed filter state
   */
  parseUrlFilters: (url: string) => FilterState

  /**
   * Apply a filter state object to the grid
   * @param filters - Filter state to apply
   */
  applyFilters: (filters: FilterState) => void
}
