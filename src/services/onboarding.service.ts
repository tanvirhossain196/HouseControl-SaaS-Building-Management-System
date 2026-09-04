import 'server-only'

import { createAdminSupabase } from '@/lib/supabase/admin'
import { AppError, conflict, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { planUnits, type BulkPlan } from '@/lib/units'

/**
 * Setting up a building for the first time.
 *
 * This is the one flow that cannot run as the signed-in user. Creating the
 * organization is fine — the RLS policy lets someone insert an organization
 * they own — but the row that makes them its admin lives in `org_members`,
 * and the policy there requires already being an admin of that organization.
 * Nobody can be the first member of their own organization under that rule,
 * so the whole thing runs with the service role instead, in one place, with
 * the ownership check written out rather than inherited.
 *
 * Until Phase 15 this was a paragraph in the README telling people to run
 * three inserts by hand. That was a gap, not a design.
 */

export type SetupInput = {
  organisationName: string
  buildingName: string
  addressLine: string
  area?: string
  city: string
  floorsCount: number
  /** Optional: generate the units straight away. */
  units?: {
    fromFloor: number
    toFloor: number
    unitsPerFloor: number
    floorStyle: BulkPlan['floorStyle']
    unitStyle: BulkPlan['unitStyle']
    monthlyRent: number
    rentDueDay: number
  }
}

export type SetupResult = {
  orgId: string
  buildingId: string
  unitsCreated: number
}

/** `Karim Properties` → `karim-properties`, with a suffix if that is taken. */
async function uniqueSlug(name: string): Promise<string> {
  const admin = createAdminSupabase()

  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'building'

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`

    const { data } = await admin
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (!data) return slug
  }

  throw new AppError('conflict', 'Could not find a free name. Try a different one.')
}

export async function setUpFirstBuilding(
  userId: string,
  input: SetupInput,
): Promise<SetupResult> {
  const admin = createAdminSupabase()

  // One organization per person through this flow. A second building goes on
  // the existing organization; a genuinely separate one is a support request,
  // because it changes who can see what.
  const { data: existing } = await admin
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .eq('status', 'active')
    .maybeSingle()

  if (existing) {
    throw conflict('You already own an organization. Add the building to it instead.')
  }

  const slug = await uniqueSlug(input.organisationName)

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: input.organisationName, slug, owner_id: userId })
    .select('id')
    .single()

  if (orgError) throw toAppError(orgError)

  // Everything after this point can leave a half-built organization if it
  // fails, so each step cleans up behind itself rather than leaving the
  // person with an account they cannot use or repeat.
  const rollback = async () => {
    await admin.from('organizations').delete().eq('id', org.id)
  }

  try {
    const { error: planError } = await admin.from('subscriptions').insert({
      org_id: org.id,
      plan: 'free',
      unit_limit: 12,
      building_limit: 1,
    })
    if (planError) throw planError

    const { error: memberError } = await admin.from('org_members').insert({
      org_id: org.id,
      user_id: userId,
      role: 'admin',
    })
    if (memberError) throw memberError

    const { data: building, error: buildingError } = await admin
      .from('buildings')
      .insert({
        org_id: org.id,
        name: input.buildingName,
        address_line: input.addressLine,
        area: input.area ?? null,
        city: input.city,
        floors_count: input.floorsCount,
        created_by: userId,
      })
      .select('id')
      .single()

    if (buildingError) throw buildingError

    let unitsCreated = 0

    if (input.units) {
      const planned = planUnits({
        fromFloor: input.units.fromFloor,
        toFloor: input.units.toFloor,
        unitsPerFloor: input.units.unitsPerFloor,
        floorStyle: input.units.floorStyle,
        unitStyle: input.units.unitStyle,
      })

      // The Free plan covers twelve units. Generating more here would create
      // a building the owner cannot use, so it stops at the limit and says so
      // on the next screen instead of failing the whole setup.
      const allowed = planned.slice(0, 12)

      if (allowed.length > 0) {
        const { error: flatError } = await admin.from('flats').insert(
          allowed.map((unit) => ({
            building_id: building.id,
            unit_number: unit.unitNumber,
            floor: unit.floor,
            monthly_rent: input.units!.monthlyRent,
            rent_due_day: input.units!.rentDueDay,
            occupancy_status: 'vacant' as const,
          })),
        )

        if (flatError) throw flatError
        unitsCreated = allowed.length
      }
    }

    await writeAuditLog({
      orgId: org.id,
      actorId: userId,
      action: 'organization.created',
      entityType: 'organization',
      entityId: org.id,
      after: { name: input.organisationName, building: input.buildingName, unitsCreated },
    })

    return { orgId: org.id, buildingId: building.id, unitsCreated }
  } catch (error) {
    await rollback()
    throw toAppError(error)
  }
}
