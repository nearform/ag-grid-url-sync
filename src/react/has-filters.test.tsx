import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import type { FilterModel, GridApi } from 'ag-grid-community'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'
import { waitForEffects } from '../test-helpers.js'

// These tests use the real core (no module mocks), because the bug is in how
// the hook reads the URL that the core makes (#215).

type FilterChangedListener = (event?: { source?: string }) => void

const setPageUrl = (url: string) => {
  const parsed = new URL(url)
  window.location.href = parsed.href
  window.location.search = parsed.search
}

const createGridApi = (model: FilterModel) => {
  let listener: FilterChangedListener | undefined

  const api = {
    getFilterModel: vi.fn(() => model),
    setFilterModel: vi.fn(),
    onFilterChanged: vi.fn(),
    addEventListener: vi.fn((_: string, fn: FilterChangedListener) => {
      listener = fn
    }),
    removeEventListener: vi.fn()
  }

  const fireFilterChanged = () => act(() => listener?.({ source: 'api' }))

  return { api, fireFilterChanged }
}

describe('useAGGridUrlSync hasFilters (#215)', () => {
  test('is false when the page URL has only its own params', async () => {
    setPageUrl('https://example.com/?tab=1')
    const { api } = createGridApi({})

    const { result } = renderHook(() =>
      useAGGridUrlSync(api as unknown as GridApi)
    )

    await waitForEffects()

    expect(result.current.currentUrl).toContain('tab=1')
    expect(result.current.hasFilters).toBe(false)
  })

  test('is true when the grid has a filter', async () => {
    setPageUrl('https://example.com/?tab=1')

    const { api } = createGridApi({
      name: { filterType: 'text', type: 'contains', filter: 'john' }
    })

    const { result } = renderHook(() =>
      useAGGridUrlSync(api as unknown as GridApi)
    )

    await waitForEffects()

    expect(result.current.hasFilters).toBe(true)
  })

  test('goes back to false when the filters are cleared', async () => {
    setPageUrl('https://example.com/?tab=1')

    const model: FilterModel = {
      name: { filterType: 'text', type: 'contains', filter: 'john' }
    }

    const { api, fireFilterChanged } = createGridApi(model)

    const { result } = renderHook(() =>
      useAGGridUrlSync(api as unknown as GridApi)
    )

    await waitForEffects()
    expect(result.current.hasFilters).toBe(true)

    delete model.name
    fireFilterChanged()

    expect(result.current.hasFilters).toBe(false)
  })

  test('reads the grid one time for each filter change', async () => {
    // An unsupported operation is reported each time the grid is read, so
    // the count shows how many times updateState read it
    const onParseError = vi.fn()

    const { api, fireFilterChanged } = createGridApi({
      age: { filterType: 'number', type: 'unknownOperation', filter: 1 }
    })

    renderHook(() =>
      useAGGridUrlSync(api as unknown as GridApi, { onParseError })
    )
    await waitForEffects()

    onParseError.mockClear()
    fireFilterChanged()

    expect(onParseError).toHaveBeenCalledTimes(1)
  })
})
