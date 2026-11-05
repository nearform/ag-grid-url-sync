import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { GridOptions } from 'ag-grid-community'
import { createGridUrlSync, createSync, handOver } from './grid-url-sync.js'
import type { IssueEvent } from './types.js'
import { createRealGrid, useRealLocation } from '../test-helpers.js'

// createGridUrlSync takes the type of a shared operation from the grid's
// column (#224). Before the first row data, AG Grid does not know an
// inferred type, so the sync waits for the data.

const ROWS = [
  { zip: '01234', age: 30, dob: '2020-01-01' },
  { zip: '9', age: 40, dob: '2021-02-02' }
]

/** Columns with no filter name: AG Grid infers each type from the data */
function inferredGrid(gridOptions: Partial<GridOptions> = {}) {
  return createRealGrid({
    columnDefs: [{ field: 'zip' }, { field: 'age' }, { field: 'dob' }],
    defaultColDef: { filter: true },
    rowData: ROWS,
    ...gridOptions
  })
}

/** AG Grid sends rowDataUpdated and filterChanged after the call returns */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve))

beforeEach(() => {
  useRealLocation('/')
  vi.stubGlobal('reportError', vi.fn<(error: Error) => void>())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('createGridUrlSync: the type of a shared operation', () => {
  it('keeps a leading zero on a text column, with no history write', async () => {
    window.history.replaceState(null, '', '/?f_zip_eq=01234')
    const push = vi.spyOn(window.history, 'pushState')
    const replace = vi.spyOn(window.history, 'replaceState')
    const api = inferredGrid()
    const sync = createGridUrlSync({ api, history: 'push' })
    await settle()

    expect(api.getFilterModel()).toEqual({
      zip: { filterType: 'text', type: 'equals', filter: '01234' }
    })
    expect(api.getDisplayedRowCount()).toBe(1)
    expect(sync.getSnapshot().url).toContain('f_zip_eq=01234')
    expect(sync.getSnapshot().issues).toEqual([])
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('reads a number on a number column', async () => {
    window.history.replaceState(null, '', '/?f_age_eq=30')
    const api = inferredGrid()
    createGridUrlSync({ api })
    await settle()

    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'equals', filter: 30 }
    })
    expect(api.getDisplayedRowCount()).toBe(1)
  })

  it('reads a date on a date column, and text on a text column', async () => {
    window.history.replaceState(
      null,
      '',
      '/?f_dob_eq=2020-01-01&f_zip_neq=2020-01-01'
    )
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = inferredGrid()
    createGridUrlSync({ api, onIssue })
    await settle()

    expect(api.getFilterModel()).toMatchObject({
      dob: { filterType: 'date', type: 'equals' },
      zip: { filterType: 'text', type: 'notEqual', filter: '2020-01-01' }
    })
    expect(onIssue).not.toHaveBeenCalled()
  })

  it('reports a value that is not a number on a number column', async () => {
    window.history.replaceState(null, '', '/?f_age_eq=abc')
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = inferredGrid()
    const sync = createGridUrlSync({ api, onIssue })
    await settle()

    expect(api.getFilterModel()).toEqual({})
    expect(onIssue).toHaveBeenCalledTimes(1)
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      issue: { code: 'INVALID_NUMBER', column: 'age' },
      source: 'url'
    })
    expect(sync.getSnapshot().issues).toHaveLength(1)
  })

  it('writes a user edit of a text column with the leading zero', async () => {
    const push = vi.spyOn(window.history, 'pushState')
    const api = inferredGrid()
    createGridUrlSync({ api, history: 'push' })

    api.setFilterModel({
      zip: { filterType: 'text', type: 'equals', filter: '007' }
    })
    await settle()

    expect(push).toHaveBeenCalledTimes(1)
    expect(window.location.search).toBe('?f_zip_eq=007')
  })
})

describe('createGridUrlSync: before the first row data', () => {
  it('applies the URL when the row data arrives', async () => {
    window.history.replaceState(null, '', '/?f_age_eq=30&f_zip_eq=01234')
    const push = vi.spyOn(window.history, 'pushState')
    const api = inferredGrid({ rowData: null })
    const sync = createGridUrlSync({ api, history: 'push' })
    await settle()

    expect(api.getFilterModel()).toEqual({})
    expect(sync.getSnapshot()).toMatchObject({ status: 'active', issues: [] })

    api.setGridOption('rowData', ROWS)
    await settle()

    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'equals', filter: 30 },
      zip: { filterType: 'text', type: 'equals', filter: '01234' }
    })
    expect(api.getDisplayedRowCount()).toBe(1)
    expect(sync.getSnapshot().url).toContain('f_age_eq=30')
    expect(sync.getSnapshot().url).toContain('f_zip_eq=01234')
    expect(push).not.toHaveBeenCalled()
  })

  it('applies the URL when a transaction adds the first rows', async () => {
    window.history.replaceState(null, '', '/?f_age_eq=40')
    const api = inferredGrid({ rowData: null })
    createGridUrlSync({ api })

    api.applyTransaction({ add: ROWS })
    await settle()

    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'equals', filter: 40 }
    })
  })

  it('keeps waiting while the row data is empty', async () => {
    window.history.replaceState(null, '', '/?f_age_eq=30')
    const api = inferredGrid({ rowData: null })
    createGridUrlSync({ api })

    api.setGridOption('rowData', [])
    await settle()

    expect(api.getFilterModel()).toEqual({})

    api.setGridOption('rowData', ROWS)
    await settle()

    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'equals', filter: 30 }
    })
  })

  it('reports the issues of the URL when it applies', async () => {
    window.history.replaceState(null, '', '/?f_age_eq=abc')
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = inferredGrid({ rowData: null })
    const sync = createGridUrlSync({ api, onIssue })
    await settle()

    expect(onIssue).not.toHaveBeenCalled()

    api.setGridOption('rowData', ROWS)
    await settle()

    expect(onIssue).toHaveBeenCalledTimes(1)
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      issue: { code: 'INVALID_NUMBER', column: 'age' },
      source: 'url'
    })
    expect(sync.getSnapshot().issues).toHaveLength(1)
  })

  it('waits for a filter of one type too, and then checks its type', async () => {
    // zip becomes a text column, so a number filter on it is a mismatch
    window.history.replaceState(null, '', '/?f_age_gt=35&f_zip_gt=5')
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = inferredGrid({ rowData: null })
    const setFilterModel = vi.spyOn(api, 'setFilterModel')
    createGridUrlSync({ api, onIssue })

    expect(setFilterModel).not.toHaveBeenCalled()

    api.setGridOption('rowData', ROWS)
    await settle()

    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'greaterThan', filter: 35 }
    })
    expect(onIssue).toHaveBeenCalledTimes(1)
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      issue: { code: 'TYPE_MISMATCH', column: 'zip' },
      source: 'url'
    })
  })

  it('does not wait for a column with a set type', () => {
    window.history.replaceState(null, '', '/?f_age_eq=30')

    const api = inferredGrid({
      rowData: null,
      columnDefs: [{ field: 'age', cellDataType: 'number' }, { field: 'zip' }]
    })

    const setFilterModel = vi.spyOn(api, 'setFilterModel')
    createGridUrlSync({ api })

    // AG Grid holds the model itself while zip is pending
    expect(setFilterModel).toHaveBeenCalledWith({
      age: { filterType: 'number', type: 'equals', filter: 30 }
    })
  })

  it('reports a grid that cannot take the row data listener (#286 review)', () => {
    window.history.replaceState(null, '', '/?f_age_eq=30')
    const api = inferredGrid({ rowData: null })
    const add = api.addEventListener.bind(api)

    vi.spyOn(api, 'addEventListener').mockImplementation((type, listener) => {
      if (type === 'rowDataUpdated') throw new Error('No row data listener')

      add(type, listener)
    })

    const onIssue = vi.fn<(event: IssueEvent) => void>()

    const sync = createGridUrlSync({ api, onIssue })

    expect(sync.getSnapshot().status).toBe('active')
    expect(
      onIssue.mock.calls.map(([event]) => [event.issue.code, event.source])
    ).toEqual([['GRID_ERROR', 'url']])
  })

  it('waits for applyUrl too, which gives no issues yet', async () => {
    const api = inferredGrid({ rowData: null })
    const sync = createGridUrlSync({ api })

    expect(sync.applyUrl('/?f_age_eq=30')).toEqual({ issues: [] })

    api.setGridOption('rowData', ROWS)
    await settle()

    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'equals', filter: 30 }
    })
  })

  it('applies only the last waiting URL', async () => {
    const api = inferredGrid({ rowData: null })
    const sync = createGridUrlSync({ api })

    sync.applyUrl('/?f_age_eq=30')
    sync.applyUrl('/?f_age_eq=40')

    api.setGridOption('rowData', ROWS)
    await settle()

    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'equals', filter: 40 }
    })
  })

  it('drops the waiting URL at applyFilters', async () => {
    window.history.replaceState(null, '', '/?f_age_eq=30')
    const api = inferredGrid({ rowData: null })
    const sync = createGridUrlSync({ api })

    sync.applyFilters({
      age: { filterType: 'number', type: 'greaterThan', filter: 35 }
    })

    api.setGridOption('rowData', ROWS)
    await settle()

    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'greaterThan', filter: 35 }
    })
  })

  it('clears the issues of the earlier apply while the URL waits', () => {
    const api = inferredGrid({ rowData: null })
    const sync = createGridUrlSync({ api })

    sync.applyUrl('/?f_age_gt=abc')
    expect(sync.getSnapshot().issues).toHaveLength(1)

    sync.applyUrl('/?f_age_eq=30')
    expect(sync.getSnapshot().issues).toEqual([])
  })

  it('gives the waiting URL to the next sync on the same grid', async () => {
    window.history.replaceState(null, '', '/?f_age_eq=30')
    const api = inferredGrid({ rowData: null })
    const first = createSync({ api })
    const handover = handOver(first)
    first.destroy()
    createSync({ api, applyUrlOnCreate: false }, { handover })

    api.setGridOption('rowData', ROWS)
    await settle()

    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'equals', filter: 30 }
    })
  })

  it('does not wait after the grid had rows, also with no rows now', async () => {
    // The first zip value is null, so AG Grid infers no type for it
    const api = createRealGrid({
      columnDefs: [{ field: 'zip' }, { field: 'age' }],
      defaultColDef: { filter: true },
      rowData: [
        { zip: null, age: 1 },
        { zip: '5', age: 2 }
      ]
    })

    const sync = createGridUrlSync({ api })

    api.setGridOption('rowData', [])
    await settle()
    sync.applyUrl('/?f_zip_eq=5')
    await settle()

    expect(api.getFilterModel()).toEqual({
      zip: { filterType: 'text', type: 'equals', filter: '5' }
    })
  })

  it('does not wait for a column that AG Grid does not infer', () => {
    window.history.replaceState(null, '', '/?f_full_eq=x')

    const api = createRealGrid({
      columnDefs: [
        { field: 'age', cellDataType: 'number' },
        { colId: 'full', valueGetter: () => 'x' }
      ],
      defaultColDef: { filter: true },
      rowData: null
    })

    createGridUrlSync({ api })

    expect(api.getFilterModel()).toEqual({
      full: { filterType: 'text', type: 'equals', filter: 'x' }
    })
  })

  it('drops the waiting URL at destroy', async () => {
    window.history.replaceState(null, '', '/?f_age_eq=30')
    const api = inferredGrid({ rowData: null })
    const sync = createGridUrlSync({ api })

    sync.destroy()
    api.setGridOption('rowData', ROWS)
    await settle()

    expect(api.getFilterModel()).toEqual({})
  })
})
