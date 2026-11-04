// The decision logic for the sync's own grid writes (#273, #223). It is pure:
// no grid, no window. The sync keeps one record and asks these functions what
// the record means after a call and at each filterChanged.

import type { FilterModel } from 'ag-grid-community'
import type { FilterState } from './types.js'

/** What a write is. It decides the key form and the history write at the landing. */
export type WriteKind = 'url' | 'view' | 'restore' | 'app'

/** Per-column values: a FilterState ('url') or an AG Grid model (the others) */
export type Columns = Readonly<FilterState> | Readonly<FilterModel>

/**
 * The sync's own latest grid write. It is set before setFilterModel, because
 * AG Grid can send filterChanged inside the call, after it, or one tick later.
 * - `writing`: inside the call, so an event is the write landing.
 * - `pending`: the grid did not take the write yet (deferred). `before` is
 *   the grid's columns before the write, and `accepted` the part of the write
 *   that the grid has columns for. A model write also has `acceptedUrlKey`:
 *   the URL form of `accepted`, because the grid can rebuild a model.
 * - `landed`: the grid shows the write with this key. An event with the same
 *   key is the write's echo: one write can cause more than one event.
 */
export type OwnWrite =
  | { readonly phase: 'writing'; readonly kind: WriteKind }
  | {
      readonly phase: 'pending'
      readonly kind: WriteKind
      readonly before: Columns | null
      readonly beforeKey: string | null
      readonly accepted: Columns
      readonly acceptedKey: string
      readonly acceptedUrlKey?: string | undefined
    }
  | { readonly phase: 'landed'; readonly kind: WriteKind; readonly key: string }

export interface AfterCall {
  readonly kind: WriteKind
  /** The grid threw */
  readonly failed: boolean
  /** The key of the grid after the call. Null: the grid could not be read. */
  readonly afterKey: string | null
  readonly before: Columns | null
  readonly beforeKey: string | null
  readonly accepted: Columns
  readonly acceptedKey: string
  /** A model write: the URL form of `accepted` */
  readonly acceptedUrlKey?: string | undefined
}

export interface Settled {
  readonly own: OwnWrite | null
  readonly landed: boolean
}

export interface Classified {
  readonly own: OwnWrite | null
  readonly kind: EventKind
  readonly write: WriteKind | null
}

/** After the sync's setFilterModel returns. `landed`: the write is on the grid now. */
export function settleWrite(own: OwnWrite | null, call: AfterCall): Settled {
  // The grid threw, so nothing was written
  if (call.failed) return { own: null, landed: false }

  // An event inside the call landed it
  if (own?.phase === 'landed') {
    return {
      own: { phase: 'landed', kind: call.kind, key: call.afterKey ?? own.key },
      landed: true
    }
  }

  // The grid shows the write now (also a write that changed nothing, for
  // which AG Grid sends no event), or the grid took it in a form of its own.
  // A grid that cannot be read gives no proof, so the write stays pending.
  if (
    call.afterKey !== null &&
    (call.afterKey === call.acceptedKey ||
      (call.beforeKey !== null && call.afterKey !== call.beforeKey))
  ) {
    return {
      own: { phase: 'landed', kind: call.kind, key: call.afterKey },
      landed: true
    }
  }

  return {
    own: {
      phase: 'pending',
      kind: call.kind,
      before: call.before,
      beforeKey: call.beforeKey,
      accepted: call.accepted,
      acceptedKey: call.acceptedKey,
      acceptedUrlKey: call.acceptedUrlKey
    },
    landed: false
  }
}

/**
 * - `echo`: the same grid state as the record (or the state from before the
 *   write, while the write is pending).
 * - `landing`: the pending write lands now.
 * - `change`: anything else. The record ends.
 */
export type EventKind = 'echo' | 'landing' | 'change'

/**
 * A filterChanged outside the call. `key` and `live` are in the form of
 * `own.kind`. For a pending model write, `urlKey` is the URL form of `live`.
 */
export function classifyEvent(
  own: OwnWrite | null,
  event: {
    key: string
    live: Columns
    source: string | undefined
    urlKey?: string | undefined
  }
): Classified {
  if (own?.phase === 'landed' && event.key === own.key) {
    return { own, kind: 'echo', write: own.kind }
  }

  if (own?.phase === 'pending') {
    // The grid still shows the state from before the write
    if (own.beforeKey !== null && event.key === own.beforeKey) {
      return { own, kind: 'echo', write: own.kind }
    }

    // The write lands. An API change that shows the write's columns for
    // some columns, and the columns from before for the others, is a write
    // that the grid took only part of. A user's edit in the grid's UI has
    // another source. A model that the grid rebuilt (its own key order, a
    // number for a string) has the URL form of the write.
    if (
      event.key === own.acceptedKey ||
      (event.source === 'api' &&
        couldBeLanding(event.live, own.accepted, own.before)) ||
      rebuiltLanding(own, event)
    ) {
      return {
        own: { phase: 'landed', kind: own.kind, key: event.key },
        kind: 'landing',
        write: own.kind
      }
    }
  }

  return { own: null, kind: 'change', write: null }
}

/**
 * Whether a pending model write lands in a form that the grid made of it:
 * the URL form is the write's, and the grid does not show the model from
 * before the write
 */
function rebuiltLanding(
  own: Extract<OwnWrite, { phase: 'pending' }>,
  event: { key: string; urlKey?: string | undefined }
): boolean {
  return (
    own.acceptedUrlKey !== undefined &&
    event.urlKey === own.acceptedUrlKey &&
    event.key !== own.beforeKey
  )
}

/**
 * A key for per-column values that depends on no key order, at any level.
 * The grid can rebuild a column's model with its keys in another order.
 */
export function modelKey(columns: Columns): string {
  return stableJson(columns)
}

/** JSON with the keys of each object sorted */
function stableJson(value: Columns | Columns[string]): string {
  return JSON.stringify(value, (_key, part) =>
    part instanceof Object && !Array.isArray(part)
      ? Object.fromEntries(
          Object.entries(part).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        )
      : part
  )
}

/**
 * Whether the grid's columns could be a write landing in which the grid took
 * only part of the write: each column has the write's value, or the value
 * that the grid had before. At least one column must be the write's, so a
 * clear-all or another value is a change, not the landing (#274 review).
 */
export function couldBeLanding(
  live: Columns,
  accepted: Columns,
  before: Columns | null
): boolean {
  const columns = Object.keys(live)

  const fromWrite = (colId: string): boolean =>
    Object.hasOwn(accepted, colId) &&
    stableJson(live[colId]) === stableJson(accepted[colId])

  const fromBefore = (colId: string): boolean =>
    before !== null &&
    Object.hasOwn(before, colId) &&
    stableJson(live[colId]) === stableJson(before[colId])

  return (
    columns.some(fromWrite) &&
    columns.every(colId => fromWrite(colId) || fromBefore(colId))
  )
}
