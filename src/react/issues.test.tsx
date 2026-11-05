import { Component, useEffect, type ReactNode } from 'react'
import { renderHook, render, act } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FilterModel, GridApi } from 'ag-grid-community'
import { useGridUrlSync } from './use-grid-url-sync.js'
import type { UseGridUrlSyncOptions, UseGridUrlSyncResult } from './types.js'
import { individual } from '../core/codecs.js'
import { createViewStore } from '../core/view-storage.js'
import {
  asGridApi,
  waitForEffects,
  createGridListeners
} from '../test-helpers.js'

// The hook's issues state and throwOnError (#229), on the real core

const LONG = 'a'.repeat(201)

const longText: FilterModel = {
  name: { filterType: 'text', type: 'contains', filter: LONG }
}

const createGridApi = (initial: FilterModel = {}) => {
  let model: FilterModel = initial
  const listeners = createGridListeners()

  const api = {
    getFilterModel: vi.fn(() => model),
    setFilterModel: vi.fn(),
    getColumn: vi.fn(() => ({
      isFilterAllowed: () => true,
      getColDef: () => ({ filter: 'agTextColumnFilter' })
    })),
    addEventListener: listeners.addEventListener,
    removeEventListener: listeners.removeEventListener
  }

  const fireFilterChanged = () =>
    act(() => listeners.fire('filterChanged', { source: 'api' }))

  const setModel = (next: FilterModel) => {
    model = next
  }

  return { api, fireFilterChanged, setModel }
}

/** Props for a hook test where the grid can change or go away */
interface GridProps {
  gridApi: GridApi | null
}

/** Keeps the error that its children throw */
class ErrorBoundary extends Component<
  { onError: (error: Error) => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: Error) {
    this.props.onError(error)
  }

  override render() {
    return this.state.failed ? null : this.props.children
  }
}

/** Renders the hook inside an error boundary, and gives its latest result */
function renderInBoundary(
  api: ReturnType<typeof createGridApi>['api'],
  options: Omit<UseGridUrlSyncOptions, 'api'>
) {
  const caught = vi.fn<(error: Error) => void>()
  let latest: UseGridUrlSyncResult | null = null

  function Probe({
    onResult
  }: {
    onResult: (result: UseGridUrlSyncResult) => void
  }) {
    const result = useGridUrlSync({ api: asGridApi(api), ...options })

    useEffect(() => onResult(result))

    return null
  }

  render(
    <ErrorBoundary onError={caught}>
      <Probe
        onResult={result => {
          latest = result
        }}
      />
    </ErrorBoundary>
  )

  return { caught, current: () => latest }
}

describe('useGridUrlSync issues (#229)', () => {
  beforeEach(() => {
    // React reports a caught render error to the console
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('has a value that the URL leaves out', async () => {
    const { api } = createGridApi(longText)

    const { result } = renderHook(() => useGridUrlSync({ api: asGridApi(api) }))
    await waitForEffects()

    expect(result.current.hasFilters).toBe(true)
    expect(result.current.issues).toHaveLength(1)
    expect(result.current.issues[0]).toMatchObject({
      code: 'VALUE_TOO_LONG',
      column: 'name'
    })
  })

  test('has the issues of applyUrl until the next clear', async () => {
    const { api, fireFilterChanged } = createGridApi()

    const { result } = renderHook(() => useGridUrlSync({ api: asGridApi(api) }))
    await waitForEffects()

    act(() => {
      result.current.applyUrl('?f_age_gt=abc')
    })

    expect(result.current.issues).toEqual([
      expect.objectContaining({ code: 'INVALID_NUMBER', column: 'age' })
    ])

    fireFilterChanged()

    expect(result.current.issues).toHaveLength(1)

    act(() => {
      result.current.applyFilters({})
    })

    expect(result.current.issues).toEqual([])
  })

  test('has INVALID_URL from applyUrl', async () => {
    const { api } = createGridApi()
    const onIssue = vi.fn()

    const { result } = renderHook(() =>
      useGridUrlSync({ api: asGridApi(api), onIssue })
    )

    await waitForEffects()

    act(() => {
      result.current.applyUrl('example.com?f_a_eq=1')
    })

    expect(result.current.issues).toEqual([
      expect.objectContaining({ code: 'INVALID_URL' })
    ])
    expect(onIssue).toHaveBeenCalledOnce()
  })

  test('a grid error during a filter change reaches onIssue one time', async () => {
    const { api, fireFilterChanged } = createGridApi()
    const onIssue = vi.fn()

    renderHook(() => useGridUrlSync({ api: asGridApi(api), onIssue }))

    await waitForEffects()

    api.getFilterModel.mockImplementation(() => {
      throw new Error('grid failed')
    })
    fireFilterChanged()

    expect(onIssue).toHaveBeenCalledOnce()
    expect(onIssue).toHaveBeenCalledWith({
      issue: expect.objectContaining({ code: 'GRID_ERROR' }),
      source: 'grid'
    })
  })

  test('has no GRID_ERROR (#284)', async () => {
    const { api, fireFilterChanged } = createGridApi()

    const { result } = renderHook(() =>
      useGridUrlSync({ api: asGridApi(api), onIssue: () => {} })
    )

    await waitForEffects()

    api.getFilterModel.mockImplementation(() => {
      throw new Error('grid failed')
    })
    fireFilterChanged()

    expect(result.current.issues).toEqual([])
  })

  test('keeps its identity when the content is the same', async () => {
    const { api, fireFilterChanged } = createGridApi(longText)

    const { result } = renderHook(() => useGridUrlSync({ api: asGridApi(api) }))
    await waitForEffects()

    const before = result.current.issues
    fireFilterChanged()
    fireFilterChanged()

    expect(before).toHaveLength(1)
    expect(result.current.issues).toBe(before)
  })

  test('throwOnError throws the issue in render, for an error boundary', async () => {
    const { api } = createGridApi()
    const onIssue = vi.fn()

    const { caught, current } = renderInBoundary(api, {
      throwOnError: true,
      onIssue
    })

    await waitForEffects()

    act(() => {
      current()?.applyUrl('?f_age_gt=abc')
    })

    expect(caught).toHaveBeenCalledOnce()
    expect(caught.mock.calls[0]?.[0]).toMatchObject({ code: 'INVALID_NUMBER' })
    expect(onIssue).toHaveBeenCalledOnce()
  })

  test('a throwOnError predicate throws only the issues it picks', async () => {
    const { api } = createGridApi()

    const { caught, current } = renderInBoundary(api, {
      throwOnError: issue => issue.code === 'VALUE_TOO_LONG'
    })

    await waitForEffects()

    act(() => {
      current()?.applyUrl('?f_age_gt=abc')
    })

    expect(caught).not.toHaveBeenCalled()
    expect(current()?.issues).toHaveLength(1)
  })

  test('the core never throws from an effect', async () => {
    const { api } = createGridApi(longText)

    const { caught } = renderInBoundary(api, { throwOnError: true })
    await waitForEffects()

    expect(caught).toHaveBeenCalledOnce()
    expect(caught.mock.calls[0]?.[0]).toMatchObject({ code: 'VALUE_TOO_LONG' })
  })

  test('a URL with a bad param still wins over a stored view with throwOnError', async () => {
    window.localStorage.clear()
    createViewStore('issues-key').saveView('Eng', {
      dept: { filterType: 'text', type: 'equals', filter: 'eng' }
    })
    Object.defineProperty(window.location, 'search', {
      value: '?f_name_contains=bob&f_age_gt=abc',
      configurable: true
    })
    Object.defineProperty(window.location, 'href', {
      value: 'https://example.com/?f_name_contains=bob&f_age_gt=abc',
      configurable: true
    })
    const { api } = createGridApi()

    const { caught } = renderInBoundary(api, {
      storageKey: 'issues-key',
      throwOnError: true
    })

    await waitForEffects()

    expect(api.setFilterModel).toHaveBeenCalledWith({
      name: { filterType: 'text', type: 'contains', filter: 'bob' }
    })
    expect(caught).toHaveBeenCalledOnce()
    expect(caught.mock.calls[0]?.[0]).toMatchObject({ code: 'INVALID_NUMBER' })
  })

  // issues describes the live grid only (#229 review)
  test('is empty when the grid goes away', async () => {
    const { api } = createGridApi(longText)

    const { result, rerender } = renderHook<UseGridUrlSyncResult, GridProps>(
      ({ gridApi }) => useGridUrlSync({ api: gridApi }),
      { initialProps: { gridApi: asGridApi(api) } }
    )

    await waitForEffects()

    expect(result.current.issues).toHaveLength(1)

    rerender({ gridApi: null })
    await waitForEffects()

    expect(result.current.hasFilters).toBe(false)
    expect(result.current.issues).toEqual([])
  })

  test('is empty when the hook is disabled', async () => {
    const { api } = createGridApi(longText)

    const { result, rerender } = renderHook(
      ({ enabled }) => useGridUrlSync({ api: asGridApi(api), enabled }),
      { initialProps: { enabled: true } }
    )

    await waitForEffects()

    expect(result.current.issues).toHaveLength(1)

    rerender({ enabled: false })
    await waitForEffects()

    expect(result.current.issues).toEqual([])
  })

  test('drops the apply issues of a grid that was replaced', async () => {
    const first = createGridApi()
    const second = createGridApi()

    const { result, rerender } = renderHook(
      ({ gridApi }) => useGridUrlSync({ api: gridApi }),
      { initialProps: { gridApi: asGridApi(first.api) } }
    )

    await waitForEffects()

    act(() => {
      result.current.applyUrl('?f_age_gt=abc')
    })

    expect(result.current.issues).toHaveLength(1)

    rerender({ gridApi: asGridApi(second.api) })
    await waitForEffects()

    expect(result.current.issues).toEqual([])
  })

  test('drops the apply issues when a stored view is restored (#285)', async () => {
    window.localStorage.clear()
    createViewStore('restore-b').saveView('Eng', {
      dept: { filterType: 'text', type: 'equals', filter: 'eng' }
    })
    const { api } = createGridApi()

    const { result, rerender } = renderHook(
      ({ storageKey }) => useGridUrlSync({ api: asGridApi(api), storageKey }),
      { initialProps: { storageKey: 'restore-a' } }
    )

    await waitForEffects()

    act(() => {
      result.current.applyUrl('?f_age_gt=abc')
    })

    expect(result.current.issues).toHaveLength(1)

    // A new namespace with a stored view: the new sync restores it
    rerender({ storageKey: 'restore-b' })
    await waitForEffects()

    expect(api.setFilterModel).toHaveBeenLastCalledWith({
      dept: { filterType: 'text', type: 'equals', filter: 'eng' }
    })
    expect(result.current.issues).toEqual([])
  })

  // A new sync on the same grid keeps the apply issues of the last one until
  // the next apply, view load or clear (#223 review, #271 decision 8)
  describe('a new sync on the same grid', () => {
    const BAD_URL = `?f_age_gt=abc&f_name_contains=${LONG}`

    const codes = (result: { current: UseGridUrlSyncResult }) =>
      result.current.issues.map(issue => issue.code)

    /** The hook with a codec prefix that a test can change */
    const renderWithPrefix = (
      api: ReturnType<typeof createGridApi>['api'],
      options: Omit<UseGridUrlSyncOptions, 'api' | 'codec'> = {}
    ) =>
      renderHook(
        ({ prefix }) =>
          useGridUrlSync({
            api: asGridApi(api),
            codec: individual({ prefix }),
            ...options
          }),
        { initialProps: { prefix: 'f_' } }
      )

    test('keeps the apply issues across a storageKey change', async () => {
      window.localStorage.clear()
      const { api } = createGridApi()

      const { result, rerender } = renderHook(
        ({ storageKey }) => useGridUrlSync({ api: asGridApi(api), storageKey }),
        { initialProps: { storageKey: 'carry-a' } }
      )

      await waitForEffects()

      act(() => {
        result.current.applyUrl(BAD_URL)
      })

      expect(codes(result)).toEqual(['INVALID_NUMBER', 'VALUE_TOO_LONG'])

      rerender({ storageKey: 'carry-b' })
      await waitForEffects()

      expect(codes(result)).toEqual(['INVALID_NUMBER', 'VALUE_TOO_LONG'])
    })

    test('keeps the apply issues across a codec change, until a clear', async () => {
      const { api } = createGridApi()
      const { result, rerender } = renderWithPrefix(api)
      await waitForEffects()

      act(() => {
        result.current.applyUrl('?f_age_gt=abc')
      })
      rerender({ prefix: 'g_' })
      await waitForEffects()

      expect(codes(result)).toEqual(['INVALID_NUMBER'])

      act(() => {
        result.current.applyFilters({})
      })

      expect(result.current.issues).toEqual([])
    })

    test('the next apply replaces the kept apply issues', async () => {
      const { api } = createGridApi()
      const { result, rerender } = renderWithPrefix(api)
      await waitForEffects()

      act(() => {
        result.current.applyUrl('?f_age_gt=abc')
      })
      rerender({ prefix: 'g_' })
      await waitForEffects()
      act(() => {
        result.current.applyUrl(`?g_name_contains=${LONG}`)
      })

      expect(codes(result)).toEqual(['VALUE_TOO_LONG'])
    })

    test('the kept apply issues keep their identity when the content is the same', async () => {
      const { api, fireFilterChanged } = createGridApi()
      const { result, rerender } = renderWithPrefix(api)
      await waitForEffects()

      act(() => {
        result.current.applyUrl('?f_age_gt=abc')
      })
      rerender({ prefix: 'g_' })
      await waitForEffects()

      const before = result.current.issues
      fireFilterChanged()
      fireFilterChanged()

      expect(before).toHaveLength(1)
      expect(result.current.issues).toBe(before)
    })

    test('a view load drops the kept apply issues', async () => {
      window.localStorage.clear()

      const view = createViewStore('carry-load').saveView('Eng', {
        name: { filterType: 'text', type: 'equals', filter: 'eng' }
      })

      // The view is stored, but no view is active on mount
      createViewStore('carry-load').persistActiveViewId(null)

      const { api } = createGridApi()

      const { result, rerender } = renderWithPrefix(api, {
        storageKey: 'carry-load'
      })

      await waitForEffects()

      act(() => {
        result.current.applyUrl('?f_age_gt=abc')
      })
      rerender({ prefix: 'g_' })
      await waitForEffects()
      act(() => result.current.loadView(view.id))

      expect(result.current.issues).toEqual([])
    })

    test('a view load that fails keeps the kept apply issues', async () => {
      window.localStorage.clear()
      const { api } = createGridApi()

      const { result, rerender } = renderWithPrefix(api, {
        storageKey: 'carry-missing',
        onIssue: () => {}
      })

      await waitForEffects()

      act(() => {
        result.current.applyUrl('?f_age_gt=abc')
      })
      rerender({ prefix: 'g_' })
      await waitForEffects()
      act(() => result.current.loadView('missing'))

      expect(codes(result)).toEqual(['INVALID_NUMBER'])
    })
  })
})
