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

export const GET = route(
  {
    query: z.object({ orgId: uuid }),
    permission: 'building.edit',
    scope: ({ query }) => ({ orgId: query.orgId }),
  },
  async ({ query }) => ok(await listBuildings(query.orgId)),
)

export const POST = route(
  {
    body: createBuildingSchema,
    permission: 'building.create',
    // Checked against the organization in the body, not "anywhere": an admin
    // of one organization must not be able to create inside another.
    scope: ({ body }) => ({ orgId: body.orgId }),
  },
  async ({ body, userId }) => created(await createBuilding(userId, body)),
)
