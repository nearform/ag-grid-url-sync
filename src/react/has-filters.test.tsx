import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, vi } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { useGridUrlSync } from './use-grid-url-sync.js'
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

describe('useGridUrlSync hasFilters (#215)', () => {
  test('is false when the page URL has only its own params', async () => {
    setPageUrl('https://example.com/?tab=1')
    const { api } = createGridApi({})

    const { result } = renderHook(() => useGridUrlSync({ api: asGridApi(api) }))

    await waitForEffects()

    expect(result.current.url).toContain('tab=1')
    expect(result.current.hasFilters).toBe(false)
  })

  test('is true when the grid has a filter', async () => {
    setPageUrl('https://example.com/?tab=1')

    const { api } = createGridApi({
      name: { filterType: 'text', type: 'contains', filter: 'john' }
    })

    const { result } = renderHook(() => useGridUrlSync({ api: asGridApi(api) }))

    await waitForEffects()

    expect(result.current.hasFilters).toBe(true)
  })

  test('goes back to false when the filters are cleared', async () => {
    setPageUrl('https://example.com/?tab=1')

    const model: FilterModel = {
      name: { filterType: 'text', type: 'contains', filter: 'john' }
    }

    const { api, fireFilterChanged } = createGridApi(model)

    const { result } = renderHook(() => useGridUrlSync({ api: asGridApi(api) }))

    await waitForEffects()
    expect(result.current.hasFilters).toBe(true)

    delete model.name
    fireFilterChanged()

    expect(result.current.hasFilters).toBe(false)
  })

  // hasFilters tells if the grid has a filter, also one that the URL does not
  // hold, so a "Clear" button with disabled={!hasFilters} works (#315)
  test.each<[string, FilterModel]>([
    [
      'a combined filter',
      {
        name: {
          filterType: 'text',
          operator: 'OR',
          conditions: [
            { filterType: 'text', type: 'contains', filter: 'ali' },
            { filterType: 'text', type: 'contains', filter: 'bob' }
          ]
        }
      }
    ],
    ['a set filter', { city: { filterType: 'set', values: ['Oslo'] } }],
    ['a custom filter', { score: { filterType: 'myFilter', min: 3 } }]
  ])('is true for %s that the URL does not hold', async (_name, model) => {
    setPageUrl('https://example.com/?tab=1')
    const { api } = createGridApi(model)

    const { result } = renderHook(() => useGridUrlSync({ api: asGridApi(api) }))

    await waitForEffects()

    expect(result.current.issues.map(issue => issue.code)).toEqual([
      'UNSUPPORTED_FILTER'
    ])
    expect(result.current.url).toBe('https://example.com/?tab=1')
    expect(result.current.hasFilters).toBe(true)
  })

  test('goes back to false when a set filter is cleared', async () => {
    setPageUrl('https://example.com/?tab=1')

    const model: FilterModel = {
      city: { filterType: 'set', values: ['Oslo'] }
    }

    const { api, fireFilterChanged } = createGridApi(model)

    const { result } = renderHook(() => useGridUrlSync({ api: asGridApi(api) }))

    await waitForEffects()
    expect(result.current.hasFilters).toBe(true)

    delete model.city
    fireFilterChanged()

    expect(result.current.hasFilters).toBe(false)
  })

  // The core reports a grid-read issue one time while it stays (#222,
  // design decision 5)
  test('reports a grid-read issue one time while it stays', async () => {
    const onIssue = vi.fn()

    const { api, fireFilterChanged } = createGridApi({
      age: { filterType: 'number', type: 'equals', filter: 'abc' }
    })

    renderHook(() => useGridUrlSync({ api: asGridApi(api), onIssue }))
    await waitForEffects()

    fireFilterChanged()
    fireFilterChanged()

    expect(onIssue).toHaveBeenCalledTimes(1)
  })

  test('reports a read issue again after it went away', async () => {
    const onIssue = vi.fn()

    const bad: FilterModel = {
      age: { filterType: 'number', type: 'equals', filter: 'abc' }
    }

    let model = bad
    const { api, fireFilterChanged } = createGridApi(bad)
    api.getFilterModel.mockImplementation(() => model)

    renderHook(() => useGridUrlSync({ api: asGridApi(api), onIssue }))
    await waitForEffects()

    model = {}
    fireFilterChanged()
    model = bad
    fireFilterChanged()

    expect(onIssue).toHaveBeenCalledTimes(2)
  })
})
