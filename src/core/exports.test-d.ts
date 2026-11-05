// Type-level tests for the public entry points (#226 D3). `npm run
// type-check` checks this file through tsconfig.typecheck.json. Vitest does
// not run it.
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
  ViewStore,
  UseGridUrlSyncOptions,
  UseGridUrlSyncResult,
  FilterState
]
