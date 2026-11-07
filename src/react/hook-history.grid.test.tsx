import { Activity, StrictMode } from 'react'
import { render, renderHook, act } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FilterModel, GridApi } from 'ag-grid-community'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'
import type { UseAGGridUrlSyncOptions } from './types.js'
import { createViewStore } from '../core/view-storage.js'
import {
  createRealGrid,
  createTimedGrid,
  GRID_TIMINGS,
  useRealLocation
} from '../test-helpers.js'

// The hook's history and popstate options on a real AG Grid in jsdom (#270).
// The hook gets the same address-bar sync as createGridUrlSync.

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

/** A user edit: the grid's own setFilterModel, then its event */
async function edit(api: GridApi, model: FilterModel): Promise<void> {
  act(() => api.setFilterModel(model))
  await settle()
}

function params(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}

type Props = { api: GridApi | null; options: UseAGGridUrlSyncOptions }

const useSync = ({ api, options }: Props) => useAGGridUrlSync(api, options)

function renderSync(props: Props, strict = false) {
  if (strict) {
    return renderHook(useSync, { initialProps: props, wrapper: StrictMode })
  }

  return renderHook(useSync, { initialProps: props })
}

beforeEach(() => {
  localStorage.clear()
  useRealLocation('/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('history option (#270)', () => {
  test('writes nothing by default', async () => {
    const api = createRealGrid()
    renderSync({ api, options: {} })
    await settle()

    await edit(api, NAME_JO)

    expect(window.location.search).toBe('')
  })

  test('replace writes a user edit and keeps the rest of the URL', async () => {
    window.history.replaceState({ app: 1 }, '', '/list?tab=1#top')
    const length = window.history.length
    const api = createRealGrid()
    const { result } = renderSync({ api, options: { history: 'replace' } })
    await settle()

    await edit(api, NAME_JO)

    expect(params().get('f_name_contains')).toBe('jo')
    expect(params().get('tab')).toBe('1')
    expect(window.location.hash).toBe('#top')
    expect(window.history.state).toEqual({ app: 1 })
    expect(window.history.length).toBe(length)
    expect(result.current.currentUrl).toBe(window.location.href)
  })

  test('push adds one entry for each user edit', async () => {
    const api = createRealGrid()
    renderSync({ api, options: { history: 'push' } })
    await settle()
    const length = window.history.length

    await edit(api, NAME_JO)
    await edit(api, NAME_X)

    expect(window.history.length).toBe(length + 2)
    expect(params().get('f_name_contains')).toBe('x')
  })

  test('uses the paramPrefix and format options in the address bar', async () => {
    const api = createRealGrid()
    renderSync({
      api,
      options: {
        history: 'replace',
        serialization: 'grouped',
        groupedParam: 'g'
      }
    })
    await settle()

    await edit(api, NAME_JO)

    expect(params().get('g')).not.toBeNull()
    expect(params().get('f_name_contains')).toBeNull()
  })

  test('a function gets the URL, and the latest function is used', async () => {
    const api = createRealGrid()
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderSync({ api, options: { history: first } })
    await settle()
    const adds = vi.spyOn(api, 'addEventListener')

    // A new function on each render, as an inline arrow gives
    rerender({ api, options: { history: second } })
    await settle()
    await edit(api, NAME_JO)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(second.mock.calls[0]?.[0]).toContain('f_name_contains=jo')
    expect(window.location.search).toBe('')
    // No new sync for a new function
    expect(adds).not.toHaveBeenCalled()
  })

  test('a function gets the replace flag (#304)', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', NAME_X)
    store.persistActiveViewId(view.id)
    const api = createRealGrid()
    const history = vi.fn()
    renderSync({
      api,
      options: { history, storageKey: 't', autoApplyOnMount: true }
    })
    await settle()

    // The restore of the stored view on mount replaces the entry, and a
    // user edit adds one
    await edit(api, NAME_JO)

    expect(history.mock.calls).toEqual([
      [expect.stringContaining('f_name_contains=x'), { replace: true }],
      [expect.stringContaining('f_name_contains=jo'), { replace: false }]
    ])
  })

  test('a history change after mount takes effect', async () => {
    const api = createRealGrid()
    const { rerender } = renderSync({ api, options: {} })
    await settle()

    rerender({ api, options: { history: 'replace' } })
    await settle()
    await edit(api, NAME_JO)

    expect(params().get('f_name_contains')).toBe('jo')
  })

  test('auto-apply on mount writes no history entry', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const length = window.history.length
    const push = vi.spyOn(window.history, 'pushState')
    const api = createRealGrid()
    renderSync({ api, options: { history: 'push', autoApplyOnMount: true } })
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(push).not.toHaveBeenCalled()
    expect(window.history.length).toBe(length)
  })

  test('applyUrlFilters writes no history entry', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api, options: { history: 'push' } })
    await settle()
    const push = vi.spyOn(window.history, 'pushState')

    act(() =>
      result.current.applyUrlFilters('https://x.test/?f_name_contains=jo')
    )
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(push).not.toHaveBeenCalled()
  })

  test('applyFilters and clearFilters write as a user edit does', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api, options: { history: 'push' } })
    await settle()
    const length = window.history.length

    act(() =>
      result.current.applyFilters({
        name: { filterType: 'text', type: 'contains', filter: 'jo' }
      })
    )
    await settle()
    act(() => result.current.clearFilters())
    await settle()

    expect(window.history.length).toBe(length + 2)
    expect(window.location.search).toBe('')
  })

  test('a history write that throws goes to onError', async () => {
    const api = createRealGrid()
    const onError = vi.fn()
    renderSync({ api, options: { history: 'replace', onError } })
    await settle()
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new Error('blocked')
    })

    await edit(api, NAME_JO)

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      code: 'HISTORY_WRITE_FAILED'
    })
    expect(onError.mock.calls[0]?.[1]).toBe('filter-change')
  })
})

describe('popstate option (#270)', () => {
  test('push follows the back button by default', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api, options: { history: 'push' } })
    await settle()
    await edit(api, NAME_JO)
    await edit(api, NAME_X)

    await back()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(result.current.currentUrl).toContain('f_name_contains=jo')
    expect(result.current.currentUrl).toBe(window.location.href)
  })

  test('back to an entry with no filters clears the grid', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api, options: { history: 'push' } })
    await settle()
    await edit(api, NAME_JO)

    await back()

    expect(api.getFilterModel()).toEqual({})
    expect(result.current.hasFilters).toBe(false)
  })

  test('popstate: false does not follow the back button', async () => {
    const api = createRealGrid()
    renderSync({ api, options: { history: 'push', popstate: false } })
    await settle()
    await edit(api, NAME_JO)
    await edit(api, NAME_X)

    await back()

    expect(api.getFilterModel()).toMatchObject(NAME_X)
  })

  test('popstate: true follows the back button with replace', async () => {
    window.history.pushState(null, '', '/?f_name_contains=jo')
    window.history.pushState(null, '', '/?f_name_contains=x')
    const api = createRealGrid()
    renderSync({
      api,
      options: { history: 'replace', popstate: true, autoApplyOnMount: true }
    })
    await settle()

    await back()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
  })

  test('a grid error on back goes to onError with the popstate context', async () => {
    const api = createRealGrid()
    const onError = vi.fn()
    renderSync({ api, options: { history: 'push', onError } })
    await settle()
    await edit(api, NAME_JO)
    vi.spyOn(api, 'setFilterModel').mockImplementation(() => {
      throw new Error('grid broke')
    })

    await back()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ code: 'GRID_ERROR' })
    expect(onError.mock.calls[0]?.[1]).toBe('popstate')
  })

  test('keeps no popstate listener for a grid that is already destroyed', async () => {
    const api = createRealGrid()
    api.destroy()
    const adds = vi.spyOn(window, 'addEventListener')
    const removes = vi.spyOn(window, 'removeEventListener')

    renderSync({ api, options: { history: 'push' } })
    await settle()

    const handlers = (spy: typeof adds): Set<unknown> =>
      new Set(
        spy.mock.calls
          .filter(([type]) => type === 'popstate')
          .map(([, handler]) => handler)
      )

    const removed = handlers(removes)
    const live = [...handlers(adds)].filter(handler => !removed.has(handler))

    expect(live).toEqual([])
  })

  test('stops after unmount', async () => {
    const api = createRealGrid()
    const { unmount } = renderSync({ api, options: { history: 'push' } })
    await settle()
    await edit(api, NAME_JO)
    await edit(api, NAME_X)
    unmount()

    await back()

    expect(api.getFilterModel()).toMatchObject(NAME_X)
  })

  test('follows the back button one time in StrictMode', async () => {
    const api = createRealGrid()
    renderSync({ api, options: { history: 'push' } }, true)
    await settle()
    await edit(api, NAME_JO)
    await edit(api, NAME_X)
    const set = vi.spyOn(api, 'setFilterModel')

    await back()

    expect(set).toHaveBeenCalledTimes(1)
    expect(api.getFilterModel()).toMatchObject(NAME_JO)
  })

  test('a bad param on back goes to issues and to onParseError one time', async () => {
    const api = createRealGrid()
    const onParseError = vi.fn()

    const { result } = renderSync({
      api,
      options: { history: 'push', onParseError }
    })

    await settle()
    window.history.pushState(
      null,
      '',
      '/?f_name_contains=jo&f_age_unknownOperation=1'
    )
    window.history.pushState(null, '', '/?f_name_contains=x')

    await back()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(onParseError).toHaveBeenCalledTimes(1)
    expect(result.current.issues).toHaveLength(1)
    expect(result.current.issues[0]?.column).toBe('age')
  })

  test('back ends the apply issues of an earlier sync on the grid', async () => {
    window.history.replaceState(null, '', '/')
    window.history.pushState(null, '', '/?f_age_unknownOperation=1')
    const api = createRealGrid()

    const { result, rerender } = renderSync({
      api,
      options: { history: 'push', autoApplyOnMount: true }
    })

    await settle()
    expect(result.current.issues).toHaveLength(1)

    // A new sync on the same grid shows the earlier sync's apply issues
    rerender({
      api,
      options: { history: 'push', autoApplyOnMount: true, maxValueLength: 50 }
    })
    await settle()
    expect(result.current.issues).toHaveLength(1)

    await back()

    expect(result.current.issues).toEqual([])
  })
})

describe('saved views with history (#270)', () => {
  test('a view load with push adds one entry, and back leaves the view', async () => {
    const api = createRealGrid()

    const { result } = renderSync({
      api,
      options: { history: 'push', storageKey: 't' }
    })

    await settle()
    await edit(api, NAME_JO)
    let id = ''
    act(() => {
      id = result.current.saveView('A')?.id ?? ''
    })
    await edit(api, AGE_GT_5)
    const length = window.history.length

    act(() => result.current.loadView(id))
    await settle()

    expect(window.history.length).toBe(length + 1)
    expect(params().get('f_name_contains')).toBe('jo')
    expect(result.current.activeViewId).toBe(id)

    await back()

    expect(api.getFilterModel()).toMatchObject(AGE_GT_5)
    expect(result.current.activeViewId).toBeNull()
  })

  test.each([false, true])(
    'a stored view on mount replaces the entry (StrictMode %s)',
    async strict => {
      const store = createViewStore('t')
      const view = store.saveView('A', NAME_JO)
      store.persistActiveViewId(view.id)
      const length = window.history.length
      const push = vi.spyOn(window.history, 'pushState')
      const api = createRealGrid()

      const { result } = renderSync(
        {
          api,
          options: { history: 'push', storageKey: 't', autoApplyOnMount: true }
        },
        strict
      )

      await settle()

      expect(api.getFilterModel()).toMatchObject(NAME_JO)
      expect(result.current.activeViewId).toBe(view.id)
      expect(params().get('f_name_contains')).toBe('jo')
      expect(push).not.toHaveBeenCalled()
      expect(window.history.length).toBe(length)
    }
  )

  test('a URL with filters wins over the stored view, with no entry', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', NAME_JO)
    store.persistActiveViewId(view.id)
    window.history.replaceState(null, '', '/?f_name_contains=x')
    const push = vi.spyOn(window.history, 'pushState')
    const api = createRealGrid()

    const { result } = renderSync({
      api,
      options: { history: 'push', storageKey: 't', autoApplyOnMount: true }
    })

    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_X)
    expect(result.current.activeViewId).toBeNull()
    expect(push).not.toHaveBeenCalled()
  })

  test('a new sync on the same grid keeps the view with no new entry', async () => {
    const api = createRealGrid()

    const { result, rerender } = renderSync({
      api,
      options: { history: 'push', storageKey: 't' }
    })

    await settle()
    await edit(api, NAME_JO)
    let id = ''
    act(() => {
      id = result.current.saveView('A')?.id ?? ''
    })
    act(() => result.current.loadView(id))
    await settle()
    const push = vi.spyOn(window.history, 'pushState')

    rerender({
      api,
      options: { history: 'push', storageKey: 't', maxValueLength: 50 }
    })
    await settle()

    expect(result.current.activeViewId).toBe(id)
    expect(push).not.toHaveBeenCalled()
  })
})

describe.each(GRID_TIMINGS)('saved views with push, %s grid (#270)', timing => {
  test('keeps the view on an option change with autoApplyOnMount', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', NAME_JO)
    store.persistActiveViewId(null)
    const { api } = createTimedGrid(timing)
    const options = { storageKey: 't', autoApplyOnMount: true } as const
    const { result, rerender } = renderSync({ api, options })
    await settle()
    act(() => result.current.loadView(view.id))
    await settle()
    await settle()

    rerender({ api, options: { ...options, history: 'push' } })
    await settle()
    await settle()

    expect(result.current.activeViewId).toBe(view.id)
    expect(store.getActiveViewId()).toBe(view.id)
  })

  test('a kept-view restore that fails gets the initialization context', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', NAME_JO)
    store.persistActiveViewId(null)
    const onError = vi.fn()
    const { api } = createTimedGrid(timing)
    const options = { storageKey: 't', onError } as const
    const { result, rerender } = renderSync({ api, options })
    await settle()
    act(() => result.current.loadView(view.id))
    await settle()
    await settle()
    vi.spyOn(api, 'setFilterModel').mockImplementation(() => {
      throw new Error('grid broke')
    })

    rerender({ api, options: { ...options, maxValueLength: 50 } })
    await settle()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ code: 'GRID_ERROR' })
    expect(onError.mock.calls[0]?.[1]).toBe('initialization')
  })

  test('a failed address-bar write of a kept-view restore is a filter change', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', NAME_JO)
    store.persistActiveViewId(null)
    const onError = vi.fn()
    const { api } = createTimedGrid(timing)

    const { result, rerender } = renderSync({
      api,
      options: { storageKey: 't', onError }
    })

    await settle()
    act(() => result.current.loadView(view.id))
    await settle()
    await settle()
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new Error('blocked')
    })

    rerender({ api, options: { storageKey: 't', onError, history: 'push' } })
    await settle()
    await settle()

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      code: 'HISTORY_WRITE_FAILED'
    })
    expect(onError.mock.calls[0]?.[1]).toBe('filter-change')
  })

  test('a stored view on mount in StrictMode writes no entry', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', NAME_JO)
    store.persistActiveViewId(view.id)
    const push = vi.spyOn(window.history, 'pushState')
    const { api } = createTimedGrid(timing)

    const { result } = renderSync(
      {
        api,
        options: { history: 'push', storageKey: 't', autoApplyOnMount: true }
      },
      true
    )

    await settle()
    await settle()

    expect(result.current.activeViewId).toBe(view.id)
    expect(params().get('f_name_contains')).toBe('jo')
    expect(push).not.toHaveBeenCalled()
  })

  test('a new sync on the same grid keeps the view with no new entry', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', NAME_JO)
    store.persistActiveViewId(null)
    const { api } = createTimedGrid(timing)
    const options = { history: 'push', storageKey: 't' } as const
    const { result, rerender } = renderSync({ api, options })
    await settle()
    act(() => result.current.loadView(view.id))
    await settle()
    await settle()
    const push = vi.spyOn(window.history, 'pushState')

    rerender({ api, options: { ...options, maxValueLength: 50 } })
    await settle()
    await settle()

    expect(result.current.activeViewId).toBe(view.id)
    expect(push).not.toHaveBeenCalled()
  })
})

// A new sync on the same grid before the old sync's write lands (#276). The
// late filterChanged is the old write's landing, not a user edit.
describe.each(GRID_TIMINGS)(
  'a new sync before a landing, %s grid (#276)',
  timing => {
    // The grid drops the filter of a column that it does not have, so the grid
    // state and the address bar differ
    const URL_WITH_DROPPED = '/?f_name_contains=jo&f_nosuch_contains=a'

    test.each([undefined, 't'])(
      'a StrictMode remount adds no entry (storageKey %s)',
      async storageKey => {
        window.history.replaceState(null, '', URL_WITH_DROPPED)
        const push = vi.spyOn(window.history, 'pushState')
        const { api } = createTimedGrid(timing)

        renderSync(
          {
            api,
            options: { history: 'push', autoApplyOnMount: true, storageKey }
          },
          true
        )
        await settle()
        await settle()

        expect(api.getFilterModel()).toMatchObject(NAME_JO)
        expect(push).not.toHaveBeenCalled()
        expect(window.location.search).toBe(
          '?f_name_contains=jo&f_nosuch_contains=a'
        )
      }
    )

    test('a new sync for a non-codec option in the mount tick adds no entry', async () => {
      window.history.replaceState(null, '', URL_WITH_DROPPED)
      const push = vi.spyOn(window.history, 'pushState')
      const { api } = createTimedGrid(timing)
      const options = { history: 'push', autoApplyOnMount: true } as const

      const { rerender } = renderSync({ api, options })
      rerender({ api, options: { ...options, popstate: false } })
      await settle()
      await settle()

      expect(api.getFilterModel()).toMatchObject(NAME_JO)
      expect(push).not.toHaveBeenCalled()
    })

    test('a user edit after the landing still adds one entry', async () => {
      window.history.replaceState(null, '', URL_WITH_DROPPED)
      const { api, userEdit } = createTimedGrid(timing)

      renderSync(
        { api, options: { history: 'push', autoApplyOnMount: true } },
        true
      )
      await settle()
      await settle()
      const length = window.history.length

      act(() => userEdit(NAME_X))
      await settle()
      await settle()

      expect(window.history.length).toBe(length + 1)
      expect(params().get('f_name_contains')).toBe('x')
    })
  }
)

// React's <Activity> runs the effect cleanups while it hides the tree, and
// the grid stays. A write can land while no sync listens (#276 review).
describe.each(GRID_TIMINGS)('a hidden Activity, %s grid (#276)', timing => {
  function Probe(props: Props) {
    useAGGridUrlSync(props.api, props.options)

    return null
  }

  function renderActivity(props: Props, mode: 'visible' | 'hidden') {
    return (
      <Activity mode={mode}>
        <Probe {...props} />
      </Activity>
    )
  }

  test('a user edit after the tree shows again writes the URL', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const { api, userEdit } = createTimedGrid(timing)

    const props = {
      api,
      options: { history: 'push', autoApplyOnMount: true }
    } as const

    const view = render(renderActivity(props, 'visible'))
    view.rerender(renderActivity(props, 'hidden'))
    await settle()
    await settle()
    view.rerender(renderActivity(props, 'visible'))
    await settle()

    act(() => userEdit({}))
    await settle()
    await settle()

    expect(api.getFilterModel()).toEqual({})
    expect(window.location.search).toBe('')
  })
})
