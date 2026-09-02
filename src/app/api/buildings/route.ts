import { z } from 'zod'
import { route } from '@/lib/api/handler'
import { created, ok } from '@/lib/api/response'
import { createBuildingSchema } from '@/lib/validation/property'
import { createBuilding, listBuildings } from '@/services/buildings.service'
import { uuid } from '@/lib/validation/common'

/**
 * Reference endpoint for the pattern every later route follows:
 * validate with Zod, delegate to a service, return the standard envelope.
 * Errors are handled by route() — no try/catch here.
 */

export const GET = route({ query: z.object({ orgId: uuid }) }, async ({ query }) =>
  ok(await listBuildings(query.orgId)),
)

export const POST = route({ body: createBuildingSchema }, async ({ body, userId }) =>
  created(await createBuilding(userId, body)),
)
