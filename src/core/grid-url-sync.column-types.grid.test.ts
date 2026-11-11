import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type {
  ColDef,
  FilterModel,
  GridOptions,
  TextFilterModel
} from 'ag-grid-community'
import { createGridUrlSync, createSync, handOver } from './grid-url-sync.js'
import { grouped } from './codecs.js'
import type { IssueEvent } from './types.js'
import {
  asGridApi,
  createGridListeners,
  createRealGrid,
  useRealLocation
} from '../test-helpers.js'

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

  it('a sync that cannot take its listeners passes the waiting URL on (#286 review)', async () => {
    window.history.replaceState(null, '', '/?f_age_eq=30')
    const api = inferredGrid({ rowData: null })
    const first = createSync({ api })
    const firstHandover = handOver(first)
    first.destroy()

    const add = vi.spyOn(api, 'addEventListener').mockImplementation(() => {
      throw new Error('Initialization failed')
    })

    const failed = createSync(
      { api, applyUrlOnCreate: false, onIssue: () => {} },
      { handover: firstHandover }
    )

    const handover = handOver(failed)
    failed.destroy()
    add.mockRestore()
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

/** A custom filter component: the sync does not know its model type */
class AnyFilter {
  model: TextFilterModel | null = null
  readonly gui = document.createElement('div')

  init(): void {}

  getGui(): HTMLElement {
    return this.gui
  }

  isFilterActive(): boolean {
    return this.model !== null
  }

  doesFilterPass(): boolean {
    return true
  }

  getModel(): TextFilterModel | null {
    return this.model
  }

  setModel(model: TextFilterModel | null): void {
    this.model = model
  }
}

/** The grid of #307: a number column and a date column, with three rows */
function typedGrid() {
  return createRealGrid({
    columnDefs: [
      { field: 'age', filter: 'agNumberColumnFilter' },
      {
        field: 'created',
        filter: 'agDateColumnFilter',
        cellDataType: 'dateString'
      }
    ],
    rowData: [
      { age: 23, created: '2024-01-05' },
      { age: 31, created: '2024-03-10' },
      { age: 43, created: '2023-11-20' }
    ]
  })
}

describe('createGridUrlSync: a text filter on a number or date column (#307)', () => {
  it('reports TYPE_MISMATCH for a built-in number or date filter', async () => {
    window.history.replaceState(
      null,
      '',
      '/?f_age_contains=3&f_created_startsWith=2024'
    )
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = typedGrid()
    const sync = createGridUrlSync({ api, onIssue })
    await settle()

    expect(api.getFilterModel()).toEqual({})
    expect(api.getDisplayedRowCount()).toBe(3)
    expect(onIssue.mock.calls.map(([event]) => event)).toMatchObject([
      { issue: { code: 'TYPE_MISMATCH', column: 'age' }, source: 'url' },
      { issue: { code: 'TYPE_MISMATCH', column: 'created' }, source: 'url' }
    ])
    expect(sync.getSnapshot().issues).toHaveLength(2)
  })

  it('reports TYPE_MISMATCH for the default filter on an inferred type', async () => {
    window.history.replaceState(
      null,
      '',
      '/?f_age_contains=3&f_dob_startsWith=2020&f_zip_contains=1'
    )
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = inferredGrid()
    createGridUrlSync({ api, onIssue })
    await settle()

    expect(api.getFilterModel()).toEqual({
      zip: { filterType: 'text', type: 'contains', filter: '1' }
    })
    expect(onIssue.mock.calls.map(([event]) => event.issue)).toMatchObject([
      { code: 'TYPE_MISMATCH', column: 'age' },
      { code: 'TYPE_MISMATCH', column: 'dob' }
    ])
  })

  it('checks a text filter when the row data arrives', async () => {
    window.history.replaceState(null, '', '/?f_age_contains=3')
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = inferredGrid({ rowData: null })
    createGridUrlSync({ api, onIssue })
    await settle()

    expect(onIssue).not.toHaveBeenCalled()

    api.setGridOption('rowData', ROWS)
    await settle()

    expect(api.getFilterModel()).toEqual({})
    expect(api.getDisplayedRowCount()).toBe(2)
    expect(onIssue).toHaveBeenCalledTimes(1)
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      issue: { code: 'TYPE_MISMATCH', column: 'age' },
      source: 'url'
    })
  })

  it('reports TYPE_MISMATCH for applyFilters too', () => {
    const api = typedGrid()
    const sync = createGridUrlSync({ api, applyUrlOnCreate: false })

    const { issues } = sync.applyFilters({
      age: { filterType: 'text', type: 'contains', filter: '3' }
    })

    expect(issues).toMatchObject([{ code: 'TYPE_MISMATCH', column: 'age' }])
    expect(api.getFilterModel()).toEqual({})
  })

  it('does not check a text filter on a custom filter component', async () => {
    window.history.replaceState(null, '', '/?f_age_contains=3')
    const onIssue = vi.fn<(event: IssueEvent) => void>()

    const api = createRealGrid({
      columnDefs: [{ field: 'age', cellDataType: 'number', filter: AnyFilter }],
      rowData: ROWS
    })

    const setFilterModel = vi.spyOn(api, 'setFilterModel')
    createGridUrlSync({ api, onIssue })
    await settle()

    expect(setFilterModel).toHaveBeenCalledWith({
      age: { filterType: 'text', type: 'contains', filter: '3' }
    })
    expect(onIssue).not.toHaveBeenCalled()
  })

  it('does not check a text filter on a text filter of a number column', async () => {
    window.history.replaceState(null, '', '/?f_age_contains=3')
    const onIssue = vi.fn<(event: IssueEvent) => void>()

    const api = createRealGrid({
      columnDefs: [
        { field: 'age', cellDataType: 'number', filter: 'agTextColumnFilter' }
      ],
      rowData: ROWS
    })

    createGridUrlSync({ api, onIssue })
    await settle()

    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'text', type: 'contains', filter: '3' }
    })
    expect(onIssue).not.toHaveBeenCalled()
  })

  it('reports a text equals: AG Grid compares the number with a string', () => {
    // parseUrlFilters with no columnTypes gives a text filter for `eq`
    const api = typedGrid()
    const sync = createGridUrlSync({ api, applyUrlOnCreate: false })

    const { issues } = sync.applyFilters({
      age: { filterType: 'text', type: 'equals', filter: '31' }
    })

    expect(issues).toMatchObject([{ code: 'TYPE_MISMATCH', column: 'age' }])
    expect(api.getDisplayedRowCount()).toBe(3)
  })

  it('does not check a text blank or notBlank, which AG Grid reads (#260)', () => {
    const api = typedGrid()
    const sync = createGridUrlSync({ api, applyUrlOnCreate: false })

    const { issues } = sync.applyFilters({
      age: { filterType: 'text', type: 'notBlank' },
      created: { filterType: 'text', type: 'blank' }
    })

    expect(issues).toEqual([])
    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'notBlank' },
      created: { filterType: 'date', type: 'blank' }
    })
  })
})

describe('createGridUrlSync: a filter on a column that the grid does not have (#312)', () => {
  it('leaves the column out and reports UNKNOWN_COLUMN', async () => {
    window.history.replaceState(null, '', '/?f_gone_eq=1&f_name_contains=a')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = createRealGrid()
    const setFilterModel = vi.spyOn(api, 'setFilterModel')
    const sync = createGridUrlSync({ api, onIssue })
    await settle()

    expect(setFilterModel).toHaveBeenCalledWith({
      name: { filterType: 'text', type: 'contains', filter: 'a' }
    })
    expect(api.getFilterModel()).toEqual({
      name: { filterType: 'text', type: 'contains', filter: 'a' }
    })
    expect(onIssue).toHaveBeenCalledTimes(1)
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      issue: { code: 'UNKNOWN_COLUMN', column: 'gone' },
      source: 'url'
    })
    expect(onIssue.mock.calls[0]?.[0].issue.severity).toBe('warning')
    expect(sync.getSnapshot().issues).toMatchObject([
      { code: 'UNKNOWN_COLUMN', column: 'gone' }
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it('reports UNKNOWN_COLUMN, not TYPE_MISMATCH, for a number or date filter', async () => {
    window.history.replaceState(
      null,
      '',
      '/?f_gone_gt=1&f_when_before=2024-01-01'
    )
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = createRealGrid()
    createGridUrlSync({ api, onIssue })
    await settle()

    expect(onIssue.mock.calls.map(([event]) => event.issue)).toMatchObject([
      { code: 'UNKNOWN_COLUMN', column: 'gone' },
      { code: 'UNKNOWN_COLUMN', column: 'when' }
    ])
  })

  it('reports UNKNOWN_COLUMN when a waiting URL applies', async () => {
    window.history.replaceState(null, '', '/?f_age_eq=30&f_gone_eq=1')
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = inferredGrid({ rowData: null })
    createGridUrlSync({ api, onIssue })
    await settle()

    expect(onIssue).not.toHaveBeenCalled()

    api.setGridOption('rowData', ROWS)
    await settle()

    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'equals', filter: 30 }
    })
    expect(onIssue).toHaveBeenCalledTimes(1)
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      issue: { code: 'UNKNOWN_COLUMN', column: 'gone' },
      source: 'url'
    })
  })

  it('reports UNKNOWN_COLUMN for applyFilters too', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = createRealGrid()
    const sync = createGridUrlSync({ api, applyUrlOnCreate: false })

    const { issues } = sync.applyFilters({
      gone: { filterType: 'text', type: 'contains', filter: 'x' },
      name: { filterType: 'text', type: 'contains', filter: 'a' }
    })

    expect(issues).toMatchObject([{ code: 'UNKNOWN_COLUMN', column: 'gone' }])
    expect(api.getFilterModel()).toEqual({
      name: { filterType: 'text', type: 'contains', filter: 'a' }
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps a column that the grid makes, which getColumn does not give', () => {
    // AG Grid 31 to 33: getColumn gives only the columns of the column
    // definitions, and setFilterModel also takes the auto group column
    const setFilterModel = vi.fn<(model: FilterModel | null) => void>()
    const listeners = createGridListeners()

    const sync = createGridUrlSync({
      api: asGridApi({
        getFilterModel: () => ({}),
        setFilterModel,
        getColumn: () => null,
        getAllGridColumns: () => [{ getColId: () => 'ag-Grid-AutoColumn' }],
        addEventListener: listeners.addEventListener,
        removeEventListener: listeners.removeEventListener
      }),
      applyUrlOnCreate: false
    })

    const model = {
      'ag-Grid-AutoColumn': { filterType: 'text', type: 'equals', filter: 'x' }
    }

    const { issues } = sync.applyFilters(model)

    expect(issues).toEqual([])
    expect(setFilterModel).toHaveBeenCalledWith(model)
  })
})

/** AG Grid's date filter options and the two `OrEqual` options */
const ALL_DATE_OPTIONS = [
  'equals',
  'notEqual',
  'lessThan',
  'lessThanOrEqual',
  'greaterThan',
  'greaterThanOrEqual',
  'inRange',
  'blank',
  'notBlank'
]

const DATED_ROWS = [
  { created: '2024-01-10', age: 1 },
  { created: '2024-02-10', age: 5 },
  { created: '2024-03-15', age: 9 }
]

/** A date column and a number column, with the column options given */
function optionsGrid(
  created: Partial<ColDef> = {},
  age: Partial<ColDef> = {},
  gridOptions: Partial<GridOptions> = {}
) {
  return createRealGrid({
    columnDefs: [
      {
        field: 'created',
        filter: 'agDateColumnFilter',
        cellDataType: 'dateString',
        ...created
      },
      { field: 'age', filter: 'agNumberColumnFilter', ...age }
    ],
    rowData: DATED_ROWS,
    ...gridOptions
  })
}

describe('createGridUrlSync: an operation that the column does not have (#325)', () => {
  it('leaves out beforeEq on a default date filter and reports UNSUPPORTED_OPERATION', async () => {
    window.history.replaceState(
      null,
      '',
      '/?f_created_beforeEq=2024-03-15&f_age_gt=2'
    )
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = optionsGrid()
    const setFilterModel = vi.spyOn(api, 'setFilterModel')
    const sync = createGridUrlSync({ api, onIssue })
    await settle()

    expect(setFilterModel).toHaveBeenCalledWith({
      age: { filterType: 'number', type: 'greaterThan', filter: 2 }
    })
    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'greaterThan', filter: 2 }
    })
    expect(onIssue).toHaveBeenCalledTimes(1)
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      issue: { code: 'UNSUPPORTED_OPERATION', column: 'created' },
      source: 'url'
    })
    expect(onIssue.mock.calls[0]?.[0].issue.severity).toBe('warning')
    expect(sync.getSnapshot().issues).toMatchObject([
      { code: 'UNSUPPORTED_OPERATION', column: 'created' }
    ])
  })

  it('applies beforeEq when the column lists lessThanOrEqual', async () => {
    window.history.replaceState(null, '', '/?f_created_beforeEq=2024-03-15')
    const onIssue = vi.fn<(event: IssueEvent) => void>()

    const api = optionsGrid({
      filterParams: { filterOptions: ALL_DATE_OPTIONS }
    })

    createGridUrlSync({ api, onIssue })
    await settle()

    expect(api.getFilterModel()).toMatchObject({
      created: { filterType: 'date', type: 'lessThanOrEqual' }
    })
    expect(api.getDisplayedRowCount()).toBe(3)
    expect(onIssue).not.toHaveBeenCalled()
  })

  it('reads the filter options of the default column definition', async () => {
    window.history.replaceState(null, '', '/?f_created_afterEq=2024-02-10')
    const onIssue = vi.fn<(event: IssueEvent) => void>()

    const api = optionsGrid(
      {},
      {},
      { defaultColDef: { filterParams: { filterOptions: ALL_DATE_OPTIONS } } }
    )

    createGridUrlSync({ api, onIssue })
    await settle()

    expect(api.getFilterModel()).toMatchObject({
      created: { filterType: 'date', type: 'greaterThanOrEqual' }
    })
    expect(api.getDisplayedRowCount()).toBe(2)
    expect(onIssue).not.toHaveBeenCalled()
  })

  it("checks AG Grid's default filter on a date data type", async () => {
    window.history.replaceState(null, '', '/?f_created_beforeEq=2024-03-15')
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = optionsGrid({ filter: true })
    createGridUrlSync({ api, onIssue })
    await settle()

    expect(api.getFilterModel()).toEqual({})
    expect(onIssue.mock.calls.map(([event]) => event.issue)).toMatchObject([
      { code: 'UNSUPPORTED_OPERATION', column: 'created' }
    ])
  })

  it('checks a number or text filter against its own filter options', async () => {
    window.history.replaceState(null, '', '/?f_age_lt=6&f_name_startsWith=j')
    const onIssue = vi.fn<(event: IssueEvent) => void>()

    const api = createRealGrid({
      columnDefs: [
        {
          field: 'name',
          filter: 'agTextColumnFilter',
          filterParams: { filterOptions: ['contains', 'equals'] }
        },
        {
          field: 'age',
          filter: 'agNumberColumnFilter',
          filterParams: { filterOptions: ['equals'] }
        }
      ]
    })

    createGridUrlSync({ api, onIssue })
    await settle()

    expect(api.getFilterModel()).toEqual({})
    expect(onIssue.mock.calls.map(([event]) => event.issue)).toMatchObject([
      { code: 'UNSUPPORTED_OPERATION', column: 'age' },
      { code: 'UNSUPPORTED_OPERATION', column: 'name' }
    ])
  })

  it('keeps each operation of the default number and text options', async () => {
    window.history.replaceState(null, '', '/?f_age_lte=40&f_name_startsWith=j')
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = createRealGrid()
    createGridUrlSync({ api, onIssue })
    await settle()

    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'lessThanOrEqual', filter: 40 },
      name: { filterType: 'text', type: 'startsWith', filter: 'j' }
    })
    expect(onIssue).not.toHaveBeenCalled()
  })

  it('keeps a custom filter option that the column lists', () => {
    const odd = {
      displayKey: 'odd',
      displayName: 'Odd',
      predicate: (_: number[], value: number | null) => (value ?? 0) % 2 === 1,
      numberOfInputs: 0
    } as const

    const api = optionsGrid({}, { filterParams: { filterOptions: [odd] } })
    const sync = createGridUrlSync({ api, applyUrlOnCreate: false })

    const { issues } = sync.applyFilters({
      age: { filterType: 'number', type: 'odd' }
    })

    expect(issues).toEqual([])
    expect(api.getFilterModel()).toEqual({
      age: { filterType: 'number', type: 'odd' }
    })
  })

  it('checks each condition of combined conditions', () => {
    const api = optionsGrid()
    const sync = createGridUrlSync({ api, applyUrlOnCreate: false })

    const { issues } = sync.applyFilters({
      created: {
        filterType: 'date',
        operator: 'OR',
        conditions: [
          { filterType: 'date', type: 'equals', dateFrom: '2024-01-10' },
          {
            filterType: 'date',
            type: 'lessThanOrEqual',
            dateFrom: '2024-02-10'
          }
        ]
      }
    })

    expect(issues).toMatchObject([
      { code: 'UNSUPPORTED_OPERATION', column: 'created' }
    ])
    expect(api.getFilterModel()).toEqual({})
  })

  it('checks a 0.5-form operation of a json URL', async () => {
    const json = JSON.stringify({
      created: {
        filterType: 'date',
        type: 'dateBeforeOrEqual',
        filter: '2024-03-15'
      }
    })

    window.history.replaceState(null, '', `/?gf=${encodeURIComponent(json)}`)
    const onIssue = vi.fn<(event: IssueEvent) => void>()
    const api = optionsGrid()
    createGridUrlSync({
      api,
      onIssue,
      codec: grouped({ param: 'gf', format: 'json' })
    })
    await settle()

    expect(api.getFilterModel()).toEqual({})
    expect(onIssue.mock.calls.map(([event]) => event.issue)).toMatchObject([
      { code: 'UNSUPPORTED_OPERATION', column: 'created' }
    ])
  })

  it('checks the operation when a waiting URL applies', async () => {
    window.history.replaceState(null, '', '/?f_created_beforeEq=2024-03-15')
    const onIssue = vi.fn<(event: IssueEvent) => void>()

    const api = createRealGrid({
      columnDefs: [{ field: 'created' }],
      defaultColDef: { filter: true },
      rowData: null
    })

    createGridUrlSync({ api, onIssue })
    await settle()

    expect(onIssue).not.toHaveBeenCalled()

    api.setGridOption('rowData', DATED_ROWS)
    await settle()

    expect(api.getFilterModel()).toEqual({})
    expect(api.getDisplayedRowCount()).toBe(3)
    expect(onIssue.mock.calls.map(([event]) => event.issue)).toMatchObject([
      { code: 'UNSUPPORTED_OPERATION', column: 'created' }
    ])
  })

  it('does not check a custom filter component', () => {
    const api = createRealGrid({
      columnDefs: [{ field: 'age', cellDataType: 'number', filter: AnyFilter }],
      rowData: DATED_ROWS
    })

    const setFilterModel = vi.spyOn(api, 'setFilterModel')
    const sync = createGridUrlSync({ api, applyUrlOnCreate: false })

    const model = {
      age: { filterType: 'number', type: 'someOperation', filter: 1 }
    }

    const { issues } = sync.applyFilters(model)

    expect(issues).toEqual([])
    expect(setFilterModel).toHaveBeenCalledWith(model)
  })

  it('does not check a filter with no operation yet (#260)', () => {
    const api = optionsGrid()
    const sync = createGridUrlSync({ api, applyUrlOnCreate: false })

    const { issues } = sync.applyFilters({
      age: { filterType: 'number', filter: 3 }
    })

    expect(issues).toEqual([])
  })
})
