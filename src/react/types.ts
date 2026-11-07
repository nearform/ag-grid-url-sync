import type { GridApi } from 'ag-grid-community'
import type {
  AGGridUrlSyncConfig,
  ApplyResult,
  FilterState,
  GridUrlSyncOptions,
  GridUrlSyncSnapshot,
  HistoryMode,
  SerializationFormat,
  SerializationMode,
  URLSyncError
} from '../core/types.js'
import type { GridView } from '../core/view-storage.js'

/**
 * Configuration options for the React hook
 *
 * @deprecated Use `useGridUrlSync` and its types. Removed in 0.6.0.
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
  storageKey?: string | undefined

  /**
   * Automatically apply URL filters when the component mounts and grid API becomes ready
   *
   * Also restores the active saved view when `storageKey` is set. URL filters
   * take precedence: a shared link should show the sender's filters rather than
   * the recipient's stored view.
   *
   * Attempted once per grid. A failed attempt is reported one time (a bad
   * filter through `onParseError`, any other failure through `onError`) and is
   * not retried on later renders; pass a new `gridApi`, or call
   * `applyUrlFilters`, to try again.
   *
   * Default: false
   */
  autoApplyOnMount?: boolean | undefined

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
  enabledWhenReady?: boolean | undefined

  /**
   * How a filter change goes to the address bar, as in `createGridUrlSync`
   * (#270). A user edit, a view load, `applyFilters` and `clearFilters`
   * write the URL. A URL apply (auto-apply, `applyUrlFilters`, the back
   * button) writes nothing, because the URL holds those filters already.
   * `'replace'` and `'push'` use `window.history`. A function gets the URL
   * and a `HistoryWrite` (`{ replace }`), for a router: a new function on a
   * later render is used, and makes no new sync.
   *
   * Default: 'none'
   */
  history?: HistoryMode | undefined

  /**
   * Apply the URL when the browser's back or forward button changes it.
   *
   * Default: true when `history` is `'push'`, else false
   */
  popstate?: boolean | undefined

  /**
   * Optional handler for operation failures: an operation called before the
   * grid is ready (`NOT_READY`), a grid API error (`GRID_ERROR`), a saved view
   * that is not found or cannot be stored (`VIEW_*`, `STORAGE_*`). `context`
   * names the operation, for example `'apply-url-filters'`.
   *
   * Each failure reaches one callback only (#220). A filter that is dropped or
   * not valid goes to `onParseError`, not here. The hook never writes to the
   * console, so a failure with no handler is silent.
   */
  onError?: ((error: Error, context: string) => void) | undefined
}

/**
 * Return type for the useAGGridUrlSync hook
 *
 * @deprecated Use `useGridUrlSync` and its types. Removed in 0.6.0.
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
   * Whether the grid has filters that the library supports.
   *
   * Comes from the grid's filter state, not from the URL, because the URL also
   * keeps the page's own params. A filter that the URL cannot carry (for
   * example a text value over `maxValueLength`) still counts, so a "clear
   * filters" button stays enabled. The URL leaves that filter out, reports it
   * through `onParseError`, and puts it in `issues`.
   */
  hasFilters: boolean

  /**
   * The filters that were dropped (#229): the data issues of the latest URL
   * apply (`applyUrlFilters`, `applyFilters`, auto-apply), and of the latest
   * URL write (each filter change). Each one is a `URLSyncError` with a
   * `code` and, when it is known, a `column`. The apply issues stay until the
   * next apply, `clearFilters` or `loadView`.
   *
   * The array keeps its identity while its content does not change. Operation
   * failures (`NOT_READY`, `GRID_ERROR`, storage) go to `onError` and are not
   * here. With `throwOnError`, the hook throws a picked issue during render.
   */
  issues: readonly URLSyncError[]

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
   * The serialization mode of the URL: `'individual'` or `'grouped'`
   */
  getSerializationMode: () => SerializationMode

  /**
   * The serialization mode of the URL. The name is wrong: it returns the
   * mode, not the format.
   * @deprecated Use `getSerializationMode`. Removed in 0.6.0.
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
   *
   * It goes back to null as soon as the grid stops showing that view, which
   * includes routes that never mention views: `clearFilters`, `applyFilters`,
   * `applyUrlFilters`, and the user editing a filter in the grid's own UI. That
   * also clears the stored pointer, so `autoApplyOnMount` will not restore the
   * view on the next load either - filtering away from a view is treated as
   * leaving it, not as a detour back to it.
   *
   * "Showing" means the model the grid reported once the view was applied, not
   * the stored one. A view AG Grid normalises on the way in, such as one naming
   * a column the grid no longer has, stays loaded and keeps its stored pointer.
   * A write AG Grid defers is recognised when it lands by the event's
   * `source: 'api'`. On versions that report no source, a deferred view the
   * grid also normalises unloads when it lands.
   *
   * Replacing `gridApi` clears this too, since nothing has been applied to the
   * new grid yet, but leaves the stored pointer alone: with `autoApplyOnMount`
   * the view is restored against the new grid and this becomes non-null again.
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
   * @returns The saved view, or null if it could not be saved. An empty name, a
   *   failed write, and being called before the grid is ready are all reported
   *   through `onError`. Silent when `storageKey` is not set or the hook is
   *   disabled, since the feature was switched off by configuration rather than
   *   having failed.
   */
  saveView: (name: string) => GridView | null

  /**
   * Applies a saved view's filters to the grid, or clears filters when passed
   * null. Use `clearFilters` to reset filters independently of saved views.
   *
   * Silent when `storageKey` is not set or the hook is disabled; reports through
   * `onError` when called before the grid is ready, or when the id is not found.
   *
   * @param id - Id of the view to load, or null to reset to unfiltered
   */
  loadView: (id: string | null) => void

  /**
   * Deletes a saved view. Clears the grid's filters only if the grid still shows
   * exactly that view's filters, so hand-edited filters survive.
   *
   * Unlike `saveView` and `loadView`, this does not need the grid: it works
   * before the grid API resolves, since deleting only touches storage, so it
   * never reports a not-ready error. Silent when `storageKey` is not set or the
   * hook is disabled.
   *
   * @param id - Id of the view to delete
   */
  deleteView: (id: string) => void
}

// ============================================================================
// useGridUrlSync, the 0.6.0 hook (#271)
// ============================================================================

/**
 * The options of `useGridUrlSync`: the options of `createGridUrlSync`, with
 * the grid's `api` that can be null while the grid starts, and the React
 * options. An option can change after mount.
 */
export interface UseGridUrlSyncOptions extends Omit<
  GridUrlSyncOptions,
  'api' | 'views'
> {
  /** The AG Grid API, or null while the grid starts */
  api: GridApi | null | undefined
  /**
   * Enables saved views, kept in localStorage under this key. Two grids on
   * the same origin need two keys. With no key, `views` is empty and the
   * view methods do nothing.
   */
  storageKey?: string | undefined
  /**
   * With `false`, the hook makes no sync: the state is idle, and a method
   * reports `NOT_READY`. `views` still shows what is in storage.
   * @default true
   */
  enabled?: boolean | undefined
}

/**
 * The result of `useGridUrlSync`: the sync's snapshot and its methods. The
 * object stays the same until a snapshot value changes, and the methods
 * never change.
 */
export interface UseGridUrlSyncResult extends GridUrlSyncSnapshot {
  /** Applies the filters of a URL (default: the address bar) to the grid */
  applyUrl: (url?: string) => ApplyResult
  /** Applies filters to the grid, as the app's own write */
  applyFilters: (filters: FilterState) => ApplyResult
  /** The URL with the grid's filters (default base: the address bar) */
  getUrl: (baseUrl?: string) => string
  /** Saves the grid's filters as a view, and makes it active */
  saveView: (name: string) => GridView | null
  /** Loads a saved view. `null` clears the filters. */
  loadView: (id: string | null) => void
  /** Deletes a saved view */
  deleteView: (id: string) => void
}
