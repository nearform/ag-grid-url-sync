import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createGridUrlSync } from './grid-url-sync.js'
import type { IssueEvent } from './types.js'
import { createRealGrid, useRealLocation } from '../test-helpers.js'

// createGridUrlSync writes filter changes to the address bar (#221), and
// never writes for its own applies.

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
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve))

function params(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}

beforeEach(() => {
  useRealLocation('/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createGridUrlSync: history writes', () => {
  it('replace writes the filters and keeps the rest of the URL', async () => {
    window.history.replaceState({ app: 1 }, '', '/list?tab=1&tab=2#top')
    const length = window.history.length
    const api = createRealGrid()
    createGridUrlSync({ api, history: 'replace' })

    api.setFilterModel(NAME_JO)
    await settle()

    expect(params().get('f_name_contains')).toBe('jo')
    expect(params().getAll('tab')).toEqual(['1', '2'])
    expect(window.location.pathname).toBe('/list')
    expect(window.location.hash).toBe('#top')
    expect(window.history.state).toEqual({ app: 1 })
    expect(window.history.length).toBe(length)
  })

  it('push adds one entry for each filter change', async () => {
    const api = createRealGrid()
    createGridUrlSync({ api, history: 'push' })
    const length = window.history.length

    api.setFilterModel(NAME_JO)
    await settle()
    api.setFilterModel(NAME_X)
    await settle()

    expect(window.history.length).toBe(length + 2)
    expect(params().get('f_name_contains')).toBe('x')
  })

  it('never writes for its own apply', async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const length = window.history.length
    const api = createRealGrid()
    const sync = createGridUrlSync({ api, history: 'push' })
    await settle()

    sync.applyUrl(`${window.location.origin}/?f_name_contains=x`)
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_X)
    expect(window.history.length).toBe(length)
    expect(params().get('f_name_contains')).toBe('jo')
  })

  it("writes the app's own setFilterModel after create", async () => {
    window.history.replaceState(null, '', '/?f_name_contains=jo')
    const api = createRealGrid()
    createGridUrlSync({ api, history: 'replace' })

    // Before the late filterChanged of the sync's own apply
    api.setFilterModel(AGE_GT_5)
    await settle()

    expect(params().get('f_age_gt')).toBe('5')
    expect(params().has('f_name_contains')).toBe(false)
  })

  it("writes the app's own setFilterModel after an apply", async () => {
    const api = createRealGrid()
    const sync = createGridUrlSync({ api, history: 'replace' })
    sync.applyUrl(`${window.location.origin}/?f_name_contains=jo`)
    await settle()

    api.setFilterModel(AGE_GT_5)
    await settle()

    expect(params().get('f_age_gt')).toBe('5')
  })

  it('does not write when the grid matches the URL in another order', async () => {
    window.history.replaceState(
      null,
      '',
      '/?page=2&f_age_gt=5&f_name_contains=jo'
    )
    const api = createRealGrid()
    createGridUrlSync({ api, history: 'replace' })
    await settle()
    const replace = vi.spyOn(window.history, 'replaceState')

    api.setFilterModel({ ...NAME_JO, ...AGE_GT_5 })
    api.onFilterChanged()
    await settle()

    expect(replace).not.toHaveBeenCalled()
  })

  it('gives the URL to a router function and does not touch history', async () => {
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')
    const router = vi.fn<(url: string) => void>()
    const api = createRealGrid()
    createGridUrlSync({ api, history: router })

    api.setFilterModel(NAME_JO)
    await settle()

    expect(router).toHaveBeenCalledOnce()
    expect(router.mock.calls[0]?.[0]).toContain('f_name_contains=jo')
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('writes the initial grid filters with replace on create', async () => {
    const length = window.history.length

    const api = createRealGrid({
      initialState: { filter: { filterModel: NAME_X } }
    })

    createGridUrlSync({ api, history: 'push' })
    await settle()

    expect(params().get('f_name_contains')).toBe('x')
    expect(window.history.length).toBe(length)
  })

  it('never writes with history none', async () => {
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')

    const api = createRealGrid({
      initialState: { filter: { filterModel: NAME_X } }
    })

    createGridUrlSync({ api })

    api.setFilterModel(NAME_JO)
    await settle()

    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('reports a failed write as HISTORY_WRITE_FAILED', async () => {
    const api = createRealGrid()
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const sync = createGridUrlSync({ api, history: 'replace', onIssue })
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new DOMException('Too many calls', 'SecurityError')
    })

    api.setFilterModel(NAME_JO)
    await settle()

    expect(onIssue).toHaveBeenCalledOnce()

    const { issue, source } = onIssue.mock.calls[0]?.[0] ?? {}

    expect(issue?.code).toBe('HISTORY_WRITE_FAILED')
    expect(issue?.severity).toBe('error')
    expect(source).toBe('grid')
    expect(sync.getSnapshot().issues.map(i => i.code)).toEqual([
      'HISTORY_WRITE_FAILED'
    ])
  })
})
