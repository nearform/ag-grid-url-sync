import { act } from '@testing-library/react'
import { vi, type Mock } from 'vitest'
import type {
  ColDef,
  FilterModel,
  GridApi,
  GridOptions
} from 'ag-grid-community'
import {
  createGrid,
  ModuleRegistry,
  AllCommunityModule
} from 'ag-grid-community'
import { setTimeout } from 'timers/promises'

/**
 * Helper function to wait for React effects to complete in tests.
 * This is commonly needed when testing React hooks that have async effects.
 *
 * @example
 * ```typescript
 * import { waitForEffects } from '../test-helpers'
 *
 * test('my test', async () => {
 *   const { result } = renderHook(() => useMyHook())
 *   await waitForEffects()
 *   expect(result.current.isReady).toBe(true)
 * })
 * ```
 */
export const waitForEffects = () => act(() => setTimeout(0))

/**
 * Helper function to wait for multiple effect cycles.
 * Useful when you need to wait for multiple async operations to complete.
 *
 * @param cycles - Number of effect cycles to wait for (default: 2)
 */
export const waitForMultipleEffects = async (cycles: number = 2) => {
  for (let i = 0; i < cycles; i++) {
    await waitForEffects()
  }
}

/**
 * A filterChanged listener as the hook registers it. It reads only the
 * event's source, and a fake can call it with no event.
 */
export type FilterChangedListener = (event?: { source?: string }) => void

/**
 * The listener methods of a grid fake, with a registry. The hook and its
 * sync both listen to the grid (#222), so a fake must call every live
 * listener of an event, not only the newest one.
 */
export interface GridListeners {
  addEventListener: Mock<
    (event: string, listener: FilterChangedListener) => void
  >
  removeEventListener: Mock<
    (event: string, listener: FilterChangedListener) => void
  >
  /** Calls every live listener of the event, in the order they were added */
  fire(event: string, payload?: { source?: string }): void
  /** The number of live listeners of the event */
  count(event: string): number
}

export function createGridListeners(): GridListeners {
  const live = new Map<string, FilterChangedListener[]>()

  const listenersOf = (event: string): FilterChangedListener[] =>
    live.get(event) ?? []

  return {
    addEventListener: vi.fn(
      (event: string, listener: FilterChangedListener) => {
        live.set(event, [...listenersOf(event), listener])
      }
    ),
    removeEventListener: vi.fn(
      (event: string, listener: FilterChangedListener) => {
        const list = listenersOf(event)
        const at = list.indexOf(listener)

        if (at >= 0)
          live.set(
            event,
            list.filter((_, index) => index !== at)
          )
      }
    ),
    fire(event, payload) {
      // add and remove make a new array, so a listener that removes itself
      // does not change the list that this loop reads
      for (const listener of listenersOf(event)) listener(payload)
    },
    count: event => listenersOf(event).length
  }
}

/**
 * A column as the library reads it: the hook calls isFilterAllowed, and the
 * core reads the filter and the cell data type from getColDef
 */
export interface ColumnFake {
  isFilterAllowed?(): boolean
  getColDef?(): Pick<ColDef, 'filter' | 'cellDataType'>
}

/**
 * A test fake for AG Grid's GridApi: only the methods that the library calls,
 * typed as the library calls them. A test can leave out a method that its code
 * path does not call.
 */
export interface GridApiFake {
  /** AG Grid can return null here, though its type says FilterModel */
  getFilterModel?(): FilterModel | null
  setFilterModel?(model: FilterModel | null): void
  addEventListener?(event: string, listener: FilterChangedListener): void
  removeEventListener?(event: string, listener: FilterChangedListener): void
  getColumn?(colId: string): ColumnFake | null
}

/**
 * The fake as the GridApi that the library takes.
 *
 * @example
 * ```typescript
 * const api = { getFilterModel: vi.fn(() => ({})), setFilterModel: vi.fn() }
 * new AGGridUrlSync(asGridApi(api))
 * ```
 */
export function asGridApi(fake: GridApiFake): GridApi {
  // SAFETY: the library calls only the GridApiFake methods of a GridApi, in
  // the ways that GridApiFake types them: it listens only for filterChanged
  // and reads only the event's source, and it calls only the ColumnFake
  // methods of a column. A test leaves a method out only when its code path
  // does not call it; a call to a missing method throws a TypeError, which
  // fails the test (or, in getColDef's case, gives the text filter type that
  // detectColumnFilterType falls back to).
  return fake as GridApi
}

/**
 * A grid fake with a typed spy for each method that the core calls. A test
 * sets the results it needs, for example
 * `api.getColumn.mockReturnValue({ getColDef: () => ({ filter: 'agDateColumnFilter' }) })`.
 */
export const createGridApiSpies = () => ({
  getFilterModel: vi.fn<() => FilterModel | null>(),
  setFilterModel: vi.fn<(model: FilterModel | null) => void>(),
  getColumn: vi.fn<(colId: string) => ColumnFake | null>()
})

// ============================================================================
// Real grid and real location (#221)
// ============================================================================

const realLocation = window.location

/**
 * Puts back jsdom's real `window.location` for one test. test-setup.ts mocks
 * it with a plain object, and `history.pushState` and `popstate` need the
 * real one. Call it in a `beforeEach`, then set the page with
 * `history.replaceState`.
 */
export function useRealLocation(path = '/'): void {
  Object.defineProperty(window, 'location', {
    value: realLocation,
    writable: true,
    configurable: true
  })
  window.history.replaceState(null, '', path)
}

/** A real AG Grid in jsdom with a text column `name` and a number column `age` */
export function createRealGrid(
  gridOptions: Partial<GridOptions> = {}
): GridApi {
  ModuleRegistry.registerModules([AllCommunityModule])
  const div = document.createElement('div')
  document.body.append(div)

  return createGrid(div, {
    columnDefs: [
      { field: 'name', filter: 'agTextColumnFilter' },
      { field: 'age', filter: 'agNumberColumnFilter' }
    ],
    rowData: [
      { name: 'john', age: 30 },
      { name: 'jane', age: 40 }
    ],
    ...gridOptions
  })
}

// ============================================================================
// Grid timings (#273)
// ============================================================================

/**
 * When a grid fake takes a setFilterModel call, and when it sends
 * filterChanged (measured and named in #269):
 * - `'in-call'`: the model changes at once, and the event comes inside the
 *   call (older AG Grid).
 * - `'event-later'`: the model changes at once, and the event comes one tick
 *   later (AG Grid 36).
 * - `'deferred'`: the model and the event come one tick later (AG Grid while
 *   it resolves column types or filter components). Until then
 *   getFilterModel gives the old model.
 */
export type GridTiming = 'in-call' | 'event-later' | 'deferred'

export const GRID_TIMINGS: readonly GridTiming[] = [
  'in-call',
  'event-later',
  'deferred'
]

/** The columns of a timed grid. It drops the filters of other columns. */
const TIMED_COLUMNS = new Map([
  ['name', 'agTextColumnFilter'],
  ['age', 'agNumberColumnFilter'],
  ['status', 'agSetColumnFilter']
])

export interface TimedGrid {
  api: GridApi
  /** The user changes the filters in the grid's UI */
  userEdit(model: FilterModel): void
  /**
   * The app's own setFilterModel that lands at once, with any timing: an
   * 'api' change while a deferred write of the sync is still pending
   */
  apiEdit(model: FilterModel): void
}

/** A key for a model that does not depend on the order of its columns */
function modelKey(model: FilterModel): string {
  return JSON.stringify(
    Object.entries(model).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  )
}

/**
 * A model as a real AG Grid rebuilds it: each column's keys in another order,
 * and a number filter given as a string comes back as a number
 */
function rebuildModel(model: FilterModel): FilterModel {
  return Object.fromEntries(
    Object.entries(model).map(([colId, column]) => {
      const rebuilt =
        column.filterType === 'number' && 'filter' in column
          ? { ...column, filter: Number(column.filter) }
          : column

      return [colId, Object.fromEntries(Object.entries(rebuilt).reverse())]
    })
  )
}

export interface TimedGridOptions {
  /** The grid rebuilds each model that it takes, as a real AG Grid does */
  normalize?: boolean | undefined
}

/**
 * A grid fake with state and a timing. Like AG Grid, it sends no
 * filterChanged when the model does not change.
 */
export function createTimedGrid(
  timing: GridTiming,
  initial: FilterModel = {},
  options: TimedGridOptions = {}
): TimedGrid {
  const listeners = createGridListeners()
  let current: FilterModel = { ...initial }

  /** Takes the model. False when nothing changed, so no event is sent. */
  const take = (model: FilterModel): boolean => {
    const next = options.normalize ? rebuildModel(model) : model

    if (modelKey(next) === modelKey(current)) return false

    current = next

    return true
  }

  const fire = (source: string): void =>
    listeners.fire('filterChanged', { source })

  const later = (run: () => void): void => {
    globalThis.setTimeout(run, 0)
  }

  const api = asGridApi({
    getFilterModel: () => ({ ...current }),
    setFilterModel(next) {
      const accepted = Object.fromEntries(
        Object.entries(next ?? {}).filter(([colId]) => TIMED_COLUMNS.has(colId))
      )

      if (timing === 'deferred') {
        later(() => {
          if (take(accepted)) fire('api')
        })

        return
      }

      if (!take(accepted)) return

      if (timing === 'in-call') {
        fire('api')
      } else {
        later(() => fire('api'))
      }
    },
    getColumn(colId) {
      const filter = TIMED_COLUMNS.get(colId)

      return filter
        ? { isFilterAllowed: () => true, getColDef: () => ({ filter }) }
        : null
    },
    addEventListener: listeners.addEventListener,
    removeEventListener: listeners.removeEventListener
  })

  return {
    api,
    userEdit(model) {
      if (take({ ...model })) fire('columnFilter')
    },
    apiEdit(model) {
      if (take({ ...model })) fire('api')
    }
  }
}
