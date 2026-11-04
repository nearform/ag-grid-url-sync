import type { GridApi } from 'ag-grid-community'
import type {
  AGGridUrlSyncConfig,
  GridUrlSyncOptions,
  IssueEvent
} from '../core/types.js'
import type { ViewStore } from '../core/view-storage.js'
import { codecFromOptions } from '../core/codecs.js'
import { resolveOptions } from '../core/options.js'

// The hook's sync options (#222). The hook takes the old config shape, and
// its sync is made from it.

/**
 * The createGridUrlSync options for the hook. The hook's sync never writes
 * history, follows popstate or throws. It applies the URL on create only when
 * the hook asks for it (auto-apply with saved views, #223).
 */
export function gridUrlSyncOptions(
  api: GridApi,
  options: AGGridUrlSyncConfig,
  onIssue: (event: IssueEvent) => void,
  views?: ViewStore,
  applyUrlOnCreate = false
): GridUrlSyncOptions {
  const resolved = resolveOptions(options)

  // All four settings, so the URL strips the param names that the app set
  // for both modes, as the class does (#222 review)
  const codec = codecFromOptions(resolved)

  return {
    api,
    codec,
    maxValueLength: resolved.maxValueLength,
    history: 'none',
    popstate: false,
    applyUrlOnCreate,
    throwOnError: false,
    onIssue,
    views
  }
}
