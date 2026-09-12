import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import type { Session } from '@/lib/auth/session'

/**
 * The flats whose payments this person may confirm or reject.
 *
 * A moderator covers the flats they run. An organization admin covers every
 * flat in every building they own, whether or not they moderate any of them —
 * somebody has to be able to review a payment when a moderator is unreachable.
 *
 * It lived inside the payments page until the handovers page needed the same
 * answer. Two copies of "who may review this" is one copy too many: the day
 * they disagree, one screen shows a payment the other refuses to accept.
 */
export async function reviewableFlatIds(session: Session): Promise<string[]> {
  const moderated = session.memberships.flats
    .filter((flat) => flat.role === 'moderator')
    .map((flat) => flat.flatId)

  const adminOrgs = session.memberships.orgs
    .filter((org) => org.role === 'admin')
    .map((org) => org.orgId)

  if (adminOrgs.length === 0) {
    return moderated
  }

  const supabase = createServerSupabase()

  const { data: buildings } = await supabase
    .from('buildings')
    .select('id')
    .in('org_id', adminOrgs)
    .is('archived_at', null)

  const buildingIds = (buildings ?? []).map((building) => building.id)

  if (buildingIds.length === 0) {
    return moderated
  }

  const { data: flats } = await supabase
    .from('flats')
    .select('id')
    .in('building_id', buildingIds)
    .is('archived_at', null)

  return [...new Set([...moderated, ...(flats ?? []).map((flat) => flat.id)])]
}

export type ReviewScopeFlat = { id: string; unitNumber: string }

export type ReviewScopeBuilding = {
  id: string
  name: string
  flats: ReviewScopeFlat[]
}

/**
 * The buildings and flats this person may review payments for.
 *
 * Read from the property tables rather than derived from whatever happens to be
 * in the queue. A building with no pending payments still belongs on the filter
 * row — its absence would otherwise read as "no such building" rather than
 * "nothing waiting here", and those are different answers to different
 * questions.
 *
 * Flats come back even when empty for the same reason: clicking a building and
 * seeing nothing at all leaves you unsure whether the building has no flats or
 * the page failed.
 */
export async function listReviewScope(session: Session): Promise<ReviewScopeBuilding[]> {
  const flatIds = await reviewableFlatIds(session)
  const supabase = createServerSupabase()

  const adminOrgs = session.memberships.orgs
    .filter((org) => org.role === 'admin')
    .map((org) => org.orgId)

  /**
   * An admin sees every building they own. A moderator sees only the buildings
   * holding flats they run — reached through those flats, since they have no
   * claim on the building itself.
   */
  const buildingQuery = supabase
    .from('buildings')
    .select('id, name')
    .is('archived_at', null)
    .order('name')

  const { data: buildings } = adminOrgs.length
    ? await buildingQuery.in('org_id', adminOrgs)
    : { data: [] as Array<{ id: string; name: string }> }

  const { data: flats } = flatIds.length
    ? await supabase
        .from('flats')
        .select('id, unit_number, building_id, floor')
        .in('id', flatIds)
        .is('archived_at', null)
        .order('floor')
        .order('unit_number')
    : { data: [] as never[] }

  const rows = flats ?? []
  const known = new Map<string, ReviewScopeBuilding>()

  for (const building of buildings ?? []) {
    known.set(building.id, { id: building.id, name: building.name, flats: [] })
  }

  // A moderator's building is not in the list above, so add it from its flats.
  const missing = [
    ...new Set(rows.map((flat) => flat.building_id).filter((id) => !known.has(id))),
  ]

  if (missing.length > 0) {
    const { data: extra } = await supabase
      .from('buildings')
      .select('id, name')
      .in('id', missing)

    for (const building of extra ?? []) {
      known.set(building.id, { id: building.id, name: building.name, flats: [] })
    }
  }

  for (const flat of rows) {
    known.get(flat.building_id)?.flats.push({ id: flat.id, unitNumber: flat.unit_number })
  }

  return [...known.values()].sort((a, b) => a.name.localeCompare(b.name))
}