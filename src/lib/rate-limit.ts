/**
 * Fixed-window rate limiter.
 *
 * In-memory, so it counts per server instance — good enough for development
 * and a single Node process. Before going to production on Vercel, swap the
 * store for Upstash Redis; the interface below does not change.
 */
type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()
const WINDOW_MS = 60_000

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  limit: number
  resetAt: number
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs = WINDOW_MS,
): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, limit, resetAt }
  }

  bucket.count += 1
  const allowed = bucket.count <= limit
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.count),
    limit,
    resetAt: bucket.resetAt,
  }
}

/** Sweep expired buckets so the map does not grow without bound. */
export function pruneRateLimits() {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

/** Stricter limits for endpoints worth protecting individually. */
export const rateLimits = {
  default: 60,
  auth: 10,
  payment: 20,
  upload: 15,
} as const
