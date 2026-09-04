import { NextResponse, type NextRequest } from 'next/server'
import { pruneRateLimits, rateLimit, rateLimits } from '@/lib/rate-limit'
import { updateSession } from '@/lib/supabase/middleware'
import { hasSupabase } from '@/lib/env'

/**
 * Runs before every request that is not a static asset.
 *
 * In order: CORS for /api, rate limiting for /api, a CSRF origin check on
 * state-changing requests, Supabase session refresh, and route protection.
 * Role-level checks (admin vs moderator vs resident) arrive in Phase 4; this
 * file only answers "are you signed in".
 */

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  ''
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

/**
 * Everything needs a session unless it is on this list. Failing closed matters:
 * a new screen added in a later phase is protected by default, and forgetting
 * to add it here is a visible bug rather than a silent leak.
 */
const publicPaths = [
  '/',
  '/about',
  '/contact',
  '/faq',
  '/privacy',
  '/terms',
  '/cookies',
  '/styleguide',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/check-email',
  '/sitemap.xml',
  '/robots.txt',
]

/**
 * Prefixes that are public along with everything under them.
 *
 * Gateway callbacks arrive from the provider's servers with no session and no
 * Origin header, so they are exempt from both the session check and the CSRF
 * origin check below. Their authenticity is established by signature
 * verification inside the handler instead.
 */
const publicPrefixes = [
  '/auth/',
  '/api/health',
  '/api/payments/webhook/',
  // The scheduler has no session; the route checks a shared secret instead.
  '/api/cron/',
]

function isPublic(pathname: string) {
  return (
    publicPaths.includes(pathname) ||
    publicPrefixes.some((prefix) => pathname.startsWith(prefix))
  )
}

/** Signed-out only — a signed-in person landing here goes to the dashboard. */
const guestOnlyPaths = ['/sign-in', '/sign-up', '/forgot-password']

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

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

function jsonError(code: string, message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers })
}

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isApi = pathname.startsWith('/api')
  const origin = request.headers.get('origin')

  if (isApi && request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
  }

  if (isApi) {
    if (origin && !allowedOrigins.includes(origin)) {
      return jsonError('forbidden', 'Origin not allowed.', 403)
    }

    if (Math.random() < 0.01) pruneRateLimits()

    const result = rateLimit(clientKey(request), limitForPath(pathname))
    if (!result.allowed) {
      return jsonError('rate_limited', 'Too many requests. Try again shortly.', 429, {
        'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
      })
    }
  }

  /**
   * CSRF: session cookies are SameSite=Lax, which already blocks a cross-site
   * form POST. This is the second check — a state-changing request must come
   * from an origin we know. Server Actions send an Origin header too.
   */
  if (
    !SAFE_METHODS.has(request.method) &&
    !pathname.startsWith('/api/payments/webhook/')
  ) {
    const source = origin ?? request.headers.get('referer')
    const sourceOrigin = source ? safeOrigin(source) : null
    const sameSite = sourceOrigin === request.nextUrl.origin

    if (!sameSite && !(sourceOrigin && allowedOrigins.includes(sourceOrigin))) {
      return isApi
        ? jsonError('forbidden', 'Cross-site request blocked.', 403)
        : new NextResponse('Cross-site request blocked.', { status: 403 })
    }
  }

  // Session refresh. Skipped when Supabase is not configured, so the public
  // site still runs on a machine with no keys — including one where
  // .env.example was copied without being filled in.
  if (!hasSupabase()) return NextResponse.next()

  const { response, user } = await updateSession(request)

  if (!isPublic(pathname) && !user) {
    const signIn = request.nextUrl.clone()
    signIn.pathname = '/sign-in'
    signIn.search = `?next=${encodeURIComponent(pathname)}`
    return NextResponse.redirect(signIn)
  }

  if (user && guestOnlyPaths.includes(pathname)) {
    const dashboard = request.nextUrl.clone()
    dashboard.pathname = '/dashboard'
    dashboard.search = ''
    return NextResponse.redirect(dashboard)
  }

  if (isApi) {
    corsHeaders(origin).forEach((value, key) => response.headers.set(key, value))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|webp)$).*)',
  ],
}
