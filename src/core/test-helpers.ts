import { vi } from 'vitest'
import type { GridApi } from 'ag-grid-community'

/**
 * Creates a mock AG Grid API for testing
 * @param columnDefs - Column definitions to mock
 * @param rowData - Row data to mock
 * @returns Mock GridApi instance
 */
export const createMockGridApi = (
  columnDefs: any[] = [],
  rowData: any[] = []
): GridApi => {
  // Create a stateful mock that can store and return filter models
  let filterModel: any = {}

  return {
    getColumnDefs: () => columnDefs,
    setFilterModel: vi.fn((model: any) => {
      filterModel = { ...model }
    }),
    getFilterModel: vi.fn(() => filterModel),
    forEachNode: vi.fn(callback => {
      rowData.forEach((data, index) => {
        callback({ data }, index)
      })
    })
  } as any
}

/**
 * Common column definitions for testing
 */
export const testColumnDefs = {
  number: { field: 'testNumber', filter: 'agNumberColumnFilter' },
  date: { field: 'testDate', filter: 'agDateColumnFilter' },
  set: { field: 'testSet', filter: 'agSetColumnFilter' },
  text: { field: 'testText', filter: 'agTextColumnFilter' }
}

/**
 * Common row data for testing
 */
export const testRowData = [
  {
    testNumber: 42.5,
    testDate: '2024-01-15',
    testSet: 'Electronics',
    testText: 'Sample Text'
  },
  {
    testNumber: 100,
    testDate: '2024-02-20',
    testSet: 'Books',
    testText: 'Another Sample'
  },
  {
    testNumber: -15.3,
    testDate: '2024-03-10',
    testSet: 'Clothing',
    testText: 'Test Value'
  }
]
