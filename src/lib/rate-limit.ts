/**
 * Fixed-window rate limiter.
 *
 * Counting in memory works for one Node process and nowhere else. On a platform
 * that runs several instances, each keeps its own map, so a limit of 20 becomes
 * 20 × however many instances happen to be warm — which is not a limit at all,
 * and is worst exactly when it matters, because traffic is what spawns the
 * extra instances.
 *
 * So the count lives in Redis when Upstash is configured, and in memory when it
 * is not. The fallback is deliberate rather than an oversight: a developer with
 * no Redis should still get working rate limits, and a missing environment
 * variable should not take the site down.
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

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  return url && token ? { url, token } : null
}

function inMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs
    buckets.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: limit - 1, limit, resetAt }
  }

  bucket.count += 1

  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    limit,
    resetAt: bucket.resetAt,
  }
}

/**
 * INCR, then EXPIRE only on the first hit of a window.
 *
 * Setting the expiry every time would slide the window forward with each
 * request, so somebody knocking steadily would never reset and never recover.
 * The pipeline is one round trip; two separate calls would double the latency
 * added to every request that passes through middleware.
 */
async function inRedis(
  key: string,
  limit: number,
  windowMs: number,
  config: { url: string; token: string },
): Promise<RateLimitResult> {
  const seconds = Math.ceil(windowMs / 1000)
  const now = Date.now()

  const response = await fetch(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, String(seconds), 'NX'],
      ['PTTL', key],
    ]),
    cache: 'no-store',
  })

  if (!response.ok) throw new Error(`Upstash returned ${response.status}`)

  const payload = (await response.json()) as Array<{ result: number }>

  const count = Number(payload[0]?.result ?? 1)
  const ttl = Number(payload[2]?.result ?? windowMs)

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    limit,
    resetAt: now + (ttl > 0 ? ttl : windowMs),
  }
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs = WINDOW_MS,
): Promise<RateLimitResult> {
  const config = redisConfig()

  if (!config) return inMemory(key, limit, windowMs)

  try {
    return await inRedis(`rl:${key}`, limit, windowMs, config)
  } catch (cause) {
    /**
     * Redis being unreachable must not lock everyone out.
     *
     * Falling back to the local count keeps some limit in place, which is the
     * right trade: a brief window of weaker limiting is survivable, an outage
     * that rejects every request is not.
     */
    console.error('[rate-limit] falling back to memory', cause)
    return inMemory(key, limit, windowMs)
  }
}

/** Sweep expired buckets so the in-memory map cannot grow without bound. */
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
