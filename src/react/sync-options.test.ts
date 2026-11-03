import { describe, it, expect, vi } from 'vitest'
import type { GridApi } from 'ag-grid-community'
import { gridUrlSyncOptions, syncOptionsKey } from './sync-options.js'
import { codecOptions } from '../core/codecs.js'
import type { AGGridUrlSyncConfig } from '../core/types.js'

// The options of the hook's sync (#222): one key for the five URL-format
// options, and the createGridUrlSync options made from the old config

const api: Partial<GridApi> = {}

// SAFETY: gridUrlSyncOptions only puts the api in the options object; these
// tests never make a sync from it
const gridApi = api as GridApi

describe('syncOptionsKey', () => {
  it('gives the same key for the same values in a new object', () => {
    expect(syncOptionsKey({ paramPrefix: 'g_', format: 'json' })).toBe(
      syncOptionsKey({ paramPrefix: 'g_', format: 'json' })
    )
  })

  it('gives the same key for {} and the defaults', () => {
    expect(syncOptionsKey({})).toBe(
      syncOptionsKey({
        paramPrefix: 'f_',
        maxValueLength: 200,
        serialization: 'individual',
        groupedParam: 'grid_filters',
        format: 'querystring'
      })
    )
  })

  it.each<[string, AGGridUrlSyncConfig]>([
    ['paramPrefix', { paramPrefix: 'g_' }],
    ['maxValueLength', { maxValueLength: 50 }],
    ['serialization', { serialization: 'grouped' }],
    ['groupedParam', { groupedParam: 'state' }],
    ['format', { format: 'base64' }]
  ])('gives another key for %s', (_, options) => {
    expect(syncOptionsKey(options)).not.toBe(syncOptionsKey({}))
  })

  it('ignores the callbacks in the key', () => {
    expect(syncOptionsKey({ onParseError: () => {}, throwOnError: true })).toBe(
      syncOptionsKey({})
    )
  })
})

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

  it('never writes history and never applies on create', () => {
    expect(gridUrlSyncOptions(gridApi, {}, onIssue)).toMatchObject({
      history: 'none',
      popstate: false,
      applyUrlOnCreate: false,
      throwOnError: false
    })
  })
})
