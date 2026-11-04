// The 0.6.0 hook (#271)
export { useGridUrlSync } from './use-grid-url-sync.js'

// Deprecated: use useGridUrlSync. Removed in 0.6.0.
export { useAGGridUrlSync } from './use-ag-grid-url-sync.js'

export type {
  UseGridUrlSyncOptions,
  UseGridUrlSyncResult,
  UseAGGridUrlSyncOptions,
  UseAGGridUrlSyncReturn
} from './types.js'

// Saved views (enabled via the storageKey option)
export type { GridView } from '../core/view-storage.js'

// Re-export core types that React users might need
export type {
  FilterState,
  ColumnFilter,
  FilterOperation,
  AGGridUrlSyncConfig,
  GridApi,
  HistoryMode
} from '../core/types.js'
