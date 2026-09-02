import { NextResponse, type NextRequest } from 'next/server'
import { pruneRateLimits, rateLimit, rateLimits } from '@/lib/rate-limit'

/**
 * Runs before every request that is not a static asset.
 *
 * Responsibilities, in order: CORS for /api, rate limiting for /api, and
 * security headers. Session refresh is added here in Phase 3; route
 * protection by role is added in Phase 4.
 */

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  ''
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

function corsHeaders(origin: string | null) {
  const headers = new Headers()
  if (origin && allowedOrigins.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Credentials', 'true')
    headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    headers.set('Access-Control-Max-Age', '86400')
    headers.set('Vary', 'Origin')
  }
  return headers
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown'
  return `${ip}:${request.nextUrl.pathname.split('/').slice(0, 4).join('/')}`
}

function limitForPath(pathname: string) {
  if (pathname.startsWith('/api/auth')) return rateLimits.auth
  if (pathname.startsWith('/api/payments')) return rateLimits.payment
  if (pathname.startsWith('/api/uploads')) return rateLimits.upload
  return rateLimits.default
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApi = pathname.startsWith('/api')
  const origin = request.headers.get('origin')

  if (isApi && request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (isApi) {
    // Reject cross-origin calls from origins we did not allow.
    if (origin && !allowedOrigins.includes(origin)) {
      return NextResponse.json(
        { ok: false, error: { code: 'forbidden', message: 'Origin not allowed.' } },
        { status: 403 },
      )
    }

    if (Math.random() < 0.01) pruneRateLimits()

    const limit = limitForPath(pathname)
    const result = rateLimit(clientKey(request), limit)

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000)
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'rate_limited',
            message: 'Too many requests. Try again shortly.',
          },
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(result.limit),
            'X-RateLimit-Remaining': '0',
          },
        },
      )
    }

    const response = NextResponse.next()
    corsHeaders(origin).forEach((value, key) => response.headers.set(key, value))
    response.headers.set('X-RateLimit-Limit', String(result.limit))
    response.headers.set('X-RateLimit-Remaining', String(result.remaining))
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|webp)$).*)',
  ],
}
