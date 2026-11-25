import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { createGridUrlSync } from './grid-url-sync.js'
import { grouped } from './codecs.js'
import type { IssueEvent } from './types.js'
import { createRealGrid, useRealLocation } from '../test-helpers.js'

// AG Grid's FilterModel as the model of the sync (#225), on a real AG Grid.
// Community AG Grid has combined conditions. Set and multi filters are
// enterprise, so the timed grid fakes test them.

const NAME_OR: FilterModel = {
  name: {
    filterType: 'text',
    operator: 'OR',
    conditions: [
      { filterType: 'text', type: 'contains', filter: 'jo' },
      { filterType: 'text', type: 'contains', filter: 'ja' }
    ]
  }
}

const AGE_GT_35: FilterModel = {
  age: { filterType: 'number', type: 'greaterThan', filter: 35 }
}

/** AG Grid sends filterChanged after setFilterModel returns */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve))

beforeEach(() => {
  useRealLocation('/')
  vi.stubGlobal('reportError', vi.fn<(error: Error) => void>())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the individual codec on a real grid', () => {
  it('a URL apply keeps combined conditions on another column', async () => {
    window.history.replaceState(null, '', '/?f_age_gt=35')

    const api = createRealGrid({
      initialState: { filter: { filterModel: NAME_OR } }
    })

    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const sync = createGridUrlSync({ api, onIssue })
    await settle()

    expect(api.getFilterModel()).toEqual({ ...NAME_OR, ...AGE_GT_35 })
    expect(onIssue.mock.calls.map(([event]) => event.issue)).toMatchObject([
      { code: 'UNSUPPORTED_FILTER', column: 'name' }
    ])

    sync.destroy()
  })
})

describe('the json codec on a real grid', () => {
  it('round-trips combined conditions through the address bar', async () => {
    const first = createRealGrid()

    const sync = createGridUrlSync({
      api: first,
      codec: grouped({ format: 'json' }),
      history: 'replace'
    })

    first.setFilterModel({ ...NAME_OR, ...AGE_GT_35 })
    await settle()
    sync.destroy()

    const second = createRealGrid()

    const next = createGridUrlSync({
      api: second,
      codec: grouped({ format: 'json' })
    })

    await settle()

    expect(second.getFilterModel()).toEqual({ ...NAME_OR, ...AGE_GT_35 })
    // jane (40) matches both columns
    expect(second.getDisplayedRowCount()).toBe(1)

    next.destroy()
  })
})
