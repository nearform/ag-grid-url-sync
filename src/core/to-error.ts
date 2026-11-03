/**
 * The caught value as an Error. A callee can throw any value, so a value that
 * is not an Error is wrapped in one with its text as the message.
 */
export function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}
