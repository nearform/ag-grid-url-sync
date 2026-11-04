import { describe, expect, it } from 'vitest'
import {
  classifyEvent,
  couldBeLanding,
  modelKey,
  settleWrite,
  startWrite,
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

    it('calls the URL form of the write from the API a landing', () => {
      const result = classifyEvent(modelPending, {
        key: 'krebuilt',
        live: { name: 'rebuilt' },
        source: 'api',
        urlKey: 'ujo'
      })

      expect(result).toEqual({
        own: { phase: 'landed', kind: 'view', key: 'krebuilt' },
        kind: 'landing',
        write: 'view'
      })
    })

    it('calls the URL form of the write from the UI a change', () => {
      const result = classifyEvent(modelPending, {
        key: 'krebuilt',
        live: { name: 'rebuilt' },
        source: 'columnFilter',
        urlKey: 'ujo'
      })

      expect(result).toEqual({ own: null, kind: 'change', write: null })
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
          source: 'api',
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

// On a deferred grid, two writes in one tick land in order. The second
// write must wait for the first one's landing (Review Focus 4, #223).
describe('a write that starts while an earlier write is pending', () => {
  const viewPending: OwnWrite = {
    ...pending,
    kind: 'view',
    acceptedKey: 'ma',
    acceptedUrlKey: 'ua'
  }

  describe('startWrite', () => {
    it('has no waits with no record or a landed record', () => {
      expect(startWrite(null, 'view')).toEqual({
        phase: 'writing',
        kind: 'view'
      })
      expect(
        startWrite({ phase: 'landed', kind: 'url', key: 'kjo' }, 'url')
      ).toEqual({ phase: 'writing', kind: 'url' })
    })

    it('keeps the URL form of a pending model write', () => {
      expect(startWrite(viewPending, 'view')).toEqual({
        phase: 'writing',
        kind: 'view',
        waits: ['ua']
      })
    })

    it('keeps the key of a pending URL write', () => {
      expect(startWrite(pending, 'url')).toEqual({
        phase: 'writing',
        kind: 'url',
        waits: ['kjo']
      })
    })

    it('keeps the waits of the pending write', () => {
      expect(
        startWrite({ ...viewPending, waits: ['u0'] }, 'app')
      ).toMatchObject({ waits: ['u0', 'ua'] })
    })
  })

  describe('settleWrite', () => {
    const writing: OwnWrite = { phase: 'writing', kind: 'view', waits: ['ua'] }

    it('keeps the waits in the pending record', () => {
      const result = settleWrite(writing, {
        ...after,
        kind: 'view',
        afterKey: 'kx',
        beforeKey: 'kx'
      })

      expect(result.own).toMatchObject({ phase: 'pending', waits: ['ua'] })
    })

    it('does not land a write that the grid shows already, because the earlier write lands later', () => {
      const result = settleWrite(writing, {
        ...after,
        kind: 'view',
        afterKey: 'kjo',
        beforeKey: 'kjo'
      })

      expect(result.landed).toBe(false)
      expect(result.own).toMatchObject({ phase: 'pending', waits: ['ua'] })
    })

    it('lands a write that changed the grid in the call', () => {
      const result = settleWrite(writing, {
        ...after,
        kind: 'view',
        afterKey: 'kjo',
        beforeKey: 'kx'
      })

      expect(result).toEqual({
        own: { phase: 'landed', kind: 'view', key: 'kjo' },
        landed: true
      })
    })
  })

  describe('classifyEvent', () => {
    const second: OwnWrite = {
      ...pending,
      kind: 'view',
      acceptedKey: 'mb',
      acceptedUrlKey: 'ub',
      waits: ['ua']
    }

    it("calls the earlier model write's landing an echo, and drops it from waits", () => {
      const result = classifyEvent(second, {
        key: 'ma',
        live: { name: 'a' },
        source: 'api',
        urlKey: 'ua'
      })

      expect(result).toEqual({
        own: { ...second, waits: [] },
        kind: 'echo',
        write: 'view',
        queued: true
      })
    })

    it("calls the earlier URL write's landing an echo, and drops it from waits", () => {
      const own: OwnWrite = { ...pending, acceptedKey: 'kage', waits: ['kjo'] }

      const result = classifyEvent(own, {
        key: 'kjo',
        live: accepted,
        source: 'api'
      })

      expect(result).toEqual({
        own: { ...own, waits: [] },
        kind: 'echo',
        write: 'url',
        queued: true
      })
    })

    it("calls a UI edit with the earlier write's URL form a change", () => {
      const result = classifyEvent(second, {
        key: 'ma',
        live: { name: 'a' },
        source: 'columnFilter',
        urlKey: 'ua'
      })

      expect(result).toEqual({ own: null, kind: 'change', write: null })
    })

    it('calls the accepted key a landing, also when the grid showed it before', () => {
      const result = classifyEvent(
        { ...second, beforeKey: 'mb' },
        { key: 'mb', live: { name: 'b' }, source: 'api', urlKey: 'ub' }
      )

      expect(result).toEqual({
        own: { phase: 'landed', kind: 'view', key: 'mb' },
        kind: 'landing',
        write: 'view'
      })
    })
  })
})

// The grid lands the waited writes in order, and sends no event for a write
// that does not change its model. So `waits` is a queue.
describe('waits as a queue', () => {
  /** The pending model write `accepted`, after the writes in `waits` */
  const after = (
    acceptedKey: string,
    waits: readonly string[],
    beforeKey = 'm0'
  ): OwnWrite => ({
    ...pending,
    kind: 'view',
    beforeKey,
    acceptedKey,
    acceptedUrlKey: `u${acceptedKey.slice(1)}`,
    waits
  })

  /** The grid's own event with the model key `key` */
  const api = (key: string) => ({
    key,
    live: { name: key },
    source: 'api',
    urlKey: `u${key.slice(1)}`
  })

  it('A, B, A: the first A is an echo, and B stays in waits', () => {
    const own = after('ma', ['ua', 'ub'])

    expect(classifyEvent(own, api('ma'))).toEqual({
      own: { ...own, waits: ['ub'] },
      kind: 'echo',
      write: 'view',
      queued: true
    })
  })

  it('A, B, A: B empties waits, and the write still waits for its landing', () => {
    const own = after('ma', ['ub'])

    expect(classifyEvent(own, api('mb'))).toEqual({
      own: { ...own, waits: [] },
      kind: 'echo',
      write: 'view',
      queued: true
    })
  })

  it('A, B, A: the last A lands', () => {
    expect(classifyEvent(after('ma', []), api('ma'))).toEqual({
      own: { phase: 'landed', kind: 'view', key: 'ma' },
      kind: 'landing',
      write: 'view'
    })
  })

  it('A, A: the one event lands the write, because the grid sends no second event', () => {
    expect(classifyEvent(after('ma', ['ua']), api('ma'))).toEqual({
      own: { phase: 'landed', kind: 'view', key: 'ma' },
      kind: 'landing',
      write: 'view'
    })
  })

  it('A, A, A: the one event lands the write', () => {
    expect(classifyEvent(after('ma', ['ua', 'ua']), api('ma')).kind).toBe(
      'landing'
    )
  })

  it('A, then the model from before: A is an echo, then the model from before lands', () => {
    const first = classifyEvent(after('m0', ['ua'], 'm0'), api('ma'))

    expect(first.kind).toBe('echo')

    const second = classifyEvent(first.own, api('m0'))

    expect(second).toEqual({
      own: { phase: 'landed', kind: 'view', key: 'm0' },
      kind: 'landing',
      write: 'view'
    })
  })

  it('drops each wait up to the match: a write with no event was skipped', () => {
    const own = after('md', ['ua', 'ub', 'uc'])

    expect(classifyEvent(own, api('mb')).own).toEqual({ ...own, waits: ['uc'] })
  })

  it('jo, age, jo for URL writes: two echoes, then the landing', () => {
    const own: OwnWrite = { ...pending, waits: ['kjo', 'kage'] }
    const event = (key: string) => ({ key, live: accepted, source: 'api' })

    const first = classifyEvent(own, event('kjo'))
    const second = classifyEvent(first.own, event('kage'))
    const third = classifyEvent(second.own, event('kjo'))

    expect([first.kind, second.kind, third.kind]).toEqual([
      'echo',
      'echo',
      'landing'
    ])
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
  // A column that the grid rebuilt in its own form is the write's when its
  // URL form is the write's (#223, the per-column rebuilt landing)
  describe('with the URL form of each column', () => {
    const rebuilt = { created: 'normalised', age: 3 }
    const written = { created: 'hand built' }

    const forms = (live: string) => ({
      live: new Map([['created', live]]),
      written: new Map([['created', 'u-created']])
    })

    it('is true for a column with the URL form of the write', () => {
      expect(
        couldBeLanding(rebuilt, written, { age: 3 }, forms('u-created'))
      ).toBe(true)
    })

    it('is false for a column with another URL form', () => {
      expect(
        couldBeLanding(rebuilt, written, { age: 3 }, forms('u-other'))
      ).toBe(false)
    })

    it('is false for a clear-all', () => {
      expect(couldBeLanding({}, written, { age: 3 }, forms('u-created'))).toBe(
        false
      )
    })
  })
})

describe('classifyEvent with the URL form of each column (#223)', () => {
  const model: OwnWrite = {
    phase: 'pending',
    kind: 'restore',
    before: { age: 3 },
    beforeKey: 'mage',
    accepted: { created: 'hand built' },
    acceptedKey: 'mhand',
    acceptedUrlKey: 'u-created',
    acceptedColumnUrlKeys: new Map([['created', 'u-created']])
  }

  it('lands a rebuilt column beside a column from before', () => {
    const result = classifyEvent(model, {
      key: 'mrebuilt-age',
      live: { created: 'normalised', age: 3 },
      source: 'api',
      urlKey: 'u-created-age',
      columnUrlKeys: new Map([
        ['created', 'u-created'],
        ['age', 'u-age']
      ])
    })

    expect(result.kind).toBe('landing')
  })

  it('is a change for the user, in the same form', () => {
    const result = classifyEvent(model, {
      key: 'mrebuilt-age',
      live: { created: 'normalised', age: 3 },
      source: 'columnFilter',
      urlKey: 'u-created-age',
      columnUrlKeys: new Map([['created', 'u-created']])
    })

    expect(result.kind).toBe('change')
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
