import { describe, it, expect } from 'vitest'
import type { ColDef, GridOptions } from 'ag-grid-community'
import { gridColumnType } from './column-types.js'
import { createRealGrid } from '../test-helpers.js'

// The type of a column, from the column definition that AG Grid resolved
// (#224). AG Grid 31+ infers `cellDataType` from the first row.

const ROW = {
  zip: '01234',
  age: 30,
  born: new Date(2020, 0, 1),
  dob: '2020-01-01',
  price: 5
}

function gridWith(
  columnDefs: ColDef[],
  gridOptions: Partial<GridOptions> = {}
) {
  return createRealGrid({
    columnDefs,
    defaultColDef: { filter: true },
    rowData: [ROW],
    ...gridOptions
  })
}

describe('gridColumnType', () => {
  it('reads a built-in filter name first', () => {
    const api = gridWith([
      { field: 'zip', filter: 'agNumberColumnFilter' },
      { field: 'age', filter: 'agTextColumnFilter' },
      { field: 'dob', filter: 'agDateColumnFilter' }
    ])

    expect(gridColumnType(api, 'zip')).toBe('number')
    expect(gridColumnType(api, 'age')).toBe('text')
    expect(gridColumnType(api, 'dob')).toBe('date')
  })

  it('reads the inferred data type', () => {
    const api = gridWith([
      { field: 'zip' },
      { field: 'age' },
      { field: 'born' },
      { field: 'dob' }
    ])

    expect(gridColumnType(api, 'zip')).toBe('text')
    expect(gridColumnType(api, 'age')).toBe('number')
    expect(gridColumnType(api, 'born')).toBe('date')
    expect(gridColumnType(api, 'dob')).toBe('date')
  })

  it('reads the date-time data types as dates', () => {
    const api = gridWith([
      { field: 'born', cellDataType: 'dateTime' },
      { field: 'dob', cellDataType: 'dateTimeString' }
    ])

    expect(gridColumnType(api, 'born')).toBe('date')
    expect(gridColumnType(api, 'dob')).toBe('date')
  })

  it('reads the base type of a custom data type', () => {
    const api = gridWith([{ field: 'price', cellDataType: 'money' }], {
      dataTypeDefinitions: {
        money: {
          baseDataType: 'number',
          extendsDataType: 'number',
          valueFormatter: params => `${params.value}`
        }
      }
    })

    expect(gridColumnType(api, 'price')).toBe('number')
  })

  it('gives text when inference is off', () => {
    const api = gridWith([{ field: 'age', cellDataType: false }])

    expect(gridColumnType(api, 'age')).toBe('text')
  })

  it('gives undefined for a column that the grid does not have', () => {
    const api = gridWith([{ field: 'age' }])

    expect(gridColumnType(api, 'missing')).toBeUndefined()
  })

  describe('before the first row data', () => {
    it('is pending for a column that AG Grid infers', () => {
      const api = gridWith([{ field: 'age' }], { rowData: null })

      expect(gridColumnType(api, 'age')).toBe('pending')
    })

    it('is known once the row data arrives', () => {
      const api = gridWith([{ field: 'age' }, { field: 'zip' }], {
        rowData: null
      })

      api.setGridOption('rowData', [ROW])

      expect(gridColumnType(api, 'age')).toBe('number')
      expect(gridColumnType(api, 'zip')).toBe('text')
    })

    it('is pending with an empty row data array', () => {
      const api = gridWith([{ field: 'age' }], { rowData: [] })

      expect(gridColumnType(api, 'age')).toBe('pending')
    })

    it('is not pending for a built-in filter name or a set data type', () => {
      const api = gridWith(
        [
          { field: 'zip', filter: 'agNumberColumnFilter' },
          { field: 'age', cellDataType: 'number' }
        ],
        { rowData: null }
      )

      expect(gridColumnType(api, 'zip')).toBe('number')
      expect(gridColumnType(api, 'age')).toBe('number')
    })

    it('is not pending when the column turns inference off', () => {
      const api = gridWith([{ field: 'age', cellDataType: false }], {
        rowData: null
      })

      expect(gridColumnType(api, 'age')).toBe('text')
    })

    it('is not pending when the default column turns inference off', () => {
      const api = gridWith([{ field: 'age' }], {
        rowData: null,
        defaultColDef: { filter: true, cellDataType: false }
      })

      expect(gridColumnType(api, 'age')).toBe('text')
    })

    it('is not pending once AG Grid inferred the types, with no rows now', () => {
      // The first zip value is null, so AG Grid infers no type for zip
      const api = gridWith([{ field: 'zip' }, { field: 'age' }], {
        rowData: [
          { zip: null, age: 1 },
          { zip: '5', age: 2 }
        ]
      })

      api.setGridOption('rowData', [])

      expect(gridColumnType(api, 'zip')).toBe('text')
    })

    it('is pending while a column type sets the type of another column', () => {
      const api = gridWith(
        [{ field: 'zip', type: 'money' }, { field: 'age' }],
        {
          rowData: null,
          // SAFETY: AG Grid applies a column type's cellDataType at run time,
          // but its ColTypeDef type leaves the key out
          columnTypes: { money: { cellDataType: 'number' } as ColDef }
        }
      )

      expect(gridColumnType(api, 'zip')).toBe('number')
      expect(gridColumnType(api, 'age')).toBe('pending')
    })

    it.each([
      ['valueGetter', { colId: 'full', valueGetter: () => 'x' }],
      ['cellRenderer', { field: 'full', cellRenderer: () => 'x' }],
      ['valueParser', { field: 'full', valueParser: () => 'x' }],
      ['refData', { field: 'full', refData: { a: 'A' } }]
    ])('is not pending for a column with a %s', (_name, colDef: ColDef) => {
      const api = gridWith([colDef], { rowData: null })

      expect(gridColumnType(api, 'full')).toBe('text')
    })

    it('is not pending for a column with no field', () => {
      const api = gridWith([{ colId: 'full' }], { rowData: null })

      expect(gridColumnType(api, 'full')).toBe('text')
    })

    it('is not pending for a row model with no inference', () => {
      const api = gridWith([{ field: 'age' }], {
        rowData: null,
        rowModelType: 'infinite'
      })

      expect(gridColumnType(api, 'age')).toBe('text')
    })
  })
})
