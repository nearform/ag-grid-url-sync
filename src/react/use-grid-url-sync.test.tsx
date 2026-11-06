import { Component, StrictMode, type ReactNode } from 'react'
import { renderHook, act } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FilterModel, GridApi } from 'ag-grid-community'
import { useGridUrlSync } from './use-grid-url-sync.js'
import type { UseGridUrlSyncOptions } from './types.js'
import { individual, grouped } from '../core/codecs.js'
import { createViewStore } from '../core/view-storage.js'
import type { IssueEvent } from '../core/types.js'
import {
  createRealGrid,
  createTimedGrid,
  GRID_TIMINGS,
  useRealLocation
} from '../test-helpers.js'

// The 0.6.0 hook (#271): a thin adapter on createGridUrlSync. The core's
// rules hold, the result is stable, and options can change after mount.

const NAME_JO = {
  name: { filterType: 'text', type: 'contains', filter: 'jo' }
} as const

const NAME_X = {
  name: { filterType: 'text', type: 'contains', filter: 'x' }
} as const

const AGE_GT_5 = {
  age: { filterType: 'number', type: 'greaterThan', filter: 5 }
} as const

/** AG Grid sends filterChanged one tick after setFilterModel */
const settle = (): Promise<void> =>
  act(() => new Promise<void>(resolve => setTimeout(resolve)))

/** A user edit: the grid's own setFilterModel, then its event */
async function edit(api: GridApi, model: FilterModel): Promise<void> {
  act(() => api.setFilterModel(model))
  await settle()
}

/** Goes back one entry, waits for jsdom's popstate, then one tick */
async function back(): Promise<void> {
  await act(async () => {
    const popped = new Promise(resolve => {
      window.addEventListener('popstate', resolve, { once: true })
    })

    window.history.back()
    await popped
  })
  await settle()
}

function params(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}

function renderSync(initial: UseGridUrlSyncOptions, strict = false) {
  // StrictMode itself as the wrapper: an arrow wrapper around it does not
  // run the effects two times
  if (strict) {
    return renderHook(useGridUrlSync, {
      initialProps: initial,
      wrapper: StrictMode
    })
  }

  return renderHook(useGridUrlSync, { initialProps: initial })
}

/** An error boundary that keeps what it caught */
function createBoundary() {
  const caught: Error[] = []

  class Boundary extends Component<{ children: ReactNode }> {
    override state = { failed: false }

    static getDerivedStateFromError() {
      return { failed: true }
    }

    override componentDidCatch(error: Error) {
      caught.push(error)
    }

    override render() {
      return this.state.failed ? null : this.props.children
    }
  }

  return { caught, Boundary }
}

/** The number of filterChanged listeners added to the grid */
function countSyncs(api: GridApi) {
  const adds = vi.spyOn(api, 'addEventListener')

  return () =>
    adds.mock.calls.filter(([type]) => type === 'filterChanged').length
}

beforeEach(() => {
  localStorage.clear()
  useRealLocation('/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useGridUrlSync: state (#271)', () => {
  test('is idle with no grid', () => {
    const { result } = renderSync({ api: null })

    expect(result.current.status).toBe('idle')
    expect(result.current.url).toBe('')
    expect(result.current.hasFilters).toBe(false)
    expect(result.current.issues).toEqual([])
    expect(result.current.views).toEqual([])
    expect(result.current.activeViewId).toBeNull()
  })

  test('applies the URL on mount, as createGridUrlSync does', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const api = createRealGrid()

    const { result } = renderSync({ api })
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(result.current.status).toBe('active')
    expect(result.current.hasFilters).toBe(true)
    expect(result.current.url).toContain('f_name_contains=jo')
  })

  test('keeps the grid filters on a URL with no filters', async () => {
    const api = createRealGrid({
      initialState: { filter: { filterModel: NAME_JO } }
    })

    const { result } = renderSync({ api, history: 'replace' })
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(result.current.hasFilters).toBe(true)
    expect(params().get('f_name_contains')).toBe('jo')
  })

  test('applyUrlOnCreate: false does not apply the URL', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const api = createRealGrid()

    renderSync({ api, applyUrlOnCreate: false })
    await settle()

    expect(api.getFilterModel()).toEqual({})
  })

  test('follows a user edit', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api })
    await settle()

    await edit(api, NAME_X)

    expect(result.current.url).toContain('f_name_contains=x')
    expect(result.current.hasFilters).toBe(true)
  })

  test('shows the destroyed status after AG Grid destroys the grid', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api })
    await settle()

    act(() => api.destroy())

    expect(result.current.status).toBe('destroyed')
  })

  test('a new grid applies the URL again', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const first = createRealGrid()
    const { rerender } = renderSync({ api: first })
    await settle()
    const second = createRealGrid()

    rerender({ api: second })
    await settle()

    expect(second.getFilterModel()).toMatchObject(NAME_JO)
  })
})

describe('useGridUrlSync: a stable result (#271)', () => {
  test('gives the same object while nothing changes', async () => {
    const api = createRealGrid()
    const { result, rerender } = renderSync({ api })
    await settle()
    const first = result.current

    rerender({ api })
    await settle()

    expect(result.current).toBe(first)
  })

  test('keeps the methods across a state change', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api })
    await settle()
    const first = result.current

    await edit(api, NAME_X)

    expect(result.current).not.toBe(first)
    expect(result.current.applyUrl).toBe(first.applyUrl)
    expect(result.current.applyFilters).toBe(first.applyFilters)
    expect(result.current.getUrl).toBe(first.getUrl)
    expect(result.current.saveView).toBe(first.saveView)
    expect(result.current.loadView).toBe(first.loadView)
    expect(result.current.deleteView).toBe(first.deleteView)
  })
})

describe('useGridUrlSync: options after mount (#271)', () => {
  test('a new codec object with the same settings makes no new sync', async () => {
    const api = createRealGrid()
    const syncs = countSyncs(api)

    const { rerender } = renderSync({
      api,
      codec: individual({ prefix: 'g_' })
    })

    await settle()

    rerender({ api, codec: individual({ prefix: 'g_' }) })
    rerender({ api, codec: individual({ prefix: 'g_' }) })
    await settle()

    expect(syncs()).toBe(1)
  })

  test('a new codec makes a new sync and does not apply the URL again', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const api = createRealGrid()
    const { result, rerender } = renderSync({ api })
    await settle()
    await edit(api, NAME_X)
    const set = vi.spyOn(api, 'setFilterModel')

    rerender({ api, codec: grouped({ param: 'gf' }) })
    await settle()

    expect(set).not.toHaveBeenCalled()
    const search = new URL(result.current.url).searchParams

    expect(search.get('gf')).not.toBeNull()
    expect(search.get('f_name_contains')).toBeNull()
  })

  test('a new inline onIssue makes no new sync, and the latest one is called', async () => {
    const api = createRealGrid()
    const syncs = countSyncs(api)
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderSync({ api, onIssue: first })
    await settle()

    rerender({ api, onIssue: second })
    await settle()
    act(() => {
      result.current.applyUrl('https://x.test/?f_age_unknownOperation=1')
    })

    expect(syncs()).toBe(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  test('a new inline history function makes no new sync, and the latest one is called', async () => {
    const api = createRealGrid()
    const syncs = countSyncs(api)
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderSync({ api, history: first })
    await settle()

    rerender({ api, history: second })
    await settle()
    await edit(api, NAME_JO)

    expect(syncs()).toBe(1)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  test('a history function gets the URL and the replace flag (#304)', async () => {
    const other = createViewStore('other')
    const view = other.saveView('B', AGE_GT_5)
    other.persistActiveViewId(view.id)
    const api = createRealGrid()
    const history = vi.fn()
    const { rerender } = renderSync({ api, history, storageKey: 't' })
    await settle()

    // A user edit adds an entry
    await edit(api, NAME_JO)

    // The restore of the view of a new storageKey replaces the entry
    rerender({ api, history, storageKey: 'other' })
    await settle()

    expect(history.mock.calls).toEqual([
      [expect.stringContaining('f_name_contains=jo'), { replace: false }],
      [expect.stringContaining('f_age_gt=5'), { replace: true }]
    ])
  })

  test('a history change after mount takes effect', async () => {
    const api = createRealGrid()
    const { rerender } = renderSync({ api })
    await settle()

    rerender({ api, history: 'replace' })
    await settle()
    await edit(api, NAME_JO)

    expect(params().get('f_name_contains')).toBe('jo')
  })
})

describe('useGridUrlSync: methods (#271)', () => {
  test('applyUrl and applyFilters return their issues', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api })
    await settle()
    let issues: readonly unknown[] = []

    act(() => {
      issues = result.current.applyUrl(
        'https://x.test/?f_name_contains=jo&f_age_unknownOperation=1'
      ).issues
    })

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(issues).toHaveLength(1)
    expect(result.current.issues).toHaveLength(1)

    act(() => {
      issues = result.current.applyFilters({}).issues
    })
    await settle()

    expect(issues).toEqual([])
    expect(api.getFilterModel()).toEqual({})
  })

  test('getUrl gives the URL with the grid filters', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api })
    await settle()
    await edit(api, NAME_JO)

    expect(result.current.getUrl('https://x.test/list?tab=1')).toBe(
      'https://x.test/list?f_name_contains=jo&tab=1'
    )
  })

  test('a method with no grid reports NOT_READY to onIssue', () => {
    const onIssue = vi.fn()
    const { result } = renderSync({ api: null, onIssue, storageKey: 't' })

    act(() => {
      expect(result.current.applyUrl().issues).toEqual([])
      result.current.applyFilters({})
      result.current.loadView(null)
    })

    expect(onIssue).toHaveBeenCalledTimes(3)
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      issue: { code: 'NOT_READY' },
      source: 'api'
    })
    expect(result.current.getUrl('https://x.test/')).toBe('https://x.test/')
  })

  test('enabled: false makes no sync', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const api = createRealGrid()
    const onIssue = vi.fn()

    const { result } = renderSync({ api, enabled: false, onIssue })
    await settle()

    expect(api.getFilterModel()).toEqual({})
    expect(result.current.status).toBe('idle')

    act(() => {
      result.current.applyUrl()
    })

    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      issue: { code: 'NOT_READY' }
    })
  })
})

describe('useGridUrlSync: issues (#271)', () => {
  test('onIssue gets a bad URL param on mount one time', async () => {
    window.history.replaceState(null, '', '/?f_age_unknownOperation=1')
    const api = createRealGrid()
    const events: IssueEvent[] = []

    const { result, rerender } = renderSync({
      api,
      onIssue: event => events.push(event)
    })

    await settle()
    rerender({ api, onIssue: event => events.push(event) })
    await settle()

    expect(events).toHaveLength(1)
    expect(events[0]?.source).toBe('url')
    expect(result.current.issues).toHaveLength(1)
  })

  test('throwOnError throws the issue during render', async () => {
    window.history.replaceState(null, '', '/?f_age_unknownOperation=1')
    const api = createRealGrid()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { caught, Boundary } = createBoundary()

    renderHook(useGridUrlSync, {
      initialProps: { api, throwOnError: true },
      wrapper: Boundary
    })
    await settle()

    expect(caught).toHaveLength(1)
    expect(caught[0]).toMatchObject({ code: 'INVALID_PARAM', column: 'age' })
  })

  test('throwOnError does not throw a GRID_ERROR in render (#284)', async () => {
    const api = createRealGrid()
    const { caught, Boundary } = createBoundary()
    const events: IssueEvent[] = []

    const { result } = renderHook(useGridUrlSync, {
      initialProps: {
        api,
        throwOnError: true,
        onIssue: (event: IssueEvent) => events.push(event)
      },
      wrapper: Boundary
    })

    await settle()

    vi.spyOn(api, 'getFilterModel').mockImplementation(() => {
      throw new Error('Read failed')
    })
    await edit(api, NAME_JO)

    expect(caught).toEqual([])
    expect(events.map(event => event.issue.code)).toEqual(['GRID_ERROR'])
    expect(result.current.issues).toEqual([])
  })

  test('throwOnError with a function throws only the picked issues', async () => {
    window.history.replaceState(null, '', '/?f_age_unknownOperation=1')
    const api = createRealGrid()

    const { result } = renderSync({
      api,
      throwOnError: issue => issue.code === 'VALUE_TOO_LONG'
    })

    await settle()

    expect(result.current.issues).toHaveLength(1)
  })

  test('a grid that cannot take a listener is reported, not thrown (#286)', async () => {
    const api = createRealGrid()
    vi.spyOn(api, 'addEventListener').mockImplementation(() => {
      throw new Error('Initialization failed')
    })
    const events: IssueEvent[] = []

    const { result } = renderSync({ api, onIssue: event => events.push(event) })
    await settle()

    expect(result.current.status).toBe('destroyed')
    expect(events.map(event => [event.issue.code, event.source])).toEqual([
      ['GRID_ERROR', 'api']
    ])
    expect(events[0]?.issue.message).toContain('Initialization failed')
  })

  test('StrictMode reports a grid that cannot take a listener one time (#286)', async () => {
    const api = createRealGrid()
    vi.spyOn(api, 'addEventListener').mockImplementation(() => {
      throw new Error('Initialization failed')
    })
    const events: IssueEvent[] = []

    renderSync({ api, onIssue: event => events.push(event) }, true)
    await settle()

    expect(events.map(event => event.issue.code)).toEqual(['GRID_ERROR'])
  })

  test('a new sync after a listener failure reports its own GRID_ERROR (#286 review)', async () => {
    const api = createRealGrid()

    const add = vi.spyOn(api, 'addEventListener').mockImplementation(() => {
      throw new Error('Initialization failed')
    })

    const events: IssueEvent[] = []
    const onIssue = (event: IssueEvent) => events.push(event)

    const { rerender } = renderSync({ api, onIssue })
    await settle()
    // The grid takes listeners now, but its filter model read fails
    add.mockRestore()
    vi.spyOn(api, 'getFilterModel').mockImplementation(() => {
      throw new Error('Read failed')
    })
    rerender({ api, onIssue, maxValueLength: 50 })
    await settle()

    expect(events.map(event => event.issue.message)).toEqual([
      expect.stringContaining('Initialization failed'),
      expect.stringContaining('Read failed')
    ])
  })

  test('a grid with no isDestroyed reports a listener failure after its destroy (#286 review)', async () => {
    const api = createRealGrid()
    const events: IssueEvent[] = []
    const onIssue = (event: IssueEvent) => events.push(event)

    const { result, rerender } = renderSync({ api, onIssue })
    await settle()
    // AG Grid before v31: gridPreDestroyed comes, but isDestroyed is not there
    vi.spyOn(api, 'isDestroyed').mockReturnValue(false)
    act(() => api.dispatchEvent({ type: 'gridPreDestroyed' }))

    vi.spyOn(api, 'addEventListener').mockImplementation(() => {
      throw new Error('Initialization failed')
    })

    rerender({ api, onIssue, maxValueLength: 50 })
    await settle()

    expect(result.current.status).toBe('destroyed')
    expect(events.map(event => event.issue.code)).toEqual(['GRID_ERROR'])
  })

  test('a new sync reports a listener failure after a working sync (#286)', async () => {
    const api = createRealGrid()
    const events: IssueEvent[] = []
    const onIssue = (event: IssueEvent) => events.push(event)

    const { result, rerender } = renderSync({ api, onIssue })
    await settle()
    vi.spyOn(api, 'addEventListener').mockImplementation(() => {
      throw new Error('Initialization failed')
    })
    rerender({ api, onIssue, maxValueLength: 50 })
    await settle()

    expect(result.current.status).toBe('destroyed')
    expect(events.map(event => event.issue.code)).toEqual(['GRID_ERROR'])
  })
})

describe('useGridUrlSync: issues across a new sync (#271 review)', () => {
  test('StrictMode keeps the issues of the URL apply on mount', async () => {
    window.history.replaceState(null, '', '/?f_age_unknownOperation=1')
    const api = createRealGrid()
    const syncs = countSyncs(api)
    const onIssue = vi.fn()

    const { result } = renderSync({ api, onIssue }, true)
    await settle()

    expect(syncs()).toBe(2)
    expect(result.current.issues).toHaveLength(1)
    expect(onIssue).toHaveBeenCalledTimes(1)
  })

  test('StrictMode throws the issue of the URL apply with throwOnError', async () => {
    window.history.replaceState(null, '', '/?f_age_unknownOperation=1')
    const api = createRealGrid()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { caught, Boundary } = createBoundary()

    renderHook(useGridUrlSync, {
      initialProps: { api, throwOnError: true },
      wrapper: ({ children }) => (
        <StrictMode>
          <Boundary>{children}</Boundary>
        </StrictMode>
      )
    })
    await settle()

    expect(caught.length).toBeGreaterThan(0)
    expect(caught[0]).toMatchObject({ column: 'age' })
  })

  test('a new sync keeps the apply issues until its own next apply', async () => {
    window.history.replaceState(null, '', '/?f_age_unknownOperation=1')
    const api = createRealGrid()
    const { result, rerender } = renderSync({ api })
    await settle()

    rerender({ api, history: 'replace' })
    await settle()

    expect(result.current.issues).toHaveLength(1)

    act(() => {
      result.current.applyUrl('https://x.test/?f_name_contains=jo')
    })

    expect(result.current.issues).toEqual([])
  })

  test('a new storageKey that restores its stored view drops the apply issues (#285)', async () => {
    createViewStore('restore-b').saveView('X', NAME_X)
    const api = createRealGrid()
    const { result, rerender } = renderSync({ api, storageKey: 'restore-a' })
    await settle()

    act(() => {
      result.current.applyUrl('https://x.test/?f_age_unknownOperation=1')
    })

    expect(result.current.issues).toHaveLength(1)

    rerender({ api, storageKey: 'restore-b' })
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_X)
    expect(result.current.issues).toEqual([])
  })

  test('an option change on the same store keeps the apply issues (#285 review)', async () => {
    const api = createRealGrid()
    const { result, rerender } = renderSync({ api, storageKey: 'same' })
    await settle()

    await edit(api, NAME_X)
    act(() => {
      result.current.saveView('X')
    })
    await settle()

    act(() => {
      result.current.applyUrl(
        'https://x.test/?f_name_contains=x&f_age_unknownOperation=1'
      )
    })
    await settle()

    expect(result.current.activeViewId).not.toBeNull()
    expect(result.current.issues).toHaveLength(1)

    rerender({ api, storageKey: 'same', maxValueLength: 50 })
    await settle()

    expect(result.current.issues).toHaveLength(1)
  })

  test('a new storageKey with no stored view keeps the apply issues (#285)', async () => {
    const api = createRealGrid()
    const { result, rerender } = renderSync({ api, storageKey: 'restore-a' })
    await settle()

    act(() => {
      result.current.applyUrl('https://x.test/?f_age_unknownOperation=1')
    })

    rerender({ api, storageKey: 'restore-empty' })
    await settle()

    expect(result.current.issues).toHaveLength(1)
  })

  test('an option change after AG Grid destroys the grid reports nothing', async () => {
    const api = createRealGrid()
    const onIssue = vi.fn()
    const { result, rerender } = renderSync({ api, onIssue })
    await settle()
    act(() => api.destroy())

    rerender({ api, onIssue, history: 'replace' })
    await settle()

    expect(onIssue).not.toHaveBeenCalled()
    expect(result.current.status).toBe('destroyed')

    // A method that the app calls still reports
    act(() => {
      result.current.applyUrl()
    })

    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      issue: { code: 'NOT_READY' }
    })
  })

  test('enabled false then true starts again and applies the URL', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const api = createRealGrid()
    const { rerender } = renderSync({ api })
    await settle()
    await edit(api, NAME_X)

    rerender({ api, enabled: false })
    rerender({ api, enabled: true })
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
  })
})

describe('useGridUrlSync: history and popstate (#271)', () => {
  test('push adds one entry per user edit and follows the back button', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api, history: 'push' })
    await settle()
    const length = window.history.length

    await edit(api, NAME_JO)
    await edit(api, NAME_X)

    expect(window.history.length).toBe(length + 2)

    await back()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(result.current.url).toBe(window.location.href)
  })

  test('an apply on mount writes no history entry', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const push = vi.spyOn(window.history, 'pushState')
    const api = createRealGrid()

    renderSync({ api, history: 'push' })
    await settle()

    expect(push).not.toHaveBeenCalled()
  })

  test('stops following the back button after unmount', async () => {
    const api = createRealGrid()
    const { unmount } = renderSync({ api, history: 'push' })
    await settle()
    await edit(api, NAME_JO)
    await edit(api, NAME_X)
    unmount()

    await back()

    expect(api.getFilterModel()).toMatchObject(NAME_X)
  })
})

describe('useGridUrlSync: saved views (#271)', () => {
  test('saves, loads and deletes a view', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api, storageKey: 't' })
    await settle()
    await edit(api, NAME_JO)
    let id = ''

    act(() => {
      id = result.current.saveView('A')?.id ?? ''
    })

    expect(result.current.views.map(view => view.name)).toEqual(['A'])
    expect(result.current.activeViewId).toBe(id)

    await edit(api, AGE_GT_5)

    expect(result.current.activeViewId).toBeNull()

    act(() => result.current.loadView(id))
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(result.current.activeViewId).toBe(id)

    act(() => result.current.deleteView(id))
    await settle()

    expect(result.current.views).toEqual([])
    expect(api.getFilterModel()).toEqual({})
  })

  test('restores the stored view on mount', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', NAME_JO)
    store.persistActiveViewId(view.id)
    const api = createRealGrid()

    const { result } = renderSync({ api, storageKey: 't' })
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(result.current.activeViewId).toBe(view.id)
  })

  test('a URL with filters wins over the stored view', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', NAME_JO)
    store.persistActiveViewId(view.id)
    window.history.replaceState(null, '', '/?f_name_contains=x')
    const api = createRealGrid()

    const { result } = renderSync({ api, storageKey: 't' })
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_X)
    expect(result.current.activeViewId).toBeNull()
  })

  test('keeps the active view when an option changes', async () => {
    const api = createRealGrid()
    const { result, rerender } = renderSync({ api, storageKey: 't' })
    await settle()
    await edit(api, NAME_JO)
    let id = ''
    act(() => {
      id = result.current.saveView('A')?.id ?? ''
    })

    rerender({ api, storageKey: 't', history: 'replace' })
    await settle()

    expect(result.current.activeViewId).toBe(id)
  })

  test('a new storageKey restores its stored view, and the URL does not win again', async () => {
    const other = createViewStore('other')
    const view = other.saveView('B', AGE_GT_5)
    other.persistActiveViewId(view.id)
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const api = createRealGrid()
    const { result, rerender } = renderSync({ api, storageKey: 't' })
    await settle()
    expect(api.getFilterModel()).toMatchObject(NAME_JO)

    rerender({ api, storageKey: 'other' })
    await settle()

    expect(api.getFilterModel()).toMatchObject(AGE_GT_5)
    expect(result.current.activeViewId).toBe(view.id)
    expect(result.current.views.map(item => item.name)).toEqual(['B'])
  })

  test('shows the stored views and deletes one with no grid', () => {
    const store = createViewStore('t')
    const view = store.saveView('A', NAME_JO)
    const { result } = renderSync({ api: null, storageKey: 't' })

    expect(result.current.views.map(item => item.id)).toEqual([view.id])

    act(() => result.current.deleteView(view.id))

    expect(result.current.views).toEqual([])
    expect(store.listViews()).toEqual([])
  })

  test('the view methods do nothing with no storageKey', async () => {
    const api = createRealGrid()
    const onIssue = vi.fn()
    const { result } = renderSync({ api, onIssue })
    await settle()

    act(() => {
      expect(result.current.saveView('A')).toBeNull()
      result.current.loadView('x')
      result.current.deleteView('x')
    })

    expect(onIssue).not.toHaveBeenCalled()
  })
})

describe.each(GRID_TIMINGS)(
  'useGridUrlSync: StrictMode, %s grid (#271)',
  timing => {
    test('makes one live sync and adds no history entry on mount', async () => {
      const store = createViewStore('t')
      const view = store.saveView('A', NAME_JO)
      store.persistActiveViewId(view.id)
      const push = vi.spyOn(window.history, 'pushState')
      const { api, userEdit } = createTimedGrid(timing)

      const { result } = renderSync(
        { api, history: 'push', storageKey: 't' },
        true
      )

      await settle()
      await settle()

      expect(result.current.activeViewId).toBe(view.id)
      expect(params().get('f_name_contains')).toBe('jo')
      expect(push).not.toHaveBeenCalled()

      act(() => userEdit(NAME_X))
      await settle()
      await settle()

      // One live sync: one entry, not two
      expect(push).toHaveBeenCalledTimes(1)
    })
  }
)
