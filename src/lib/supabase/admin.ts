import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { publicEnv, serverEnv } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only for work no user performs directly: gateway webhooks, scheduled
 * reminder jobs, writing audit logs, platform admin tooling. Never import this
 * into a client component or a route that takes user input without checking
 * permissions first.
 */
export function createAdminSupabase() {
  const env = publicEnv()
  const secrets = serverEnv()

  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    secrets.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
