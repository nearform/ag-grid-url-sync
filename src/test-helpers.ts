import { act } from '@testing-library/react'

/**
 * Helper function to wait for React effects to complete in tests.
 * This is commonly needed when testing React hooks that have async effects.
 *
 * @example
 * ```typescript
 * import { waitForEffects } from '../test-helpers'
 *
 * test('my test', async () => {
 *   const { result } = renderHook(() => useMyHook())
 *   await waitForEffects()
 *   expect(result.current.isReady).toBe(true)
 * })
 * ```
 */
export const waitForEffects = () => act(() => setTimeout(() => {}, 0))

/**
 * Helper function to wait for multiple effect cycles.
 * Useful when you need to wait for multiple async operations to complete.
 *
 * @param cycles - Number of effect cycles to wait for (default: 2)
 */
export const waitForMultipleEffects = async (cycles: number = 2) => {
  for (let i = 0; i < cycles; i++) {
    await waitForEffects()
  }
}
