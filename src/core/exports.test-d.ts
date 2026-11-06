// Type-level tests for the public entry points (#226 D3). `npm run
// type-check` checks this file through tsconfig.typecheck.json. Vitest does
// not run it.
import { expectTypeOf } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import type { ViewState as ViewsEntryViewState } from './view-storage.js'
import type {
  GridUrlSync,
  GridUrlSyncOptions,
  GridUrlSyncSnapshot,
  UrlOptions,
  Codec,
  HistoryMode,
  SyncStatus,
  ApplyResult,
  IssueCode,
  IssueSeverity,
  IssueSource,
  IssueEvent,
  IssueDetails,
  FilterType,
  SerializationFormat,
  GridView,
  ViewState,
  ViewStore
} from '../index.js'
import type {
  UseGridUrlSyncOptions,
  UseGridUrlSyncResult
} from '../react/index.js'
// @ts-expect-error FilterState is internal
import type { FilterState } from '../index.js'

export type PublicTypes = [
  GridUrlSync,
  GridUrlSyncOptions,
  GridUrlSyncSnapshot,
  UrlOptions,
  Codec,
  HistoryMode,
  SyncStatus,
  ApplyResult,
  IssueCode,
  IssueSeverity,
  IssueSource,
  IssueEvent,
  IssueDetails,
  FilterType,
  SerializationFormat,
  GridView,
  ViewState,
  ViewStore,
  UseGridUrlSyncOptions,
  UseGridUrlSyncResult,
  FilterState
]

// A view store gets one state object, so later state fields reach a
// custom store with no new argument
expectTypeOf<ViewState>().toEqualTypeOf<{ filterModel: FilterModel }>()

expectTypeOf<Parameters<ViewStore['saveView']>>().toEqualTypeOf<
  [name: string, state: ViewState]
>()

expectTypeOf<GridView>().toMatchTypeOf<ViewState>()

expectTypeOf<ViewState>().toEqualTypeOf<ViewsEntryViewState>()
