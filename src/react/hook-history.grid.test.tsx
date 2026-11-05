import { Activity, StrictMode } from 'react'
import { render, renderHook, act } from '@testing-library/react'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FilterModel, GridApi } from 'ag-grid-community'
import { useGridUrlSync } from './use-grid-url-sync.js'
import type { UseGridUrlSyncOptions } from './types.js'
import { grouped } from '../core/codecs.js'
import { createViewStore } from '../core/view-storage.js'
import {
  createRealGrid,
  createTimedGrid,
  GRID_TIMINGS,
  useRealLocation
} from '../test-helpers.js'

// The hook's history and popstate options on a real AG Grid in jsdom (#270).
// The hook gets the same address-bar sync as createGridUrlSync. Ported from
// the tests of the removed 0.5 hook (#226).

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

type Props = {
  api: GridApi | null
  options: Omit<UseGridUrlSyncOptions, 'api'>
}

const useSync = ({ api, options }: Props) => useGridUrlSync({ api, ...options })

/** The code and the source of each issue that onIssue got */
const issuesOf = (onIssue: ReturnType<typeof vi.fn>) =>
  onIssue.mock.calls.map(([event]) => [event.issue.code, event.source])

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
    expect(result.current.url).toBe(window.location.href)
  })

  test('uses the codec in the address bar', async () => {
    const api = createRealGrid()
    renderSync({
      api,
      options: { history: 'replace', codec: grouped({ param: 'g' }) }
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

  test('applyUrl writes no history entry', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api, options: { history: 'push' } })
    await settle()
    const push = vi.spyOn(window.history, 'pushState')

    act(() => {
      result.current.applyUrl('https://x.test/?f_name_contains=jo')
    })
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(push).not.toHaveBeenCalled()
  })

  test('applyFilters writes as a user edit does, also to clear', async () => {
    const api = createRealGrid()
    const { result } = renderSync({ api, options: { history: 'push' } })
    await settle()
    const length = window.history.length

    act(() => {
      result.current.applyFilters(NAME_JO)
    })
    await settle()
    act(() => {
      result.current.applyFilters({})
    })
    await settle()

    expect(window.history.length).toBe(length + 2)
    expect(window.location.search).toBe('')
  })

  test('a history write that throws goes to onIssue', async () => {
    const api = createRealGrid()
    const onIssue = vi.fn()
    renderSync({ api, options: { history: 'replace', onIssue } })
    await settle()
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new Error('blocked')
    })

    await edit(api, NAME_JO)

    expect(issuesOf(onIssue)).toEqual([['HISTORY_WRITE_FAILED', 'grid']])
  })
})

describe('popstate option (#270)', () => {
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
      options: { history: 'replace', popstate: true }
    })
    await settle()

    await back()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
  })

  test('a grid error on back goes to onIssue with the source url', async () => {
    const api = createRealGrid()
    const onIssue = vi.fn()
    renderSync({ api, options: { history: 'push', onIssue } })
    await settle()
    await edit(api, NAME_JO)
    vi.spyOn(api, 'setFilterModel').mockImplementation(() => {
      throw new Error('grid broke')
    })

    await back()

    expect(issuesOf(onIssue)).toEqual([['GRID_ERROR', 'url']])
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

  test('a bad param on back goes to issues and to onIssue one time', async () => {
    const api = createRealGrid()
    const onIssue = vi.fn()

    const { result } = renderSync({
      api,
      options: { history: 'push', onIssue }
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
    expect(issuesOf(onIssue)).toEqual([['INVALID_PARAM', 'url']])
    expect(result.current.issues).toHaveLength(1)
    expect(result.current.issues[0]?.column).toBe('age')
  })

  test('back ends the apply issues of an earlier sync on the grid', async () => {
    window.history.replaceState(null, '', '/')
    window.history.pushState(null, '', '/?f_age_unknownOperation=1')
    const api = createRealGrid()

    const { result, rerender } = renderSync({
      api,
      options: { history: 'push' }
    })

    await settle()
    expect(result.current.issues).toHaveLength(1)

    // A new sync on the same grid shows the earlier sync's apply issues
    rerender({
      api,
      options: { history: 'push', maxValueLength: 50 }
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
      const view = store.saveView('A', { filterModel: NAME_JO })
      store.persistActiveViewId(view.id)
      const length = window.history.length
      const push = vi.spyOn(window.history, 'pushState')
      const api = createRealGrid()

      const { result } = renderSync(
        {
          api,
          options: { history: 'push', storageKey: 't' }
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
    const view = store.saveView('A', { filterModel: NAME_JO })
    store.persistActiveViewId(view.id)
    window.history.replaceState(null, '', '/?f_name_contains=x')
    const push = vi.spyOn(window.history, 'pushState')
    const api = createRealGrid()

    const { result } = renderSync({
      api,
      options: { history: 'push', storageKey: 't' }
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
  test('keeps the view on an option change', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', { filterModel: NAME_JO })
    store.persistActiveViewId(null)
    const { api } = createTimedGrid(timing)
    const options = { storageKey: 't' } as const
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

  test('a kept-view restore that fails reports GRID_ERROR one time', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', { filterModel: NAME_JO })
    store.persistActiveViewId(null)
    const onIssue = vi.fn()
    const { api } = createTimedGrid(timing)
    const options = { storageKey: 't', onIssue } as const
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

    expect(issuesOf(onIssue)).toEqual([['GRID_ERROR', 'url']])
  })

  test('a failed address-bar write of a kept-view restore reports HISTORY_WRITE_FAILED', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', { filterModel: NAME_JO })
    store.persistActiveViewId(null)
    const onIssue = vi.fn()
    const { api } = createTimedGrid(timing)

    const { result, rerender } = renderSync({
      api,
      options: { storageKey: 't', onIssue }
    })

    await settle()
    act(() => result.current.loadView(view.id))
    await settle()
    await settle()
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new Error('blocked')
    })

    rerender({ api, options: { storageKey: 't', onIssue, history: 'push' } })
    await settle()
    await settle()

    expect(issuesOf(onIssue)).toEqual([['HISTORY_WRITE_FAILED', 'url']])
  })

  test('a new sync on the same grid keeps the view with no new entry', async () => {
    const store = createViewStore('t')
    const view = store.saveView('A', { filterModel: NAME_JO })
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
            options: { history: 'push', storageKey }
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
      const options = { history: 'push' } as const

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

      renderSync({ api, options: { history: 'push' } }, true)
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
    useGridUrlSync({ api: props.api, ...props.options })

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
      options: { history: 'push' }
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
