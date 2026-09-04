import { route } from '@/lib/api/handler'
import { ok } from '@/lib/api/response'
import { z } from 'zod'
import { search } from '@/services/search.service'

/**
 * Backs the header search box.
 *
 * No permission option: every query inside runs as the signed-in user and
 * RLS decides the rows, so the same endpoint returns a building for an owner
 * and one flat for its resident.
 */
export const GET = route(
  { query: z.object({ q: z.string().trim().max(120).default('') }) },
  async ({ query }) => ok(await search(query.q, 12)),
)

export const dynamic = 'force-dynamic'
