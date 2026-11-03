import { Component, useEffect, type ReactNode } from 'react'
import { renderHook, render, act } from '@testing-library/react'
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import type { FilterModel, GridApi } from 'ag-grid-community'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'
import type {
  UseAGGridUrlSyncOptions,
  UseAGGridUrlSyncReturn
} from './types.js'
import { AGGridUrlSync } from '../core/ag-grid-url-sync.js'
import { createViewStore } from '../core/view-storage.js'
import {
  asGridApi,
  waitForEffects,
  type FilterChangedListener
} from '../test-helpers.js'

// The hook's issues state and throwOnError (#229), on the real core

const LONG = 'a'.repeat(201)

const longText: FilterModel = {
  name: { filterType: 'text', type: 'contains', filter: LONG }
}

const createGridApi = (initial: FilterModel = {}) => {
  let model: FilterModel = initial
  let listener: FilterChangedListener | undefined

  const api = {
    getFilterModel: vi.fn(() => model),
    setFilterModel: vi.fn(),
    getColumn: vi.fn(() => ({
      isFilterAllowed: () => true,
      getColDef: () => ({ filter: 'agTextColumnFilter' })
    })),
    addEventListener: vi.fn((_: string, fn: FilterChangedListener) => {
      listener = fn
    }),
    removeEventListener: vi.fn()
  }

  const fireFilterChanged = () => act(() => listener?.({ source: 'api' }))

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
  options: UseAGGridUrlSyncOptions
) {
  const caught = vi.fn<(error: Error) => void>()
  let latest: UseAGGridUrlSyncReturn | null = null

  function Probe({
    onResult
  }: {
    onResult: (result: UseAGGridUrlSyncReturn) => void
  }) {
    const result = useAGGridUrlSync(asGridApi(api), options)

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

describe('useAGGridUrlSync issues (#229)', () => {
  beforeEach(() => {
    // React reports a caught render error to the console
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('has a value that the URL leaves out', async () => {
    const { api } = createGridApi(longText)

    const { result } = renderHook(() => useAGGridUrlSync(asGridApi(api)))
    await waitForEffects()

    expect(result.current.hasFilters).toBe(true)
    expect(result.current.issues).toHaveLength(1)
    expect(result.current.issues[0]).toMatchObject({
      code: 'VALUE_TOO_LONG',
      column: 'name'
    })
  })

  test('has the issues of applyUrlFilters until the next clear', async () => {
    const { api, fireFilterChanged } = createGridApi()

    const { result } = renderHook(() => useAGGridUrlSync(asGridApi(api)))
    await waitForEffects()

    act(() => result.current.applyUrlFilters('?f_age_gt=abc'))

    expect(result.current.issues).toEqual([
      expect.objectContaining({ code: 'INVALID_NUMBER', column: 'age' })
    ])

    fireFilterChanged()

    expect(result.current.issues).toHaveLength(1)

    act(() => result.current.clearFilters())

    expect(result.current.issues).toEqual([])
  })

  test('has INVALID_URL from applyUrlFilters', async () => {
    const { api } = createGridApi()
    const onParseError = vi.fn()

    const { result } = renderHook(() =>
      useAGGridUrlSync(asGridApi(api), { onParseError })
    )

    await waitForEffects()

    act(() => result.current.applyUrlFilters('example.com?f_a_eq=1'))

    expect(result.current.issues).toEqual([
      expect.objectContaining({ code: 'INVALID_URL' })
    ])
    expect(onParseError).toHaveBeenCalledOnce()
  })

  test('has no GRID_ERROR', async () => {
    const { api, fireFilterChanged } = createGridApi()
    const onError = vi.fn()

    const { result } = renderHook(() =>
      useAGGridUrlSync(asGridApi(api), { onError })
    )

    await waitForEffects()

    api.getFilterModel.mockImplementation(() => {
      throw new Error('grid failed')
    })
    fireFilterChanged()

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'GRID_ERROR' }),
      'update-state'
    )
    expect(result.current.issues).toEqual([])
  })

  test('keeps its identity when the content is the same', async () => {
    const { api, fireFilterChanged } = createGridApi(longText)

    const { result } = renderHook(() => useAGGridUrlSync(asGridApi(api)))
    await waitForEffects()

    const before = result.current.issues
    fireFilterChanged()
    fireFilterChanged()

    expect(before).toHaveLength(1)
    expect(result.current.issues).toBe(before)
  })

  test('throwOnError throws the issue in render, for an error boundary', async () => {
    const { api } = createGridApi()
    const onParseError = vi.fn()

    const { caught, current } = renderInBoundary(api, {
      throwOnError: true,
      onParseError
    })

    await waitForEffects()

    act(() => current()?.applyUrlFilters('?f_age_gt=abc'))

    expect(caught).toHaveBeenCalledOnce()
    expect(caught.mock.calls[0]?.[0]).toMatchObject({ code: 'INVALID_NUMBER' })
    expect(onParseError).toHaveBeenCalledOnce()
  })

  test('a throwOnError predicate throws only the issues it picks', async () => {
    const { api } = createGridApi()

    const { caught, current } = renderInBoundary(api, {
      throwOnError: issue => issue.code === 'VALUE_TOO_LONG'
    })

    await waitForEffects()

    act(() => current()?.applyUrlFilters('?f_age_gt=abc'))

    expect(caught).not.toHaveBeenCalled()
    expect(current()?.issues).toHaveLength(1)
  })

  test('the core never throws from an effect', async () => {
    const getUrlState = vi.spyOn(AGGridUrlSync.prototype, 'getUrlState')
    const { api } = createGridApi(longText)

    const { caught } = renderInBoundary(api, { throwOnError: true })
    await waitForEffects()

    expect(getUrlState).toHaveReturned()
    expect(caught).toHaveBeenCalledOnce()
    expect(caught.mock.calls[0]?.[0]).toMatchObject({ code: 'VALUE_TOO_LONG' })
  })
  // The hook's own parse calls do not get throwOnError (#229 review): it only
  // decides whether the hook throws in render
  test('parseUrlFilters keeps the valid filters with throwOnError', async () => {
    const { api } = createGridApi()

    const { result } = renderHook(() =>
      useAGGridUrlSync(asGridApi(api), { throwOnError: true })
    )

    await waitForEffects()

    expect(
      result.current.parseUrlFilters('?f_age_gt=abc&f_name_contains=bob')
    ).toEqual({ name: { filterType: 'text', type: 'contains', filter: 'bob' } })
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
      autoApplyOnMount: true,
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

    const { result, rerender } = renderHook<UseAGGridUrlSyncReturn, GridProps>(
      ({ gridApi }) => useAGGridUrlSync(gridApi),
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
      ({ enabledWhenReady }) =>
        useAGGridUrlSync(asGridApi(api), { enabledWhenReady }),
      { initialProps: { enabledWhenReady: true } }
    )

    await waitForEffects()

    expect(result.current.issues).toHaveLength(1)

    rerender({ enabledWhenReady: false })
    await waitForEffects()

    expect(result.current.issues).toEqual([])
  })

  test('drops the apply issues of a grid that was replaced', async () => {
    const first = createGridApi()
    const second = createGridApi()

    const { result, rerender } = renderHook(
      ({ gridApi }) => useAGGridUrlSync(gridApi),
      { initialProps: { gridApi: asGridApi(first.api) } }
    )

    await waitForEffects()

    act(() => result.current.applyUrlFilters('?f_age_gt=abc'))

    expect(result.current.issues).toHaveLength(1)

    rerender({ gridApi: asGridApi(second.api) })
    await waitForEffects()

    expect(result.current.issues).toEqual([])
  })
  test('drops the apply issues when a stored view is restored', async () => {
    window.localStorage.clear()
    createViewStore('restore-b').saveView('Eng', {
      dept: { filterType: 'text', type: 'equals', filter: 'eng' }
    })
    const { api } = createGridApi()

    const { result, rerender } = renderHook(
      ({ storageKey }) =>
        useAGGridUrlSync(asGridApi(api), {
          storageKey,
          autoApplyOnMount: true
        }),
      { initialProps: { storageKey: 'restore-a' } }
    )

    await waitForEffects()

    act(() => result.current.applyUrlFilters('?f_age_gt=abc'))

    expect(result.current.issues).toHaveLength(1)

    // A new namespace with a stored view: auto-apply restores it
    rerender({ storageKey: 'restore-b' })
    await waitForEffects()

    expect(api.setFilterModel).toHaveBeenLastCalledWith({
      dept: { filterType: 'text', type: 'equals', filter: 'eng' }
    })
    expect(result.current.issues).toEqual([])
  })
})
