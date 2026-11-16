// Sliding-window rate limiter kept in process memory.
//
// Good enough for one server instance; on serverless each instance keeps its
// own window, so the effective limit is per instance. Swap for a shared store
// if Ask ever becomes costly to serve.
export interface RateLimiter {
  /** Records an attempt for `key` and says whether it is allowed. */
  take(key: string, now?: number): { allowed: boolean; retryAfterMs: number };
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const attempts = new Map<string, number[]>();
  return {
    take(key, now = Date.now()) {
      const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        attempts.set(key, recent);
        return { allowed: false, retryAfterMs: windowMs - (now - recent[0]) };
      }
      recent.push(now);
      attempts.set(key, recent);
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
