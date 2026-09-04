import { route } from '@/lib/api/handler'
import { ok } from '@/lib/api/response'
import { createServerSupabase } from '@/lib/supabase/server'
import { z } from 'zod'

/**
 * Liveness and readiness.
 *
 * Plain `/api/health` answers without touching anything: it says the process
 * is up, which is what a load balancer needs and all it should pay for.
 *
 * `?deep=1` also pings the database. Use it from a monitor, not from a
 * per-request health check — one round trip per probe against a connection
 * pool is how a health check becomes the outage.
 */
export const GET = route(
  { auth: false, query: z.object({ deep: z.coerce.boolean().default(false) }) },
  async ({ query }) => {
    const base = {
      status: 'up' as const,
      service: 'housecontrol',
      time: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    }

    if (!query.deep) return ok(base)

    const started = Date.now()
    let database: 'up' | 'down' = 'down'

    try {
      const supabase = createServerSupabase()
      const { error } = await supabase.from('organizations').select('id').limit(1)
      database = error ? 'down' : 'up'
    } catch {
      database = 'down'
    }

    return ok({
      ...base,
      status: database === 'up' ? ('up' as const) : ('degraded' as const),
      database,
      databaseMs: Date.now() - started,
    })
  },
)

export const dynamic = 'force-dynamic'
