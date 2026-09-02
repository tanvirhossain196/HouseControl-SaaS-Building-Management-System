import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { publicEnv } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Refreshes the Supabase session on every request and copies the rotated
 * cookies onto the response. Without this, an expired access token would log
 * the person out mid-session even though their refresh token is still valid.
 *
 * Returns the response to send and the user it belongs to, so middleware can
 * decide about protected routes without a second round trip.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const env = publicEnv()

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, {
              ...options,
              httpOnly: true,
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
            }),
          )
        },
      },
    },
  )

  // getUser() revalidates the token with Supabase. getSession() only reads the
  // cookie, which a client could have tampered with — never trust it here.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { response, user }
}
