import { describe, expect, it } from 'vitest'
import {
  classifyEvent,
  couldBeLanding,
  modelKey,
  settleWrite,
  type AfterCall,
  type OwnWrite
} from './own-write.js'

const before = { name: 'x' }
const accepted = { name: 'jo' }

const after: AfterCall = {
  kind: 'url',
  failed: false,
  afterKey: 'other',
  before,
  beforeKey: null,
  accepted,
  acceptedKey: 'kjo'
}

const pending: OwnWrite = {
  phase: 'pending',
  kind: 'url',
  before,
  beforeKey: 'kx',
  accepted,
  acceptedKey: 'kjo'
}

describe('settleWrite', () => {
  it('ends the record when the grid threw', () => {
    const result = settleWrite(
      { phase: 'writing', kind: 'url' },
      { ...after, failed: true }
    )

    expect(result).toEqual({ own: null, landed: false })
  })

  it('lands when an event inside the call landed it', () => {
    const result = settleWrite(
      { phase: 'landed', kind: 'url', key: 'kjo' },
      { ...after, afterKey: 'kjo' }
    )

    expect(result.landed).toBe(true)
    expect(result.own).toEqual({ phase: 'landed', kind: 'url', key: 'kjo' })
  })

  it('lands when the grid shows the accepted columns', () => {
    const result = settleWrite(
      { phase: 'writing', kind: 'url' },
      { ...after, afterKey: 'kjo', beforeKey: 'kjo' }
    )

    expect(result.landed).toBe(true)
    expect(result.own).toEqual({ phase: 'landed', kind: 'url', key: 'kjo' })
  })

  it('lands when the grid took the write in a form of its own', () => {
    const result = settleWrite(
      { phase: 'writing', kind: 'url' },
      { ...after, afterKey: 'kother', beforeKey: 'kx' }
    )

    expect(result.landed).toBe(true)
    expect(result.own).toEqual({ phase: 'landed', kind: 'url', key: 'kother' })
  })

  it('stays pending when the grid shows the state from before', () => {
    const result = settleWrite(
      { phase: 'writing', kind: 'url' },
      { ...after, afterKey: 'kx', beforeKey: 'kx' }
    )

    expect(result).toEqual({ own: pending, landed: false })
  })

  it('stays pending when the grid cannot be read after the call', () => {
    const result = settleWrite(
      { phase: 'writing', kind: 'view' },
      { ...after, kind: 'view', afterKey: null, beforeKey: 'kx' }
    )

    expect(result.landed).toBe(false)
    expect(result.own).toMatchObject({ phase: 'pending', kind: 'view' })
  })

  it('keeps the key of an event inside the call when the grid cannot be read after it', () => {
    const result = settleWrite(
      { phase: 'landed', kind: 'view', key: 'kjo' },
      { ...after, kind: 'view', afterKey: null }
    )

    expect(result).toEqual({
      own: { phase: 'landed', kind: 'view', key: 'kjo' },
      landed: true
    })
  })

  it('keeps the URL form of a pending model write', () => {
    const result = settleWrite(
      { phase: 'writing', kind: 'view' },
      {
        ...after,
        kind: 'view',
        afterKey: 'kx',
        beforeKey: 'kx',
        acceptedUrlKey: 'ujo'
      }
    )

    expect(result.own).toMatchObject({
      phase: 'pending',
      acceptedUrlKey: 'ujo'
    })
  })

  it('stays pending when the state from before is not known', () => {
    const result = settleWrite(
      { phase: 'writing', kind: 'url' },
      { ...after, before: null, beforeKey: null }
    )

    expect(result.landed).toBe(false)
    expect(result.own).toMatchObject({ phase: 'pending', before: null })
  })
})

describe('classifyEvent', () => {
  const event = { key: 'kjo', live: accepted, source: 'api' }

  it('calls the same key after a landing an echo', () => {
    const own: OwnWrite = { phase: 'landed', kind: 'url', key: 'kjo' }

    expect(classifyEvent(own, event)).toEqual({
      own,
      kind: 'echo',
      write: 'url'
    })
  })

  it('calls another key after a landing a change', () => {
    const own: OwnWrite = { phase: 'landed', kind: 'url', key: 'kjo' }
    const result = classifyEvent(own, { ...event, key: 'kz' })

    expect(result).toEqual({ own: null, kind: 'change', write: null })
  })

  it('calls the state from before an echo while pending', () => {
    const result = classifyEvent(pending, { ...event, key: 'kx', live: before })

    expect(result).toEqual({ own: pending, kind: 'echo', write: 'url' })
  })

  it('calls the accepted key a landing', () => {
    const result = classifyEvent(pending, { ...event, source: 'columnFilter' })

    expect(result).toEqual({
      own: { phase: 'landed', kind: 'url', key: 'kjo' },
      kind: 'landing',
      write: 'url'
    })
  })

  it('calls a part landing from the API a landing', () => {
    const result = classifyEvent(
      {
        ...pending,
        before: { name: 'x', age: 3 },
        beforeKey: 'kxa'
      },
      { key: 'kpart', live: { name: 'jo', age: 3 }, source: 'api' }
    )

    expect(result.kind).toBe('landing')
    expect(result.own).toEqual({ phase: 'landed', kind: 'url', key: 'kpart' })
  })

  it('calls a part landing from the UI a change', () => {
    const result = classifyEvent(
      { ...pending, before: { name: 'x', age: 3 } },
      { key: 'kpart', live: { name: 'jo', age: 3 }, source: 'columnFilter' }
    )

    expect(result).toEqual({ own: null, kind: 'change', write: null })
  })

  describe('a model write that the grid rebuilds', () => {
    const modelPending: OwnWrite = {
      ...pending,
      kind: 'view',
      acceptedUrlKey: 'ujo'
    }

    it('calls the URL form of the write a landing, from any source', () => {
      const result = classifyEvent(modelPending, {
        key: 'krebuilt',
        live: { name: 'rebuilt' },
        source: 'columnFilter',
        urlKey: 'ujo'
      })

      expect(result).toEqual({
        own: { phase: 'landed', kind: 'view', key: 'krebuilt' },
        kind: 'landing',
        write: 'view'
      })
    })

    it('calls another URL form a change', () => {
      const result = classifyEvent(modelPending, {
        key: 'kother',
        live: { name: 'other' },
        source: 'api',
        urlKey: 'uother'
      })

      expect(result).toEqual({ own: null, kind: 'change', write: null })
    })

    it('calls the model from before an echo, even with the URL form of the write', () => {
      const result = classifyEvent(modelPending, {
        key: 'kx',
        live: before,
        source: 'api',
        urlKey: 'ujo'
      })

      expect(result.kind).toBe('echo')
    })

    it('is not a landing for a record with no URL form', () => {
      const result = classifyEvent(
        { ...pending, kind: 'view' },
        {
          key: 'krebuilt',
          live: { name: 'rebuilt' },
          source: 'columnFilter',
          urlKey: 'ujo'
        }
      )

      expect(result.kind).toBe('change')
    })
  })

  it('calls any event with no record a change', () => {
    expect(classifyEvent(null, event)).toEqual({
      own: null,
      kind: 'change',
      write: null
    })
  })
})

describe('couldBeLanding', () => {
  it('is false for a clear-all', () => {
    expect(couldBeLanding({}, accepted, before)).toBe(false)
  })

  it('is false for another value', () => {
    expect(couldBeLanding({ name: 'other' }, accepted, before)).toBe(false)
  })

  it("is true when the grid gives a column's keys in another order", () => {
    expect(
      couldBeLanding(
        { name: { type: 'contains', filterType: 'text', filter: 'jo' } },
        { name: { filterType: 'text', type: 'contains', filter: 'jo' } },
        null
      )
    ).toBe(true)
  })

  it('is true for the write on one column and the old value on another', () => {
    expect(
      couldBeLanding({ name: 'jo', age: 3 }, accepted, { name: 'x', age: 3 })
    ).toBe(true)
  })
})

describe('modelKey', () => {
  it('does not depend on the key order at any level', () => {
    expect(
      modelKey({
        name: { filterType: 'text', type: 'contains', filter: 'jo' },
        age: { filterType: 'number', type: 'equals', filter: 30 }
      })
    ).toBe(
      modelKey({
        age: { filter: 30, type: 'equals', filterType: 'number' },
        name: { filter: 'jo', filterType: 'text', type: 'contains' }
      })
    )
  })

  it('differs for another value', () => {
    expect(modelKey({ age: { filterType: 'number', filter: 30 } })).not.toBe(
      modelKey({ age: { filterType: 'number', filter: '30' } })
    )
  })
})
