'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { assertPermission } from '@/lib/auth/guards'
import { toAppError } from '@/lib/errors'
import {
  archiveBuilding,
  createBuilding,
  getBuilding,
  updateBuilding,
} from '@/services/buildings.service'
import {
  archiveFlat,
  bulkCreateFlats,
  createFlat,
  updateFlat,
} from '@/services/flats.service'
import { recordLandlordRent } from '@/services/landlord.service'
import {
  bulkFlatsSchema,
  createBuildingSchema,
  createFlatSchema,
  landlordRentSchema,
  updateBuildingSchema,
  updateFlatSchema,
} from '@/lib/validation/property'
import { uuid } from '@/lib/validation/common'
import type { ActionResult } from '@/types'

/**
 * Every write on this screen goes through here.
 *
 * Each action names the permission and the scope it needs. A flat-scoped
 * action resolves the flat's organization first, because `can()` will not
 * assume an owner's rights over a flat it cannot place.
 */

function invalid(error: z.ZodError): Extract<ActionResult<never>, { ok: false }> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    ;(fieldErrors[key] ??= []).push(issue.message)
  }
  return { ok: false, error: 'Some fields need fixing.', fieldErrors }
}

function failed(error: unknown): Extract<ActionResult<never>, { ok: false }> {
  return { ok: false, error: toAppError(error).message }
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------
export async function createBuildingAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createBuildingSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await assertPermission('building.create', {
      orgId: parsed.data.orgId,
    })
    const building = await createBuilding(session.userId, parsed.data)
    revalidatePath('/admin')
    return { ok: true, data: { id: building.id } }
  } catch (error) {
    return failed(error)
  }
}

export async function updateBuildingAction(
  buildingId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  const parsedId = uuid.safeParse(buildingId)
  if (!parsedId.success) return { ok: false, error: 'Unknown building.' }

  const parsed = updateBuildingSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const building = await getBuilding(buildingId)
    const session = await assertPermission('building.edit', { orgId: building.org_id })
    await updateBuilding(session.userId, buildingId, parsed.data)
    revalidatePath('/admin')
    revalidatePath(`/admin/buildings/${buildingId}`)
    return { ok: true, data: null }
  } catch (error) {
    return failed(error)
  }
}

export async function archiveBuildingAction(
  buildingId: string,
): Promise<ActionResult<null>> {
  try {
    const building = await getBuilding(buildingId)
    const session = await assertPermission('building.archive', { orgId: building.org_id })
    await archiveBuilding(session.userId, buildingId)
    revalidatePath('/admin')
    return { ok: true, data: null }
  } catch (error) {
    return failed(error)
  }
}

// ---------------------------------------------------------------------------
// Flats
// ---------------------------------------------------------------------------

/** A flat's permissions live with the building that contains it. */
async function permissionForFlatsIn(
  buildingId: string,
  permission: 'flat.create' | 'flat.edit' | 'flat.archive' | 'landlord_rent.manage',
) {
  const building = await getBuilding(buildingId)
  return assertPermission(permission, { orgId: building.org_id })
}

export async function createFlatAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createFlatSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await permissionForFlatsIn(parsed.data.buildingId, 'flat.create')
    const flat = await createFlat(session.userId, parsed.data)
    revalidatePath(`/admin/buildings/${parsed.data.buildingId}`)
    revalidatePath('/admin/flats')
    return { ok: true, data: { id: flat.id } }
  } catch (error) {
    return failed(error)
  }
}

export async function updateFlatAction(
  flatId: string,
  buildingId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = updateFlatSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await permissionForFlatsIn(buildingId, 'flat.edit')
    await updateFlat(session.userId, flatId, parsed.data)
    revalidatePath(`/admin/buildings/${buildingId}`)
    revalidatePath('/admin/flats')
    return { ok: true, data: null }
  } catch (error) {
    return failed(error)
  }
}

export async function archiveFlatAction(
  flatId: string,
  buildingId: string,
): Promise<ActionResult<null>> {
  try {
    const session = await permissionForFlatsIn(buildingId, 'flat.archive')
    await archiveFlat(session.userId, flatId)
    revalidatePath(`/admin/buildings/${buildingId}`)
    revalidatePath('/admin/flats')
    return { ok: true, data: null }
  } catch (error) {
    return failed(error)
  }
}

export async function bulkCreateFlatsAction(
  input: unknown,
): Promise<ActionResult<{ created: number; skipped: string[] }>> {
  const parsed = bulkFlatsSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await permissionForFlatsIn(parsed.data.buildingId, 'flat.create')
    const result = await bulkCreateFlats(
      session.userId,
      parsed.data.buildingId,
      {
        fromFloor: parsed.data.fromFloor,
        toFloor: parsed.data.toFloor,
        unitsPerFloor: parsed.data.unitsPerFloor,
        floorStyle: parsed.data.floorStyle,
        unitStyle: parsed.data.unitStyle,
        skipFloors: parsed.data.skipFloors,
      },
      { monthlyRent: parsed.data.monthlyRent, rentDueDay: parsed.data.rentDueDay },
    )
    revalidatePath(`/admin/buildings/${parsed.data.buildingId}`)
    return { ok: true, data: result }
  } catch (error) {
    return failed(error)
  }
}

// ---------------------------------------------------------------------------
// Landlord rent
// ---------------------------------------------------------------------------
export async function recordLandlordRentAction(
  buildingId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = landlordRentSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  try {
    const session = await permissionForFlatsIn(buildingId, 'landlord_rent.manage')
    await recordLandlordRent(session.userId, parsed.data)
    revalidatePath(`/admin/buildings/${buildingId}`)
    return { ok: true, data: null }
  } catch (error) {
    return failed(error)
  }
}
