import { describe, it, expect, vi } from 'vitest'
import type { GridApi } from 'ag-grid-community'
import { gridUrlSyncOptions } from './sync-options.js'
import { codecOptions } from '../core/codecs.js'
import { createViewStore } from '../core/view-storage.js'

// The options of the hook's sync (#222): the createGridUrlSync options made
// from the old config

const api: Partial<GridApi> = {}

// SAFETY: gridUrlSyncOptions only puts the api in the options object; these
// tests never make a sync from it
const gridApi = api as GridApi

describe('gridUrlSyncOptions', () => {
  const onIssue = vi.fn()

  it('uses individual() with the prefix', () => {
    const result = gridUrlSyncOptions(gridApi, { paramPrefix: 'g_' }, onIssue)

    expect(codecOptions(result.codec!)).toMatchObject({
      serialization: 'individual',
      paramPrefix: 'g_'
    })
  })

  it('uses grouped() with the param and format', () => {
    const result = gridUrlSyncOptions(
      gridApi,
      { serialization: 'grouped', groupedParam: 'state', format: 'base64' },
      onIssue
    )

    expect(codecOptions(result.codec!)).toMatchObject({
      serialization: 'grouped',
      groupedParam: 'state',
      format: 'base64'
    })
  })

  it('passes the api, maxValueLength and onIssue', () => {
    const result = gridUrlSyncOptions(gridApi, { maxValueLength: 50 }, onIssue)

    expect(result.api).toBe(gridApi)
    expect(result.maxValueLength).toBe(50)
    expect(result.onIssue).toBe(onIssue)
  })

  it('by default never writes history and never applies on create', () => {
    expect(gridUrlSyncOptions(gridApi, {}, onIssue)).toMatchObject({
      history: 'none',
      popstate: false,
      applyUrlOnCreate: false,
      throwOnError: false
    })
  })

  it('has no views by default', () => {
    expect(gridUrlSyncOptions(gridApi, {}, onIssue).views).toBeUndefined()
  })

  it('passes the view store and applyUrlOnCreate (#223)', () => {
    const views = createViewStore('sync-options-test')
    const result = gridUrlSyncOptions(gridApi, {}, onIssue, views, true)

    expect(result.views).toBe(views)
    expect(result.applyUrlOnCreate).toBe(true)
    expect(result.history).toBe('none')
  })

  it('passes the history and popstate options (#270)', () => {
    const history = (): void => {}

    const result = gridUrlSyncOptions(gridApi, {}, onIssue, undefined, false, {
      history,
      popstate: undefined
    })

    expect(result.history).toBe(history)
    expect(result.popstate).toBeUndefined()
    expect(result.throwOnError).toBe(false)
  })
})
