import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createGridUrlSync } from './grid-url-sync.js'
import { createRealGrid, useRealLocation } from '../test-helpers.js'

// The back and forward buttons with the popstate option (#221)

const NAME_JO = {
  name: { filterType: 'text', type: 'contains', filter: 'jo' }
} as const

const NAME_X = {
  name: { filterType: 'text', type: 'contains', filter: 'x' }
} as const

/** AG Grid sends filterChanged one tick after setFilterModel */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve))

/** Goes back one entry and waits for jsdom's popstate */
async function back(): Promise<void> {
  const popped = new Promise(resolve => {
    window.addEventListener('popstate', resolve, { once: true })
  })

  window.history.back()
  await popped
  await settle()
}

/** A new history entry with filters, as another part of the app makes it */
function pushPage(path: string): void {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

beforeEach(() => {
  useRealLocation('/')
})

describe('createGridUrlSync: popstate', () => {
  it('restores the previous filters on back with push', async () => {
    const api = createRealGrid()
    createGridUrlSync({ api, history: 'push' })
    api.setFilterModel(NAME_JO)
    await settle()
    api.setFilterModel(NAME_X)
    await settle()
    const length = window.history.length

    await back()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(window.history.length).toBe(length)
    expect(
      new URLSearchParams(window.location.search).get('f_name_contains')
    ).toBe('jo')
  })

  it('does not push on back to an entry that the grid takes only in part', async () => {
    const api = createRealGrid()
    createGridUrlSync({ api, history: 'push' })
    window.history.pushState(null, '', '/?f_name_contains=jo&f_gone_contains=q')
    window.history.pushState(null, '', '/?f_name_contains=x')
    const push = vi.spyOn(window.history, 'pushState')

    await back()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
    expect(push).not.toHaveBeenCalled()
    push.mockRestore()
  })

  it('clears the grid on back to an entry with no filters', async () => {
    const api = createRealGrid()
    createGridUrlSync({ api, history: 'push' })
    api.setFilterModel(NAME_JO)
    await settle()

    await back()

    expect(api.getFilterModel()).toEqual({})
  })

  it('is off by default with replace', async () => {
    const api = createRealGrid()
    createGridUrlSync({ api, history: 'replace' })

    pushPage('/?f_name_contains=jo')
    await settle()

    expect(api.getFilterModel()).toEqual({})
  })

  it('listens with popstate true and replace', async () => {
    const api = createRealGrid()
    createGridUrlSync({ api, history: 'replace', popstate: true })

    pushPage('/?f_name_contains=jo')
    await settle()

    expect(api.getFilterModel()).toMatchObject(NAME_JO)
  })

  it('does not listen with popstate false and push', async () => {
    const api = createRealGrid()
    createGridUrlSync({ api, history: 'push', popstate: false })

    pushPage('/?f_name_contains=jo')
    await settle()

    expect(api.getFilterModel()).toEqual({})
  })

  it('removes the popstate listener on destroy', async () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const api = createRealGrid()
    const sync = createGridUrlSync({ api, history: 'push' })

    sync.destroy()
    pushPage('/?f_name_contains=jo')
    await settle()

    expect(api.getFilterModel()).toEqual({})
    expect(remove).toHaveBeenCalledWith('popstate', expect.any(Function))
    remove.mockRestore()
  })
})
