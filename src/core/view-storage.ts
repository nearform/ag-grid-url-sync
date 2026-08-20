import type { FilterModel } from 'ag-grid-community'

/**
 * localStorage-backed store for named grid views.
 *
 * AG Grid's native filter model is stored verbatim rather than the library's
 * FilterState, so nothing is lost in translation: set filters, multi filters and
 * combined conditions all survive a round trip.
 *
 * Row selection, expanded groups and cell ranges are deliberately never stored.
 * They scale with row count rather than column count and are the only parts of
 * grid state large enough to threaten the ~5MB origin quota.
 */

/** Bump when the stored shape changes, so old blobs are discarded not misread. */
const SCHEMA_VERSION = 'v1'

const keyFor = (storageKey: string): string =>
  `ag-grid-url-sync:views:${SCHEMA_VERSION}:${storageKey}`

/**
 * A saved snapshot of a grid's filters.
 */
export interface GridView {
  /** Stable generated id */
  id: string
  /** User-supplied display name */
  name: string
  /** Epoch millis of the last write */
  updatedAt: number
  /** AG Grid's native filter model, stored as-is */
  filterModel: FilterModel
}

interface StoredShape {
  views: GridView[]
  activeId: string | null
}

/**
 * Read/write access to one grid's saved views.
 */
export interface ViewStore {
  /** All saved views, in save order */
  listViews(): GridView[]
  /** Id of the active view, or null */
  getActiveViewId(): string | null
  /**
   * Records which view is active.
   *
   * Named `persist…` rather than `set…` so it cannot be mistaken for a React
   * state setter: this writes storage and triggers no re-render.
   */
  persistActiveViewId(id: string | null): void
  /**
   * Saves a filter model under a name and makes it active.
   *
   * Names are unique and matched exactly after trimming, so saving over an
   * existing name updates that view in place — keeping its id and its position
   * in the list — rather than adding a duplicate label. That is what gives
   * "load, adjust, re-save" its update semantics without a separate method.
   *
   * A null or undefined filterModel is stored as an empty model, since that is
   * what AG Grid means by it and what getFilterModel returns in practice.
   *
   * @throws when the name is empty, or when the write fails — storage full,
   *   blocked by policy, or no DOM present
   */
  saveView(name: string, filterModel: FilterModel): GridView
  /** Deletes a view, clearing the active id if it pointed at that view */
  deleteView(id: string): void
}

/**
 * A fresh empty result for every degraded read.
 *
 * Deliberately a factory rather than a shared constant: listViews() hands its
 * array straight to callers, and a module-level sentinel would be one mutable
 * array shared by every store and every consumer of the ./view-storage subpath.
 */
const empty = (): StoredShape => ({ views: [], activeId: null })

function isGridView(value: unknown): value is GridView {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<GridView>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.updatedAt === 'number' &&
    typeof candidate.filterModel === 'object' &&
    candidate.filterModel !== null
  )
}

function createId(): string {
  // randomUUID needs a secure context; fall back so non-https hosts still work.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `view-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}

/**
 * Creates a store bound to one storage key.
 *
 * All reads degrade to an empty store rather than throwing: storage may be
 * absent (SSR), blocked by policy, or hold a corrupt or foreign blob. Writes do
 * throw, so callers can tell the user a view wasn't saved.
 */
export function createViewStore(storageKey: string): ViewStore {
  const key = keyFor(storageKey)

  const read = (): StoredShape => {
    if (typeof window === 'undefined') return empty()

    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      // Access itself throws when storage is disabled by policy.
      return empty()
    }

    if (!raw) return empty()

    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return empty()

      const { views, activeId } = parsed as Partial<StoredShape>
      const validViews = Array.isArray(views) ? views.filter(isGridView) : []

      return {
        views: validViews,
        activeId:
          typeof activeId === 'string' &&
          validViews.some(view => view.id === activeId)
            ? activeId
            : null
      }
    } catch {
      return empty()
    }
  }

  const write = (next: StoredShape): void => {
    // Reads degrade quietly so a server render can proceed, but a write cannot
    // succeed here and must not pretend to: returning normally would tell the
    // caller a view was saved when nothing was persisted.
    if (typeof window === 'undefined') {
      throw new Error('Browser storage is unavailable.')
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(next))
    } catch (error) {
      const isQuota =
        typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        (error.name === 'QuotaExceededError' ||
          error.name === 'NS_ERROR_DOM_QUOTA_REACHED')

      throw new Error(
        isQuota
          ? 'Browser storage is full. Delete a saved view and try again.'
          : 'Error writing to storage.',
        { cause: error }
      )
    }
  }

  return {
    listViews: () => read().views,

    getActiveViewId: () => read().activeId,

    persistActiveViewId: (id: string | null) => {
      write({ ...read(), activeId: id })
    },

    saveView: (name: string, filterModel: FilterModel): GridView => {
      const trimmedName = name.trim()
      if (!trimmedName) {
        throw new Error('A view name is required.')
      }

      const current = read()
      const existing = current.views.find(view => view.name === trimmedName)

      const view: GridView = {
        // Overwriting keeps the original id so anything holding a reference to
        // this view — an active pointer, a consumer's selection — stays valid.
        id: existing?.id ?? createId(),
        name: trimmedName,
        updatedAt: Date.now(),
        // Snapshot by value: the grid mutates its own model objects in place.
        // Coerced because getFilterModel returns null in practice despite its
        // type, and persisting that writes a blob isGridView later rejects — the
        // save would appear to succeed and the view would never load again.
        filterModel: structuredClone(filterModel ?? {})
      }

      write({
        // Replace in place so the view keeps its position in the list.
        views: existing
          ? current.views.map(candidate =>
              candidate.id === existing.id ? view : candidate
            )
          : [...current.views, view],
        activeId: view.id
      })
      return view
    },

    deleteView: (id: string) => {
      const current = read()
      write({
        views: current.views.filter(view => view.id !== id),
        activeId: current.activeId === id ? null : current.activeId
      })
    }
  }
}
