import { renderHook } from '@testing-library/react'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import type { FilterModel } from 'ag-grid-community'
import { useAGGridUrlSync } from './use-ag-grid-url-sync.js'
import { useGridUrlSync } from './use-grid-url-sync.js'
import { createTimedGrid, useRealLocation } from '../test-helpers.js'

// A filter that the URL format cannot hold (#225). The 0.6.0 hook reports
// UNSUPPORTED_FILTER. The deprecated hook keeps its 0.5 behaviour: it drops
// the filter from the URL with no issue.

const STATUS_SET: FilterModel = {
  status: { filterType: 'set', values: ['open'] }
}

beforeEach(() => {
  useRealLocation('/')
})

describe('a set filter with the individual codec', () => {
  test('useAGGridUrlSync (deprecated) reports nothing and does not throw', () => {
    const grid = createTimedGrid('in-call', STATUS_SET)
    const onParseError = vi.fn<(error: Error) => void>()

    const { result } = renderHook(() =>
      useAGGridUrlSync(grid.api, { throwOnError: true, onParseError })
    )

    expect(result.current.issues).toEqual([])
    expect(onParseError).not.toHaveBeenCalled()
  })

  test('useGridUrlSync reports UNSUPPORTED_FILTER', () => {
    const grid = createTimedGrid('in-call', STATUS_SET)

    const { result } = renderHook(() => useGridUrlSync({ api: grid.api }))

    expect(result.current.issues).toMatchObject([
      { code: 'UNSUPPORTED_FILTER', column: 'status' }
    ])
  })
})
