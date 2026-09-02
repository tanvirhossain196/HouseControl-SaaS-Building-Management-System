import { route } from '@/lib/api/handler'
import { ok } from '@/lib/api/response'

/** Liveness probe. Public on purpose — no auth, no database call. */
export const GET = route({ auth: false }, async () =>
  ok({
    status: 'up',
    service: 'housecontrol',
    phase: 2,
    time: new Date().toISOString(),
  }),
)

export const dynamic = 'force-dynamic'
