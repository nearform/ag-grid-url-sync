import type { FilterModel, GridApi } from 'ag-grid-community'
import type {
  ApplyResult,
  GridUrlSyncOptions,
  GridUrlSyncSnapshot
} from '../core/types.js'
import type { GridView } from '../core/view-storage.js'

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
  /**
   * Writes an AG Grid filter model to the grid, as the app's own write. It
   * replaces the full model, as `setFilterModel` does (#225).
   */
  applyFilters: (model: FilterModel) => ApplyResult
  /** The URL with the grid's filters (default base: the address bar) */
  getUrl: (baseUrl?: string) => string
  /** Saves the grid's filters as a view, and makes it active */
  saveView: (name: string) => GridView | null
  /** Loads a saved view. `null` clears the filters. */
  loadView: (id: string | null) => void
  /** Deletes a saved view */
  deleteView: (id: string) => void
}
