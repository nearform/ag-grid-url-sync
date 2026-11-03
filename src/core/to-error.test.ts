import { describe, it, expect } from 'vitest'
import { toError } from './to-error.js'

describe('toError', () => {
  it('gives back an Error as it is', () => {
    const error = new TypeError('bad')

    expect(toError(error)).toBe(error)
  })

  it('wraps a thrown value that is not an Error', () => {
    const error = toError('bad')

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('bad')
  })
})
