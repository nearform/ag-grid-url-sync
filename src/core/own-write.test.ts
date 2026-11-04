import { describe, expect, it } from 'vitest'
import {
  classifyEvent,
  couldBeLanding,
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

  it('is true for the write on one column and the old value on another', () => {
    expect(
      couldBeLanding({ name: 'jo', age: 3 }, accepted, { name: 'x', age: 3 })
    ).toBe(true)
  })
})
