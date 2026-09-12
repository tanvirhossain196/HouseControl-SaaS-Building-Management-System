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
/**
 * The styleguide is not here on purpose.
 *
 * It is a reference for whoever is building the interface, not a page for
 * customers, and leaving it open publishes the design system to anyone who
 * guesses the URL. Signed-in people can still reach it; everybody else is sent
 * to sign in.
 */
const publicPaths = [
  '/',
  '/about',
  '/contact',
  '/faq',
  '/privacy',
  '/terms',
  '/cookies',
  '/refund',
  // Reachable with no session, because it is what a signed-out phone with no
  // connection falls back to.
  '/offline',
  '/download',
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
const gatewayPrefixes = [
  '/api/payments/webhook/',
  '/api/subscriptions/webhook/',
  // Browser return from the gateway: a cross-site POST that we turn into a
  // same-site GET. Carries no authority of its own.
  '/api/gateway/return',
]

function isGatewayCallback(pathname: string) {
  return gatewayPrefixes.some((prefix) => pathname.startsWith(prefix))
}

const publicPrefixes = [
  '/auth/',
  '/api/health',
  ...gatewayPrefixes,
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

/**
 * Whether this request carries a Supabase session at all.
 *
 * updateSession() calls auth.getUser(), which is a network round trip to
 * Supabase on every single request — including a signed-out visitor loading the
 * home page. At any real traffic that is the ceiling the whole app hits first:
 * ten thousand page views become ten thousand auth calls.
 *
 * A request with no auth cookie cannot have a session, so there is nothing to
 * refresh and nothing to ask about. Reading the cookie jar is free; the call it
 * avoids is not.
 *
 * Supabase names its cookies `sb-<project-ref>-auth-token`, sometimes split
 * into `.0`, `.1` chunks when the token is long, so the check is by shape
 * rather than by exact name.
 */
function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'))
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

  const fromGateway = isGatewayCallback(pathname)

  if (isApi) {
    // A form POST from the gateway's own domain carries its Origin header, so
    // the allowlist would reject it. These routes authenticate by signature.
    if (origin && !fromGateway && !allowedOrigins.includes(origin)) {
      return jsonError('forbidden', 'Origin not allowed.', 403)
    }

    if (Math.random() < 0.01) pruneRateLimits()

    const result = await rateLimit(clientKey(request), limitForPath(pathname))
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
  if (!SAFE_METHODS.has(request.method) && !fromGateway) {
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

  /**
   * No cookie, no session. A signed-out visitor is sent on their way without
   * touching Supabase — which is most of the traffic on a public page, and all
   * of the traffic from crawlers.
   */
  if (!hasAuthCookie(request)) {
    if (!isPublic(pathname)) {
      const signIn = request.nextUrl.clone()
      signIn.pathname = '/sign-in'
      signIn.search = `?next=${encodeURIComponent(pathname)}`
      return NextResponse.redirect(signIn)
    }

    const anonymous = NextResponse.next()

    if (isApi) {
      corsHeaders(origin).forEach((value, key) => anonymous.headers.set(key, value))
    }

    return anonymous
  }

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
    /**
     * Everything except static output and files served straight from /public.
     * A font or a manifest has no session to refresh, and every path listed
     * here is one fewer middleware invocation under load.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml|fonts/|assets/|.*\\.(?:svg|png|jpg|jpeg|webp|gif|ico|ttf|woff|woff2|css|js|txt|xml)$).*)',
  ],
}
