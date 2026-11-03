import { act } from '@testing-library/react'
import { vi } from 'vitest'
import type { ColDef, FilterModel, GridApi } from 'ag-grid-community'
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
