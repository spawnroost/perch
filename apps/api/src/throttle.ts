/**
 * Records an attempt for `userId` in `last` unless one happened less than `cooldownMs` ago.
 * Returns 0 when the attempt may go ahead, else the seconds until it may. In-memory, per instance.
 */
export function throttleAttempt(
  last: Map<string, number>,
  userId: string,
  cooldownMs: number,
): number {
  const now = Date.now();
  const left = (last.get(userId) ?? -Infinity) + cooldownMs - now;
  if (left > 0) return Math.ceil(left / 1000);
  last.set(userId, now);
  return 0;
}
