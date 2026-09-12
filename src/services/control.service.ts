import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { toAppError, notFound } from '@/lib/errors'
import { listFlatsWithCounts, type FlatWithCounts } from './flats.service'
import { listRecentVisits } from './visitors.service'
import { periodOf, todayInDhaka } from '@/lib/billing'
import { latenessOf, type Lateness } from '@/lib/utils'

/**
 * Everything the control panel shows, in as few round trips as it takes.
 *
 * The panel exists to answer one question at a glance — which flats have paid
 * and which have not — so the flats are keyed by their rent state for the month
 * rather than by occupancy. A flat can be occupied and still owe five weeks of
 * rent, and colouring by occupancy hides exactly the thing the owner opened the
 * page to see.
 *
 * RLS scopes every query, so an admin sees their organisation's buildings and a
 * moderator sees only buildings holding flats they run. No role check here.
 */

export type RentState =
  'paid' | 'partial' | 'due' | 'late' | 'overdue' | 'unbilled' | 'vacant'

export type ControlFlat = FlatWithCounts & {
  rentState: RentState
  billed: number
  paid: number
  dueDate: string | null
}

export type ControlBuilding = {
  id: string
  name: string
  addressLine: string | null
  area: string | null
  city: string | null
}

export type ControlSnapshot = {
  building: ControlBuilding
  period: string
  flats: ControlFlat[]
  billed: number
  collected: number
  gate: Array<{
    id: string
    name: string
    unit: string | null
    at: string | null
    state: string
  }>
}

/** Buildings the signed-in person can act on, newest first. */
export async function listControlBuildings(): Promise<ControlBuilding[]> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('buildings')
    .select('id, name, address_line, area, city')
    .is('archived_at', null)
    .order('name')

  if (error) throw toAppError(error)

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    addressLine: row.address_line,
    area: row.area,
    city: row.city,
  }))
}

function stateFor(
  flat: FlatWithCounts,
  charge: { billed: number; paid: number; dueDate: string | null } | undefined,
  period: string,
  today: string,
): RentState {
  if (flat.occupancy_status !== 'occupied') return 'vacant'
  if (!charge || charge.billed <= 0) return 'unbilled'

  const outstanding = Math.round((charge.billed - charge.paid) * 100) / 100

  if (outstanding <= 0) return 'paid'

  if (!charge.dueDate) return 'due'

  const lateness: Lateness = latenessOf({ dueDate: charge.dueDate, period, today })

  // Something part-paid but overdue is still overdue; the red matters more than
  // the fact that a little came in.
  if (lateness === 'overdue') return 'overdue'
  if (charge.paid > 0) return 'partial'
  if (lateness === 'late') return 'late'

  return 'due'
}

export async function getControlSnapshot(
  buildingId: string,
  period: string = periodOf(),
): Promise<ControlSnapshot> {
  const supabase = createServerSupabase()

  const { data: building, error } = await supabase
    .from('buildings')
    .select('id, name, address_line, area, city')
    .eq('id', buildingId)
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!building) throw notFound('That building')

  const flats = await listFlatsWithCounts(buildingId).catch(() => [])
  const flatIds = flats.map((flat) => flat.id)

  const [{ data: dues }, gate] = await Promise.all([
    flatIds.length
      ? supabase
          .from('dues')
          .select('flat_id, amount, amount_paid, due_date')
          .in('flat_id', flatIds)
          .eq('period', period)
      : Promise.resolve({ data: [] as never[] }),
    listRecentVisits(buildingId, 40).catch(() => []),
  ])

  // Several charges can land on one flat in a month — rent, a utility share, a
  // penalty. The tile reflects the flat's whole month, not just its rent.
  const byFlat = new Map<
    string,
    { billed: number; paid: number; dueDate: string | null }
  >()

  for (const due of dues ?? []) {
    const current = byFlat.get(due.flat_id) ?? { billed: 0, paid: 0, dueDate: null }

    current.billed += Number(due.amount)
    current.paid += Number(due.amount_paid)

    // The earliest date is the one that decides how late the flat is.
    if (!current.dueDate || due.due_date < current.dueDate) {
      current.dueDate = due.due_date
    }

    byFlat.set(due.flat_id, current)
  }

  const today = todayInDhaka()

  const decorated: ControlFlat[] = flats.map((flat) => {
    const charge = byFlat.get(flat.id)

    return {
      ...flat,
      rentState: stateFor(flat, charge, period, today),
      billed: charge?.billed ?? 0,
      paid: charge?.paid ?? 0,
      dueDate: charge?.dueDate ?? null,
    }
  })

  const billed = decorated.reduce((sum, flat) => sum + flat.billed, 0)
  const collected = decorated.reduce((sum, flat) => sum + flat.paid, 0)

  const startOfToday = `${today}T00:00:00`

  return {
    building: {
      id: building.id,
      name: building.name,
      addressLine: building.address_line,
      area: building.area,
      city: building.city,
    },
    period,
    flats: decorated,
    billed,
    collected,
    gate: gate
      .filter((visit) => (visit.entered_at ?? visit.created_at) >= startOfToday)
      .slice(0, 6)
      .map((visit) => ({
        id: visit.id,
        name: visit.full_name,
        unit: visit.unitNumber,
        at: visit.entered_at ?? visit.expected_at ?? visit.created_at,
        state: visit.state,
      })),
  }
}
