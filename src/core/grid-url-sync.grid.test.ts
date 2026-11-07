import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { GridApi } from 'ag-grid-community'
import { createGridUrlSync, createSync, handOver } from './grid-url-sync.js'
import { grouped } from './codecs.js'
import { serializeGrouped } from './serialization/grouped.js'
import type { IssueEvent } from './types.js'
import { createRealGrid, useRealLocation } from '../test-helpers.js'

// createGridUrlSync on a real AG Grid (#221): apply on create, snapshot,
// subscribe and the lifecycle. History writes and popstate have their own
// files.

const NAME_JO = {
  name: { filterType: 'text', type: 'contains', filter: 'jo' }
} as const

const NAME_X = {
  name: { filterType: 'text', type: 'contains', filter: 'x' }
} as const

/** AG Grid can send filterChanged after setFilterModel returns */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve))

function gridWithInitialFilter(): GridApi {
  return createRealGrid({ initialState: { filter: { filterModel: NAME_X } } })
}

/** The browser's reportError, which jsdom does not have */
let reportError: ReturnType<typeof vi.fn<(error: Error) => void>>

beforeEach(() => {
  useRealLocation('/')
  reportError = vi.fn<(error: Error) => void>()
  vi.stubGlobal('reportError', reportError)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createGridUrlSync: apply on create', () => {
  it('applies the URL filters on create', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const api = createRealGrid()
    const sync = createGridUrlSync({ api })
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(sync.getSnapshot()).toMatchObject({
      status: 'active',
      hasFilters: true,
      issues: []
    })
    expect(sync.getSnapshot().url).toContain('f_name_contains=jo')
  })

  it('keeps the grid filters when the URL has no filter params', async () => {
    window.history.replaceState(null, '', '/?page=2')
    const api = gridWithInitialFilter()
    createGridUrlSync({ api })
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_X)
  })

  it('keeps the grid filters when every filter param is bad', async () => {
    window.history.replaceState(null, '', '/?f_age_gt=abc')
    const api = gridWithInitialFilter()
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const sync = createGridUrlSync({ api, onIssue })
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_X)
    expect(sync.getSnapshot().issues[0]?.code).toBe('INVALID_NUMBER')
    expect(onIssue).toHaveBeenCalledOnce()
    expect(onIssue.mock.calls[0]?.[0].source).toBe('url')
  })

  it('does not apply with applyUrlOnCreate false', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const api = createRealGrid()
    createGridUrlSync({ api, applyUrlOnCreate: false })
    await settle()

    expect(api.getFilterModel()).toEqual({})
  })

  it('never throws on create, even with throwOnError true', async () => {
    window.history.replaceState(null, '', '/?f_age_gt=abc')
    const api = createRealGrid()
    const sync = createGridUrlSync({ api, throwOnError: true })
    await settle()

    expect(sync.getSnapshot().issues[0]?.code).toBe('INVALID_NUMBER')
  })

  it('applies a grouped codec', async () => {
    const { value } = serializeGrouped(NAME_JO, {
      serialization: 'grouped',
      groupedParam: 'gf',
      format: 'json'
    })

    window.history.replaceState(
      null,
      '',
      `/?gf=${encodeURIComponent(value ?? '')}`
    )
    const api = createRealGrid()
    createGridUrlSync({ api, codec: grouped({ param: 'gf', format: 'json' }) })
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
  })
})

describe('createGridUrlSync: applyUrl', () => {
  it('applies a URL and returns its issues', async () => {
    const api = createRealGrid()
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const sync = createGridUrlSync({ api, onIssue })

    const result = sync.applyUrl(
      'https://x.test/?f_name_contains=jo&f_age_gt=abc'
    )

    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(result.issues.map(issue => issue.code)).toEqual(['INVALID_NUMBER'])
    expect(onIssue.mock.calls.map(([event]) => event.source)).toEqual(['api'])
  })

  it('clears the grid for a URL with no filters', async () => {
    const api = gridWithInitialFilter()
    const sync = createGridUrlSync({ api })

    sync.applyUrl('https://x.test/?page=2')
    await settle()

    expect(api.getFilterModel()).toEqual({})
  })

  it('throws with throwOnError true and leaves the grid unchanged', async () => {
    const api = gridWithInitialFilter()
    const onIssue = vi.fn()
    const sync = createGridUrlSync({ api, throwOnError: true, onIssue })

    expect(() =>
      sync.applyUrl('https://x.test/?f_name_contains=jo&f_age_gt=abc')
    ).toThrow(expect.objectContaining({ code: 'INVALID_NUMBER' }))
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_X)
    expect(onIssue).not.toHaveBeenCalled()
  })

  it('reports INVALID_URL and leaves the grid unchanged', async () => {
    const api = gridWithInitialFilter()
    const sync = createGridUrlSync({ api })

    const result = sync.applyUrl('http://')
    await settle()

    expect(result.issues.map(issue => issue.code)).toEqual(['INVALID_URL'])
    expect(api.getFilterModel()).toMatchObject(NAME_X)
  })
})

describe('createGridUrlSync: snapshot and subscribe', () => {
  it('updates the snapshot on filterChanged and notifies one time', async () => {
    const api = createRealGrid()
    const sync = createGridUrlSync({ api })
    const listener = vi.fn()
    sync.subscribe(listener)

    api.setFilterModel(NAME_JO)
    await settle()

    expect(listener).toHaveBeenCalledOnce()
    expect(sync.getSnapshot().hasFilters).toBe(true)
    expect(sync.getSnapshot().url).toContain('f_name_contains=jo')
  })

  it('keeps the snapshot identity when nothing changes', async () => {
    const api = createRealGrid()
    const sync = createGridUrlSync({ api })
    api.setFilterModel(NAME_JO)
    await settle()
    const before = sync.getSnapshot()

    expect(sync.getSnapshot()).toBe(before)

    api.onFilterChanged()
    await settle()

    expect(sync.getSnapshot()).toBe(before)
  })

  // The React hook keeps its issues array stable from this (#222)
  it('keeps the issues array when only the url changes', async () => {
    const api = createRealGrid()
    const sync = createGridUrlSync({ api, maxValueLength: 3 })
    const tooLong = { filterType: 'text', type: 'contains', filter: 'abcd' }

    api.setFilterModel({
      name: tooLong,
      age: { filterType: 'number', type: 'greaterThan', filter: 5 }
    })

    await settle()
    const before = sync.getSnapshot()

    api.setFilterModel({
      name: tooLong,
      age: { filterType: 'number', type: 'greaterThan', filter: 6 }
    })

    await settle()

    expect(before.issues).toHaveLength(1)
    expect(sync.getSnapshot().url).not.toBe(before.url)
    expect(sync.getSnapshot().issues).toBe(before.issues)
  })

  it('runs the other listeners when one throws, and keeps working', async () => {
    const api = createRealGrid()
    const sync = createGridUrlSync({ api })

    const failing = vi.fn<() => void>(() => {
      throw new Error('listener')
    })

    const other = vi.fn()
    sync.subscribe(failing)
    sync.subscribe(other)

    // A listener's error is the app's bug: it is reported out of band, and
    // the call that notified does not throw it
    sync.applyUrl('https://x.test/?f_name_contains=jo')

    expect(reportError).toHaveBeenCalledWith(new Error('listener'))
    expect(other).toHaveBeenCalledOnce()
    expect(sync.getSnapshot().hasFilters).toBe(true)

    failing.mockImplementation(() => {})
    api.setFilterModel(null)
    await settle()

    expect(sync.getSnapshot().hasFilters).toBe(false)
  })

  it("does not stop the grid's other filterChanged listeners when one throws", async () => {
    const api = createRealGrid()
    const sync = createGridUrlSync({ api })

    const unsubscribe = sync.subscribe(() => {
      throw new Error('listener')
    })

    const appListener = vi.fn()
    api.addEventListener('filterChanged', appListener)

    api.setFilterModel(NAME_JO)
    await settle()

    expect(appListener).toHaveBeenCalledOnce()
    expect(reportError).toHaveBeenCalledWith(new Error('listener'))

    // The grid is destroyed after reportError is no longer a stub
    unsubscribe()
  })

  it('runs the other listeners when one unsubscribes during notify', async () => {
    const api = createRealGrid()
    const sync = createGridUrlSync({ api })
    const other = vi.fn()
    const unsubscribe = sync.subscribe(() => unsubscribe())
    sync.subscribe(other)

    api.setFilterModel(NAME_JO)
    await settle()

    expect(other).toHaveBeenCalledOnce()
  })
})

describe('createGridUrlSync: onIssue', () => {
  it('a throwing onIssue does not make create throw or leak listeners', async () => {
    window.history.replaceState(null, '', '/?f_age_gt=abc')
    const api = createRealGrid()

    const onIssue = vi.fn<(event: IssueEvent) => void>(() => {
      throw new Error('boom')
    })

    const sync = createGridUrlSync({ api, onIssue })

    expect(onIssue).toHaveBeenCalledOnce()
    expect(onIssue.mock.calls[0]?.[0].issue.code).toBe('INVALID_NUMBER')
    expect(reportError).toHaveBeenCalledWith(new Error('boom'))

    sync.destroy()
    const listener = vi.fn()
    sync.subscribe(listener)
    api.setFilterModel(NAME_JO)
    await settle()

    expect(listener).not.toHaveBeenCalled()
  })

  it('reports each grid-read issue one time when the list grows', async () => {
    const api = createRealGrid({
      columnDefs: [
        { field: 'age', filter: 'agNumberColumnFilter' },
        { field: 'price', filter: 'agNumberColumnFilter' }
      ]
    })

    const onIssue = vi.fn<(event: IssueEvent) => void>()
    createGridUrlSync({ api, onIssue })

    api.setFilterModel({
      age: { filterType: 'number', type: 'greaterThan', filter: 'abc' }
    })
    await settle()
    api.setFilterModel({
      age: { filterType: 'number', type: 'greaterThan', filter: 'abc' },
      price: { filterType: 'number', type: 'greaterThan', filter: 'xyz' }
    })
    await settle()

    expect(
      onIssue.mock.calls.map(
        ([event]) => `${event.source}:${event.issue.column}`
      )
    ).toEqual(['grid:age', 'grid:price'])
  })

  describe('a new sync on the same grid (#305)', () => {
    const AGE_BAD = {
      age: { filterType: 'number', type: 'greaterThan', filter: 'abc' }
    } as const

    const PRICE_BAD = {
      price: { filterType: 'number', type: 'greaterThan', filter: 'xyz' }
    } as const

    const gridWithPrice = () =>
      createRealGrid({
        columnDefs: [
          { field: 'age', filter: 'agNumberColumnFilter' },
          { field: 'price', filter: 'agNumberColumnFilter' }
        ]
      })

    it('does not report the read issues of the last sync again', async () => {
      const api = gridWithPrice()
      const onIssue = vi.fn<(event: IssueEvent) => void>()
      const first = createSync({ api, onIssue })
      api.setFilterModel(AGE_BAD)
      await settle()
      const handover = handOver(first)
      first.destroy()

      const next = createSync(
        { api, onIssue, maxValueLength: 50, applyUrlOnCreate: false },
        { handover }
      )

      expect(onIssue).toHaveBeenCalledOnce()
      expect(next.getSnapshot().issues).toMatchObject([
        { code: 'INVALID_NUMBER', column: 'age' }
      ])
    })

    it('reports a read issue that the last sync did not have', async () => {
      const api = gridWithPrice()
      const first = createSync({ api, onIssue: () => {} })
      api.setFilterModel(AGE_BAD)
      await settle()
      const handover = handOver(first)
      first.destroy()
      api.setFilterModel({ ...AGE_BAD, ...PRICE_BAD })
      await settle()
      const onIssue = vi.fn<(event: IssueEvent) => void>()

      createSync({ api, onIssue }, { handover })

      expect(onIssue.mock.calls.map(([event]) => event.issue.column)).toEqual([
        'price'
      ])
    })
  })
})

describe('createGridUrlSync: failures are not issues (#284)', () => {
  const codes = (list: readonly { code: string }[]) => list.map(i => i.code)

  it('a failed grid read goes to onIssue, not to the snapshot', async () => {
    const api = createRealGrid()
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const sync = createGridUrlSync({ api, onIssue })

    vi.spyOn(api, 'getFilterModel').mockImplementation(() => {
      throw new Error('Read failed')
    })

    api.setFilterModel(NAME_JO)
    await settle()

    expect(
      onIssue.mock.calls.map(([event]) => [event.issue.code, event.source])
    ).toEqual([['GRID_ERROR', 'grid']])
    expect(sync.getSnapshot().issues).toEqual([])
  })

  it('a grid read that keeps failing is reported one time', async () => {
    const api = createRealGrid()
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    createGridUrlSync({ api, onIssue })

    vi.spyOn(api, 'getFilterModel').mockImplementation(() => {
      throw new Error('Read failed')
    })

    api.setFilterModel(NAME_JO)
    await settle()
    api.setFilterModel(NAME_X)
    await settle()

    expect(onIssue).toHaveBeenCalledOnce()
  })

  it('a failed URL apply gives only its data issues', () => {
    const api = createRealGrid()
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const sync = createGridUrlSync({ api, onIssue })

    vi.spyOn(api, 'setFilterModel').mockImplementation(() => {
      throw new Error('Write failed')
    })

    const result = sync.applyUrl(
      'https://x.test/?f_name_contains=jo&f_age_unknownOperation=1'
    )

    expect(codes(result.issues)).toEqual(['INVALID_PARAM'])
    expect(codes(sync.getSnapshot().issues)).toEqual(['INVALID_PARAM'])
    expect(onIssue.mock.calls.map(([event]) => event.issue.code)).toEqual([
      'INVALID_PARAM',
      'GRID_ERROR'
    ])
  })

  it('a failed applyFilters gives no GRID_ERROR', () => {
    const api = createRealGrid()
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const sync = createGridUrlSync({ api, onIssue })

    vi.spyOn(api, 'setFilterModel').mockImplementation(() => {
      throw new Error('Write failed')
    })

    const result = sync.applyFilters({
      name: { filterType: 'text', type: 'contains', filter: 'jo' }
    })

    expect(result.issues).toEqual([])
    expect(sync.getSnapshot().issues).toEqual([])
    expect(onIssue.mock.calls.map(([event]) => event.issue.code)).toEqual([
      'GRID_ERROR'
    ])
  })
})

describe('createGridUrlSync: lifecycle', () => {
  it('stops listening after destroy, and destroy is idempotent', async () => {
    const api = createRealGrid()
    const sync = createGridUrlSync({ api })
    const listener = vi.fn()
    sync.subscribe(listener)

    sync.destroy()

    expect(listener).toHaveBeenCalledOnce()
    expect(sync.getSnapshot().status).toBe('destroyed')

    const frozen = sync.getSnapshot()
    api.setFilterModel(NAME_JO)
    await settle()
    sync.destroy()

    expect(listener).toHaveBeenCalledOnce()
    expect(sync.getSnapshot()).toBe(frozen)
    expect(sync.applyUrl('https://x.test/?f_name_contains=x')).toEqual({
      issues: []
    })
  })

  it('uses the last known filters in getUrl after destroy', async () => {
    const api = createRealGrid()
    const sync = createGridUrlSync({ api })
    api.setFilterModel(NAME_JO)
    await settle()

    sync.destroy()
    api.setFilterModel(null)
    await settle()

    expect(sync.getUrl('https://x.test/')).toContain('f_name_contains=jo')
  })

  it('is destroyed when the grid is destroyed', () => {
    const api = createRealGrid()
    const sync = createGridUrlSync({ api })

    api.destroy()

    expect(sync.getSnapshot().status).toBe('destroyed')
  })

  it('keeps a second instance working when the first is destroyed', async () => {
    const api = createRealGrid()
    const first = createGridUrlSync({ api })
    const second = createGridUrlSync({ api })
    const firstListener = vi.fn()
    const secondListener = vi.fn()
    first.subscribe(firstListener)
    second.subscribe(secondListener)

    first.destroy()
    firstListener.mockClear()
    api.setFilterModel(NAME_JO)
    await settle()

    expect(firstListener).not.toHaveBeenCalled()
    expect(secondListener).toHaveBeenCalledOnce()
  })

  it('reports NOT_READY for a grid that is already destroyed', () => {
    const api = createRealGrid()
    api.destroy()
    const onIssue = vi.fn<(event: IssueEvent) => void>()

    const sync = createGridUrlSync({ api, onIssue })

    expect(sync.getSnapshot().status).toBe('destroyed')
    expect(onIssue).toHaveBeenCalledOnce()
    expect(onIssue.mock.calls[0]?.[0].issue.code).toBe('NOT_READY')
    expect(onIssue.mock.calls[0]?.[0].issue.severity).toBe('error')
  })

  it('reports GRID_ERROR for a grid that cannot take a listener (#286)', () => {
    const api = createRealGrid()
    const failure = new Error('Initialization failed')
    vi.spyOn(api, 'addEventListener').mockImplementation(() => {
      throw failure
    })
    const onIssue = vi.fn<(event: IssueEvent) => void>()

    const sync = createGridUrlSync({ api, onIssue, throwOnError: true })

    expect(sync.getSnapshot()).toMatchObject({
      status: 'destroyed',
      issues: []
    })
    expect(onIssue).toHaveBeenCalledOnce()
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      issue: { code: 'GRID_ERROR', cause: failure },
      source: 'api'
    })
  })

  it('removes the listener that it added when a later one fails (#286)', () => {
    const api = createRealGrid()
    const add = api.addEventListener.bind(api)
    vi.spyOn(api, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'gridPreDestroyed') throw new Error('Initialization failed')

      add(type, listener)
    })
    const remove = vi.spyOn(api, 'removeEventListener')

    createGridUrlSync({ api, onIssue: () => {} })

    expect(remove).toHaveBeenCalledWith('filterChanged', expect.any(Function))
  })

  it('removes a listener that the grid took before it threw (#286 review)', () => {
    const api = createRealGrid()
    const add = api.addEventListener.bind(api)
    vi.spyOn(api, 'addEventListener').mockImplementation((type, listener) => {
      add(type, listener)

      if (type === 'gridPreDestroyed') throw new Error('Initialization failed')
    })
    const remove = vi.spyOn(api, 'removeEventListener')

    createGridUrlSync({ api, onIssue: () => {} })

    expect(remove).toHaveBeenCalledWith('filterChanged', expect.any(Function))
    expect(remove).toHaveBeenCalledWith(
      'gridPreDestroyed',
      expect.any(Function)
    )
  })

  it('a sync after a listener failure does not report it again (#286 review)', () => {
    const api = createRealGrid()

    vi.spyOn(api, 'addEventListener').mockImplementation(() => {
      throw new Error('Initialization failed')
    })

    const first = createSync({ api, onIssue: () => {} })
    const onIssue = vi.fn<(event: IssueEvent) => void>()

    const next = createSync({ api, onIssue }, { handover: handOver(first) })

    expect(next.getSnapshot().status).toBe('destroyed')
    expect(onIssue).not.toHaveBeenCalled()
  })

  it('a sync after a listener failure reports a different failure (#286 review)', () => {
    const api = createRealGrid()

    const add = vi.spyOn(api, 'addEventListener').mockImplementation(() => {
      throw new Error('No filterChanged listener')
    })

    const first = createSync({ api, onIssue: () => {} })

    add.mockImplementation(() => {
      throw new Error('No gridPreDestroyed listener')
    })

    const onIssue = vi.fn<(event: IssueEvent) => void>()

    createSync({ api, onIssue }, { handover: handOver(first) })

    expect(onIssue.mock.calls.map(([event]) => event.issue.message)).toEqual([
      expect.stringContaining('No gridPreDestroyed listener')
    ])
  })

  it('a sync after a destroyed sync reports its own listener failure (#286 review)', () => {
    const api = createRealGrid()
    const first = createSync({ api })
    first.destroy()

    vi.spyOn(api, 'addEventListener').mockImplementation(() => {
      throw new Error('Initialization failed')
    })

    const onIssue = vi.fn<(event: IssueEvent) => void>()

    createSync({ api, onIssue }, { handover: handOver(first) })

    expect(onIssue.mock.calls.map(([event]) => event.issue.code)).toEqual([
      'GRID_ERROR'
    ])
  })
})
