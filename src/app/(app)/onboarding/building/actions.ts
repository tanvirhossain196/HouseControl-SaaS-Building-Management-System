'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth/session'
import { toAppError } from '@/lib/errors'
import { setUpFirstBuilding } from '@/services/onboarding.service'
import { money } from '@/lib/validation/common'
import type { ActionResult } from '@/types'

const setupSchema = z.object({
  organisationName: z.string().trim().min(2, 'Give it a name.').max(120),
  buildingName: z.string().trim().min(2, 'Name the building.').max(120),
  addressLine: z.string().trim().min(5, 'Add a street address.').max(240),
  area: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(80).default('Dhaka'),
  floorsCount: z.coerce.number().int().min(1, 'At least one floor.').max(200),
  generateUnits: z.coerce.boolean().default(true),
  unitsPerFloor: z.coerce.number().int().min(1).max(20).default(2),
  monthlyRent: z.coerce.number().pipe(money).default(0),
  rentDueDay: z.coerce.number().int().min(1).max(28).default(5),
})

/**
 * Creates the organization, the building, and optionally its units.
 *
 * No permission check: this is the one action a person takes before they have
 * any role at all. The service does the ownership work with the service role,
 * because nobody can be the first member of their own organization under the
 * RLS policy that governs `org_members`.
 */
export async function setUpBuildingAction(
  input: unknown,
): Promise<ActionResult<{ buildingId: string; unitsCreated: number }>> {
  const parsed = setupSchema.safeParse(input)

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form'
      ;(fieldErrors[key] ??= []).push(issue.message)
    }
    return { ok: false, error: 'Some fields need fixing.', fieldErrors }
  }

  try {
    const session = await requireSession()

    const result = await setUpFirstBuilding(session.userId, {
      organisationName: parsed.data.organisationName,
      buildingName: parsed.data.buildingName,
      addressLine: parsed.data.addressLine,
      area: parsed.data.area,
      city: parsed.data.city,
      floorsCount: parsed.data.floorsCount,
      units: parsed.data.generateUnits
        ? {
            fromFloor: 0,
            toFloor: Math.max(0, parsed.data.floorsCount - 1),
            unitsPerFloor: parsed.data.unitsPerFloor,
            floorStyle: 'ground_g',
            unitStyle: 'floor_letter',
            monthlyRent: parsed.data.monthlyRent,
            rentDueDay: parsed.data.rentDueDay,
          }
        : undefined,
    })

    revalidatePath('/', 'layout')
    return {
      ok: true,
      data: { buildingId: result.buildingId, unitsCreated: result.unitsCreated },
    }
  } catch (error) {
    return { ok: false, error: toAppError(error).message }
  }
}
