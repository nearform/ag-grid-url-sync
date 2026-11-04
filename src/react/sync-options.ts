import type { GridApi } from 'ag-grid-community'
import type {
  AGGridUrlSyncConfig,
  GridUrlSyncOptions,
  HistoryMode,
  IssueEvent
} from '../core/types.js'
import type { ViewStore } from '../core/view-storage.js'
import { codecFromOptions } from '../core/codecs.js'
import { resolveOptions } from '../core/options.js'

// The hook's sync options (#222). The hook takes the old config shape, and
// its sync is made from it.

/** The address-bar options of the hook's sync (#270) */
export interface AddressBarOptions {
  history: HistoryMode
  popstate: boolean | undefined
}

/** The default: the sync never writes history and never follows popstate */
export const NO_ADDRESS_BAR: AddressBarOptions = {
  history: 'none',
  popstate: false
}

/**
 * The createGridUrlSync options for the hook. The hook's sync never throws.
 * It writes history and follows popstate only with the hook's options
 * (#270). It applies the URL on create only when the hook asks for it
 * (auto-apply with saved views, #223).
 */
export function gridUrlSyncOptions(
  api: GridApi,
  options: AGGridUrlSyncConfig,
  onIssue: (event: IssueEvent) => void,
  views?: ViewStore,
  applyUrlOnCreate = false,
  addressBar: AddressBarOptions = NO_ADDRESS_BAR
): GridUrlSyncOptions {
  const resolved = resolveOptions(options)

  // All four settings, so the URL strips the param names that the app set
  // for both modes, as the class does (#222 review)
  const codec = codecFromOptions(resolved)

  return {
    api,
    codec,
    maxValueLength: resolved.maxValueLength,
    history: addressBar.history,
    popstate: addressBar.popstate,
    applyUrlOnCreate,
    throwOnError: false,
    onIssue,
    views
  }
}
