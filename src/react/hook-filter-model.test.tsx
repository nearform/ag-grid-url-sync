import { renderHook } from '@testing-library/react'
import { describe, test, expect, beforeEach } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { useGridUrlSync } from './use-grid-url-sync.js'
import { createTimedGrid, useRealLocation } from '../test-helpers.js'

// A filter that the URL format cannot hold (#225). The 0.6.0 hook reports
// UNSUPPORTED_FILTER.

const STATUS_SET: FilterModel = {
  status: { filterType: 'set', values: ['open'] }
}

beforeEach(() => {
  useRealLocation('/')
})

describe('a set filter with the individual codec', () => {
  test('useGridUrlSync reports UNSUPPORTED_FILTER', () => {
    const grid = createTimedGrid('in-call', STATUS_SET)

    const { result } = renderHook(() => useGridUrlSync({ api: grid.api }))

    expect(result.current.issues).toMatchObject([
      { code: 'UNSUPPORTED_FILTER', column: 'status' }
    ])
  })
})
