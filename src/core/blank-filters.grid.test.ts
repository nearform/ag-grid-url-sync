import { describe, it, expect } from 'vitest'
import {
  createGrid,
  ModuleRegistry,
  AllCommunityModule,
  type GridApi
} from 'ag-grid-community'
import { checkColumnTypes } from './grid-integration.js'
import { writeUrlFilters } from './url-generator.js'
import { readUrlFilters } from './url-parser.js'

// A blank filter round-trips through the URL on a real AG Grid, not a fake
// (#260). The URL has no filter type, so `?f_n_blank=true` parses as a text
// filter (the type guess, #224). AG Grid's number and date filters read only
// the operation, so they apply it.

ModuleRegistry.registerModules([AllCommunityModule])

const ROWS = [
  { n: 1, d: new Date(2024, 0, 1) },
  { n: null, d: null },
  { n: 3, d: new Date(2024, 0, 3) }
]

function createTestGrid(): GridApi {
  const div = document.createElement('div')
  document.body.append(div)

  return createGrid(div, {
    columnDefs: [
      { field: 'n', filter: 'agNumberColumnFilter' },
      { field: 'd', filter: 'agDateColumnFilter' }
    ],
    rowData: ROWS
  })
}

function shownRows(gridApi: GridApi): unknown[] {
  const rows: unknown[] = []
  gridApi.forEachNodeAfterFilter(node => rows.push(node.data))

  return rows
}

describe.each([
  ['number', 'n'],
  ['date', 'd']
] as const)('a %s blank filter on a real grid (#260)', (filterType, column) => {
  it.each([
    ['blank', [ROWS[1]]],
    ['notBlank', [ROWS[0], ROWS[2]]]
  ] as const)('%s round-trips through the URL', async (type, expectedRows) => {
    const source = createTestGrid()
    await source.setColumnFilterModel(column, { filterType, type })
    source.onFilterChanged()

    const url = writeUrlFilters('https://example.com/', source.getFilterModel())

    expect(new URL(url).searchParams.get(`f_${column}_${type}`)).toBe('true')

    const target = createTestGrid()
    target.setFilterModel(checkColumnTypes(readUrlFilters(url), target))

    expect(target.getFilterModel()[column]).toMatchObject({ filterType, type })
    expect(shownRows(target)).toEqual(expectedRows)
  })
})
