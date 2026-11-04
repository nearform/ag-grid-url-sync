import { StrictMode } from 'react'
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { GridOptions } from 'ag-grid-community'
import type { UseGridUrlSyncOptions } from './types.js'
import { useGridUrlSync } from './use-grid-url-sync.js'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'
import { createRealGrid, useRealLocation } from '../test-helpers.js'

// The React hooks and a URL that waits for the row data (#224): a new sync
// on the same grid (StrictMode, a new option) keeps the waiting URL.

const ROWS = [
  { zip: '01234', age: 30 },
  { zip: '9', age: 40 }
]

const AGE_30 = { age: { filterType: 'number', type: 'equals', filter: 30 } }

/** A grid with no rows yet: AG Grid infers the column types later */
function gridWithNoRows(gridOptions: Partial<GridOptions> = {}) {
  return createRealGrid({
    columnDefs: [{ field: 'zip' }, { field: 'age' }],
    defaultColDef: { filter: true },
    rowData: null,
    ...gridOptions
  })
}

/** AG Grid sends rowDataUpdated and filterChanged after the call returns */
const settle = () =>
  act(() => new Promise<void>(resolve => setTimeout(resolve)))

beforeEach(() => {
  useRealLocation('/?f_age_eq=30')
  vi.stubGlobal('reportError', vi.fn<(error: Error) => void>())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useGridUrlSync: a URL that waits for the row data', () => {
  it('applies it in StrictMode', async () => {
    const api = gridWithNoRows()
    renderHook(useGridUrlSync, { initialProps: { api }, wrapper: StrictMode })
    await settle()

    act(() => api.setGridOption('rowData', ROWS))
    await settle()

    expect(api.getFilterModel()).toEqual(AGE_30)
  })

  it('applies it after an option change', async () => {
    const api = gridWithNoRows()
    const initialProps: UseGridUrlSyncOptions = { api, history: 'none' }
    const hook = renderHook(useGridUrlSync, { initialProps })

    await settle()
    hook.rerender({ api, history: 'replace' })
    await settle()

    act(() => api.setGridOption('rowData', ROWS))
    await settle()

    expect(api.getFilterModel()).toEqual(AGE_30)
  })
})

describe('useAGGridUrlSync (deprecated): a URL that waits for the row data', () => {
  it('applies it in StrictMode', async () => {
    const api = gridWithNoRows()
    renderHook(() => useAGGridUrlSync(api, { autoApplyOnMount: true }), {
      wrapper: StrictMode
    })
    await settle()

    act(() => api.setGridOption('rowData', ROWS))
    await settle()

    expect(api.getFilterModel()).toEqual(AGE_30)
  })
})
