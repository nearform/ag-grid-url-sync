import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createGridUrlSync } from './grid-url-sync.js'
import { createViewStore } from './view-storage.js'
import type { ViewStore } from './view-storage.js'
import { URLSyncError } from './types.js'
import { createTimedGrid, useRealLocation } from '../test-helpers.js'

// Saved views in the core sync (#223): the views option, the snapshot,
// saveView, deleteView and NOT_READY.

const NAME_JO = {
  name: { filterType: 'text', type: 'contains', filter: 'jo' }
} as const

const NAME_X = {
  name: { filterType: 'text', type: 'contains', filter: 'x' }
} as const

/** A store whose saveView throws the given code */
function failingStore(code: 'STORAGE_FULL'): ViewStore {
  return {
    listViews: () => [],
    getActiveViewId: () => null,
    persistActiveViewId: () => undefined,
    saveView() {
      throw new URLSyncError('full', undefined, { code })
    },
    deleteView: () => undefined
  }
}

beforeEach(() => {
  localStorage.clear()
  useRealLocation('/')
})

describe('createGridUrlSync: saved views', () => {
  it('no views option: views is [] and activeViewId is null, and saveView returns null with no onIssue call', () => {
    const onIssue = vi.fn()

    const sync = createGridUrlSync({
      api: createTimedGrid('in-call').api,
      onIssue
    })

    expect(sync.getSnapshot().views).toEqual([])
    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(sync.saveView('A')).toBeNull()
    expect(onIssue).not.toHaveBeenCalled()

    sync.destroy()
  })

  it('the snapshot lists the stored views', () => {
    const store = createViewStore('t')
    store.saveView('A', NAME_JO)
    store.saveView('B', NAME_X)

    const sync = createGridUrlSync({
      api: createTimedGrid('in-call').api,
      views: store
    })

    expect(sync.getSnapshot().views.map(v => v.name)).toEqual(['A', 'B'])

    sync.destroy()
  })

  it('saveView stores the grid model and makes the view active', () => {
    const store = createViewStore('t')
    const grid = createTimedGrid('in-call', NAME_JO)
    const sync = createGridUrlSync({ api: grid.api, views: store })

    const view = sync.saveView('Mine')

    expect(view?.filterModel).toEqual(NAME_JO)
    expect(sync.getSnapshot().activeViewId).toBe(view?.id)
    expect(store.getActiveViewId()).toBe(view?.id)
    expect(sync.getSnapshot().views.map(v => v.id)).toEqual([view?.id])

    sync.destroy()
  })

  it('saveView with an existing name updates the view in place', () => {
    const grid = createTimedGrid('in-call', NAME_JO)

    const sync = createGridUrlSync({
      api: grid.api,
      views: createViewStore('t')
    })

    const first = sync.saveView('Mine')
    grid.api.setFilterModel(NAME_X)
    const second = sync.saveView('Mine')

    expect(second?.id).toBe(first?.id)
    expect(sync.getSnapshot().views).toHaveLength(1)
    expect(sync.getSnapshot().views[0]?.filterModel).toEqual(NAME_X)

    sync.destroy()
  })

  it('saveView reports VIEW_NAME_REQUIRED for a blank name and returns null', () => {
    const onIssue = vi.fn()

    const sync = createGridUrlSync({
      api: createTimedGrid('in-call').api,
      views: createViewStore('t'),
      onIssue
    })

    expect(sync.saveView('  ')).toBeNull()
    expect(onIssue).toHaveBeenCalledOnce()
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      source: 'api',
      issue: { code: 'VIEW_NAME_REQUIRED' }
    })
    expect(sync.getSnapshot().issues).toEqual([])

    sync.destroy()
  })

  it('saveView reports STORAGE_FULL when the store throws it, and returns null', () => {
    const onIssue = vi.fn()

    const sync = createGridUrlSync({
      api: createTimedGrid('in-call').api,
      views: failingStore('STORAGE_FULL'),
      onIssue
    })

    expect(sync.saveView('A')).toBeNull()
    expect(onIssue.mock.calls[0]?.[0]).toMatchObject({
      issue: { code: 'STORAGE_FULL' }
    })

    sync.destroy()
  })

  it('saveView throws with throwOnError: true', () => {
    const sync = createGridUrlSync({
      api: createTimedGrid('in-call').api,
      views: failingStore('STORAGE_FULL'),
      throwOnError: true
    })

    expect(() => sync.saveView('A')).toThrow('full')

    sync.destroy()
  })

  it('deleteView removes the view and the snapshot follows', () => {
    const store = createViewStore('t')
    const a = store.saveView('A', NAME_JO)
    store.saveView('B', NAME_X)

    const sync = createGridUrlSync({
      api: createTimedGrid('in-call').api,
      views: store
    })

    sync.deleteView(a.id)

    expect(sync.getSnapshot().views.map(v => v.name)).toEqual(['B'])

    sync.destroy()
  })

  it('deleteView of the active view sets activeViewId to null', () => {
    const grid = createTimedGrid('in-call', NAME_JO)

    const sync = createGridUrlSync({
      api: grid.api,
      views: createViewStore('t')
    })

    const view = sync.saveView('Mine')

    sync.deleteView(view?.id ?? '')

    expect(sync.getSnapshot().activeViewId).toBeNull()
    expect(sync.getSnapshot().views).toEqual([])

    sync.destroy()
  })

  it('the snapshot keeps its object when nothing changed', () => {
    const sync = createGridUrlSync({
      api: createTimedGrid('in-call').api,
      views: createViewStore('t')
    })

    expect(sync.getSnapshot()).toBe(sync.getSnapshot())

    sync.destroy()
  })

  it('after destroy: saveView and applyUrl report NOT_READY', () => {
    const onIssue = vi.fn()

    const sync = createGridUrlSync({
      api: createTimedGrid('in-call').api,
      views: createViewStore('t'),
      onIssue
    })

    sync.destroy()

    expect(sync.saveView('A')).toBeNull()
    expect(sync.applyUrl('http://localhost/?f_name_contains=jo')).toEqual({
      issues: []
    })

    const codes = onIssue.mock.calls.map(([event]) => [
      event.issue.code,
      event.source
    ])

    expect(codes).toEqual([
      ['NOT_READY', 'api'],
      ['NOT_READY', 'api']
    ])
  })
})
