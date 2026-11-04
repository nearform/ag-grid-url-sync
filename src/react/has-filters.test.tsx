import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'
import {
  asGridApi,
  waitForEffects,
  createGridListeners
} from '../test-helpers.js'

// These tests use the real core (no module mocks), because the bug is in how
// the hook reads the URL that the core makes (#215).

const setPageUrl = (url: string) => {
  const parsed = new URL(url)
  window.location.href = parsed.href
  window.location.search = parsed.search
}

const createGridApi = (model: FilterModel) => {
  const listeners = createGridListeners()

  const api = {
    getFilterModel: vi.fn(() => model),
    setFilterModel: vi.fn(),
    onFilterChanged: vi.fn(),
    addEventListener: listeners.addEventListener,
    removeEventListener: listeners.removeEventListener
  }

  const fireFilterChanged = () =>
    act(() => listeners.fire('filterChanged', { source: 'api' }))

  return { api, fireFilterChanged }
}

describe('useAGGridUrlSync hasFilters (#215)', () => {
  test('is false when the page URL has only its own params', async () => {
    setPageUrl('https://example.com/?tab=1')
    const { api } = createGridApi({})

    const { result } = renderHook(() => useAGGridUrlSync(asGridApi(api)))

    await waitForEffects()

    expect(result.current.currentUrl).toContain('tab=1')
    expect(result.current.hasFilters).toBe(false)
  })

  test('is true when the grid has a filter', async () => {
    setPageUrl('https://example.com/?tab=1')

    const { api } = createGridApi({
      name: { filterType: 'text', type: 'contains', filter: 'john' }
    })

    const { result } = renderHook(() => useAGGridUrlSync(asGridApi(api)))

    await waitForEffects()

    expect(result.current.hasFilters).toBe(true)
  })

  test('goes back to false when the filters are cleared', async () => {
    setPageUrl('https://example.com/?tab=1')

    const model: FilterModel = {
      name: { filterType: 'text', type: 'contains', filter: 'john' }
    }

    const { api, fireFilterChanged } = createGridApi(model)

    const { result } = renderHook(() => useAGGridUrlSync(asGridApi(api)))

    await waitForEffects()
    expect(result.current.hasFilters).toBe(true)

    delete model.name
    fireFilterChanged()

    expect(result.current.hasFilters).toBe(false)
  })

  // The core reports a grid-read issue one time while it stays (#222,
  // design decision 5)
  test('reports a grid-read issue one time while it stays', async () => {
    const onParseError = vi.fn()

    const { api, fireFilterChanged } = createGridApi({
      age: { filterType: 'number', type: 'equals', filter: 'abc' }
    })

    renderHook(() => useAGGridUrlSync(asGridApi(api), { onParseError }))
    await waitForEffects()

    fireFilterChanged()
    fireFilterChanged()

    expect(onParseError).toHaveBeenCalledTimes(1)
  })

  test('reports a read issue again after it went away', async () => {
    const onParseError = vi.fn()

    const bad: FilterModel = {
      age: { filterType: 'number', type: 'equals', filter: 'abc' }
    }

    let model = bad
    const { api, fireFilterChanged } = createGridApi(bad)
    api.getFilterModel.mockImplementation(() => model)

    renderHook(() => useAGGridUrlSync(asGridApi(api), { onParseError }))
    await waitForEffects()

    model = {}
    fireFilterChanged()
    model = bad
    fireFilterChanged()

    expect(onParseError).toHaveBeenCalledTimes(2)
  })
})
