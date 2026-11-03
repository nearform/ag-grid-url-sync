import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { GridApi } from 'ag-grid-community'
import { createGridUrlSync } from './grid-url-sync.js'
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

beforeEach(() => {
  useRealLocation('/')
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

  it('runs the other listeners when one throws, and keeps working', async () => {
    const api = createRealGrid()
    const sync = createGridUrlSync({ api })

    const failing = vi.fn<() => void>(() => {
      throw new Error('listener')
    })

    const other = vi.fn()
    sync.subscribe(failing)
    sync.subscribe(other)

    // The sync's own apply notifies at once, so the throw reaches applyUrl
    expect(() => sync.applyUrl('https://x.test/?f_name_contains=jo')).toThrow(
      'listener'
    )

    expect(other).toHaveBeenCalledOnce()
    expect(sync.getSnapshot().hasFilters).toBe(true)

    failing.mockImplementation(() => {})
    api.setFilterModel(null)
    await settle()

    expect(sync.getSnapshot().hasFilters).toBe(false)
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
})
