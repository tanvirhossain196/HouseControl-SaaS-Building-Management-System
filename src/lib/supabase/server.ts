import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { hasSupabase, publicEnv } from '@/lib/env'
import { AppError, unauthorized } from '@/lib/errors'
import type { Database } from '@/types/database'

/**
 * Supabase client for server components, route handlers and server actions.
 * Runs as the signed-in user, so every query is filtered by RLS.
 */
export function createServerSupabase() {
  if (!hasSupabase()) {
    // A clearer failure than a schema error three frames deep: this happens
    // on a fresh checkout, and the fix is one line in .env.local.
    throw new AppError(
      'internal_error',
      'This deployment has no Supabase project configured. Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local — see docs/DEPLOYMENT.md.',
    )
  }

  const cookieStore = cookies()
  const env = publicEnv()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component: middleware refreshes the session
            // instead, so this is safe to ignore.
          }
        },
      },
    },
  )
}

/** The signed-in user, or null. */
export async function getCurrentUser() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

/** The signed-in user, or a 401. Use in anything behind auth. */
export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw unauthorized()
  return user
}
