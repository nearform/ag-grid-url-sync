import { describe, it, expect } from 'vitest'
import type { GridApi } from 'ag-grid-community'
import { createRealGrid } from './test-helpers.js'

// A real grid that stays alive after its test can run an AG Grid timer
// after jsdom is gone, which Vitest reports as an unhandled error. So
// createRealGrid destroys each grid when its test ends.

describe('createRealGrid', () => {
  let kept: GridApi | undefined

  it('gives a live grid in the test', () => {
    kept = createRealGrid()

    expect(kept.isDestroyed()).toBe(false)
    expect(document.body.querySelectorAll('.ag-root-wrapper')).toHaveLength(1)
  })

  it('destroys the grid of the earlier test when that test ends', () => {
    expect(kept?.isDestroyed()).toBe(true)
    expect(document.body.querySelectorAll('.ag-root-wrapper')).toHaveLength(0)
  })
})
