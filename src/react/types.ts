import type {
  AGGridUrlSyncConfig,
  FilterState,
  SerializationFormat,
  SerializationMode
} from '../core/types.js'
import type { GridView } from '../core/view-storage.js'

/**
 * Configuration options for the React hook
 */
export interface UseAGGridUrlSyncOptions extends AGGridUrlSyncConfig {
  /**
   * Enables saved views, persisted to localStorage under this key.
   *
   * The key both switches the feature on and namespaces the storage, so two
   * grids on the same origin must use different keys. Omit it and the view
   * members of the hook's return value are inert.
   *
   * @example 'employee-grid'
   */
  storageKey?: string

  /**
   * Automatically apply URL filters when the component mounts and grid API becomes ready
   *
   * Also restores the active saved view when `storageKey` is set. URL filters
   * take precedence: a shared link should show the sender's filters rather than
   * the recipient's stored view.
   *
   * Default: false
   */
  autoApplyOnMount?: boolean

  /**
   * Whether the hook should be enabled when the grid API is ready
   *
   * Set to false and every operation goes inert, saved views included: no URL is
   * generated, no filters are applied, and no view is saved, loaded or deleted.
   * `views` still reflects what is in storage, since reading it has no effect on
   * the grid.
   *
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

  /**
   * Get filters in a specific format (useful for sharing/export)
   * @param format - The format to serialize to
   * @returns Serialized filter string
   */
  getFiltersAsFormat: (format: SerializationFormat) => string

  /**
   * Get the current serialization format
   * @returns The current format
   */
  getCurrentFormat: () => SerializationMode

  /**
   * Saved views for this grid, in save order.
   * Always an empty array when `storageKey` is not set.
   */
  views: GridView[]

  /**
   * Id of the view currently applied to the grid, or null when none is.
   *
   * This describes the live grid, not what is persisted. A stored view is only
   * applied on mount when `autoApplyOnMount` is set, so with it off this stays
   * null until `loadView` or `saveView` is called, even though a previous
   * session's view is still listed in `views`.
   */
  activeViewId: string | null

  /**
   * Saves the grid's current filters under a name and makes it active.
   *
   * The name is trimmed, and must not be empty. Names are unique: saving over an
   * existing name updates that view in place, keeping its id and list position,
   * so "load a view, adjust the filters, save under the same name" is how you
   * update one.
   *
   * @param name - Display name for the view
   * @returns The saved view, or null if it could not be saved. Every reason but
   *   one is reported through `onError`: an empty name, a failed write, and being
   *   called before the grid is ready or while the hook is disabled. The
   *   exception is `storageKey` not being set, which is silent because the
   *   feature was never switched on.
   */
  saveView: (name: string) => GridView | null

  /**
   * Applies a saved view's filters to the grid, or clears filters when passed
   * null. No-ops when `storageKey` is not set or the hook is disabled; use
   * `clearFilters` to reset filters independently of saved views.
   *
   * @param id - Id of the view to load, or null to reset to unfiltered
   */
  loadView: (id: string | null) => void

  /**
   * Deletes a saved view. Clears the grid's filters only if the grid still shows
   * exactly that view's filters, so hand-edited filters survive.
   *
   * Unlike `saveView` and `loadView`, this does not need the grid: it works
   * before the grid API resolves, since deleting only touches storage. No-ops
   * when `storageKey` is not set or the hook is disabled.
   *
   * @param id - Id of the view to delete
   */
  deleteView: (id: string) => void
}
