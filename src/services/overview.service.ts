import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import type { DueRow, PaymentRow } from '@/types'

/**
 * The numbers each dashboard opens with.
 *
 * Every query here runs as the signed-in user, so RLS decides what is counted
 * — an owner's totals cover their organization, a moderator's cover their
 * flat, and neither can widen the query by asking differently.
 *
 * All of it is wrapped in `safely()`: a dashboard with a missing number is
 * worth more than an error page, and Phase 4 runs before most of this data
 * exists.
 */

async function safely<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work()
  } catch (error) {
    console.error('[overview]', error)
    return fallback
  }
}

const periodStart = () => {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10)
}

const today = () => new Date().toISOString().slice(0, 10)

export type OwnerOverview = {
  buildings: number
  flats: number
  occupied: number
  residents: number
  billed: number
  collected: number
  overdueCount: number
  pendingPayments: number
  openRequests: number
}

export async function getOwnerOverview(orgId: string | null): Promise<OwnerOverview> {
  const empty: OwnerOverview = {
    buildings: 0,
    flats: 0,
    occupied: 0,
    residents: 0,
    billed: 0,
    collected: 0,
    overdueCount: 0,
    pendingPayments: 0,
    openRequests: 0,
  }
  if (!orgId) return empty

  return safely(async () => {
    const supabase = createServerSupabase()

    const { data: buildings } = await supabase
      .from('buildings')
      .select('id')
      .eq('org_id', orgId)
      .is('archived_at', null)

    const buildingIds = (buildings ?? []).map((b) => b.id)
    if (buildingIds.length === 0) return { ...empty }

    const { data: flats } = await supabase
      .from('flats')
      .select('id, occupancy_status')
      .in('building_id', buildingIds)
      .is('archived_at', null)

    const flatIds = (flats ?? []).map((f) => f.id)

    const [duesResult, residentsResult, paymentsResult, requestsResult] =
      await Promise.all([
        supabase
          .from('dues')
          .select('amount, amount_paid, due_date, status')
          .in(
            'flat_id',
            flatIds.length ? flatIds : ['00000000-0000-0000-0000-000000000000'],
          )
          .eq('period', periodStart()),
        supabase
          .from('flat_members')
          .select('id', { count: 'exact', head: true })
          .in(
            'flat_id',
            flatIds.length ? flatIds : ['00000000-0000-0000-0000-000000000000'],
          )
          .eq('status', 'active'),
        supabase
          .from('payments')
          .select('id', { count: 'exact', head: true })
          .in(
            'flat_id',
            flatIds.length ? flatIds : ['00000000-0000-0000-0000-000000000000'],
          )
          .eq('status', 'pending'),
        supabase
          .from('maintenance_requests')
          .select('id', { count: 'exact', head: true })
          .in('building_id', buildingIds)
          .in('status', ['open', 'in_progress']),
      ])

    const dues = duesResult.data ?? []
    const now = today()

    return {
      buildings: buildingIds.length,
      flats: flatIds.length,
      occupied: (flats ?? []).filter((f) => f.occupancy_status === 'occupied').length,
      residents: residentsResult.count ?? 0,
      billed: dues.reduce((sum, d) => sum + Number(d.amount), 0),
      collected: dues.reduce((sum, d) => sum + Number(d.amount_paid), 0),
      overdueCount: dues.filter((d) => d.status !== 'paid' && d.due_date < now).length,
      pendingPayments: paymentsResult.count ?? 0,
      openRequests: requestsResult.count ?? 0,
    }
  }, empty)
}

export type ModeratorOverview = {
  flats: number
  residents: number
  billed: number
  collected: number
  pendingPayments: PaymentRow[]
  overdue: DueRow[]
}

export async function getModeratorOverview(
  flatIds: string[],
): Promise<ModeratorOverview> {
  const empty: ModeratorOverview = {
    flats: flatIds.length,
    residents: 0,
    billed: 0,
    collected: 0,
    pendingPayments: [],
    overdue: [],
  }
  if (flatIds.length === 0) return empty

  return safely(async () => {
    const supabase = createServerSupabase()

    const [duesResult, membersResult, pendingResult, overdueResult] = await Promise.all([
      supabase
        .from('dues')
        .select('amount, amount_paid')
        .in('flat_id', flatIds)
        .eq('period', periodStart()),
      supabase
        .from('flat_members')
        .select('id', { count: 'exact', head: true })
        .in('flat_id', flatIds)
        .eq('status', 'active'),
      supabase
        .from('payments')
        .select('*')
        .in('flat_id', flatIds)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(5),
      supabase
        .from('dues')
        .select('*')
        .in('flat_id', flatIds)
        .in('status', ['open', 'partially_paid'])
        .lt('due_date', today())
        .order('due_date', { ascending: true })
        .limit(5),
    ])

    const dues = duesResult.data ?? []

    return {
      flats: flatIds.length,
      residents: membersResult.count ?? 0,
      billed: dues.reduce((sum, d) => sum + Number(d.amount), 0),
      collected: dues.reduce((sum, d) => sum + Number(d.amount_paid), 0),
      pendingPayments: pendingResult.data ?? [],
      overdue: overdueResult.data ?? [],
    }
  }, empty)
}

export type ResidentOverview = {
  outstanding: number
  nextDue: DueRow | null
  openDues: DueRow[]
  recentPayments: PaymentRow[]
}

export async function getResidentOverview(userId: string): Promise<ResidentOverview> {
  const empty: ResidentOverview = {
    outstanding: 0,
    nextDue: null,
    openDues: [],
    recentPayments: [],
  }

  return safely(async () => {
    const supabase = createServerSupabase()

    const [duesResult, paymentsResult] = await Promise.all([
      supabase
        .from('dues')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['open', 'partially_paid'])
        .order('due_date', { ascending: true }),
      supabase
        .from('payments')
        .select('*')
        .eq('paid_by', userId)
        .order('paid_at', { ascending: false })
        .limit(5),
    ])

    const openDues = duesResult.data ?? []

    return {
      outstanding: openDues.reduce(
        (sum, d) => sum + (Number(d.amount) - Number(d.amount_paid)),
        0,
      ),
      nextDue: openDues[0] ?? null,
      openDues,
      recentPayments: paymentsResult.data ?? [],
    }
  }, empty)
}

export type GateOverview = {
  inside: number
  todayEntries: number
  buildingId: string | null
  buildingName: string | null
}

export async function getGateOverview(orgId: string | null): Promise<GateOverview> {
  const empty: GateOverview = {
    inside: 0,
    todayEntries: 0,
    buildingId: null,
    buildingName: null,
  }
  if (!orgId) return empty

  return safely(async () => {
    const supabase = createServerSupabase()

    const { data: building } = await supabase
      .from('buildings')
      .select('id, name')
      .eq('org_id', orgId)
      .is('archived_at', null)
      .order('name')
      .limit(1)
      .maybeSingle()

    if (!building) return empty

    const startOfDay = `${today()}T00:00:00.000Z`

    const [insideResult, todayResult] = await Promise.all([
      supabase
        .from('visitors')
        .select('id', { count: 'exact', head: true })
        .eq('building_id', building.id)
        .eq('state', 'inside'),
      supabase
        .from('visitors')
        .select('id', { count: 'exact', head: true })
        .eq('building_id', building.id)
        .gte('entered_at', startOfDay),
    ])

    return {
      inside: insideResult.count ?? 0,
      todayEntries: todayResult.count ?? 0,
      buildingId: building.id,
      buildingName: building.name,
    }
  }, empty)
}
