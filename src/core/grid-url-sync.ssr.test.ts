// @vitest-environment node
import { describe, it, expect } from 'vitest'
import type { GridApi } from 'ag-grid-community'

// With no window (a server render), the module loads and a sync can be made
// (#221). No setup file runs window code here: test-setup.ts reads window, so
// this file checks that it is absent first.

describe('createGridUrlSync with no window', () => {
  it('loads the package entry with no window', async () => {
    expect('window' in globalThis).toBe(false)

    const lib = await import('../index.js')

    expect(lib.createGridUrlSync).toBeInstanceOf(Function)
  })

  it('makes a sync with no window, and its url is empty', async () => {
    const { createGridUrlSync } = await import('./grid-url-sync.js')

    const fake: Partial<GridApi> = {
      addEventListener: () => {},
      removeEventListener: () => {},
      getFilterModel: () => ({}),
      setFilterModel: () => {},
      isDestroyed: () => false
    }

    // SAFETY: with no window and an empty filter model, the sync calls only
    // these GridApi methods
    const api = fake as GridApi
    const sync = createGridUrlSync({ api })

    expect(sync.getSnapshot()).toMatchObject({ status: 'active', url: '' })
  })
})
