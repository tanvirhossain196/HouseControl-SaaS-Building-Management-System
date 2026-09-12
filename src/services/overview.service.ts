import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import type {
  DueRow,
  NotificationRow,
  PaymentRow,
} from '@/types'

async function safely<T>(
  work: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await work()
  } catch (error) {
    console.error('[overview]', error)
    return fallback
  }
}

const periodStart = () => {
  const now = new Date()

  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )
    .toISOString()
    .slice(0, 10)
}

const today = () => {
  return new Date().toISOString().slice(0, 10)
}

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

export async function getOwnerOverview(
  orgId: string | null,
): Promise<OwnerOverview> {
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

  if (!orgId) {
    return empty
  }

  return safely(async () => {
    const supabase = createServerSupabase()

    const { data: buildings, error: buildingsError } = await supabase
      .from('buildings')
      .select('id')
      .eq('org_id', orgId)
      .is('archived_at', null)

    if (buildingsError) {
      throw buildingsError
    }

    const buildingIds = (buildings ?? []).map((building) => building.id)

    if (buildingIds.length === 0) {
      return empty
    }

    const { data: flats, error: flatsError } = await supabase
      .from('flats')
      .select('id, occupancy_status')
      .in('building_id', buildingIds)
      .is('archived_at', null)

    if (flatsError) {
      throw flatsError
    }

    const flatIds = (flats ?? []).map((flat) => flat.id)
    const safeFlatIds = flatIds.length
      ? flatIds
      : ['00000000-0000-0000-0000-000000000000']

    const [
      duesResult,
      residentsResult,
      paymentsResult,
      requestsResult,
    ] = await Promise.all([
      supabase
        .from('dues')
        .select('amount, amount_paid, due_date, status')
        .in('flat_id', safeFlatIds)
        .eq('period', periodStart()),

      supabase
        .from('flat_members')
        .select('id', { count: 'exact', head: true })
        .in('flat_id', safeFlatIds)
        .eq('status', 'active'),

      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .in('flat_id', safeFlatIds)
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
      occupied: (flats ?? []).filter(
        (flat) => flat.occupancy_status === 'occupied',
      ).length,
      residents: residentsResult.count ?? 0,
      billed: dues.reduce(
        (sum, due) => sum + Number(due.amount),
        0,
      ),
      collected: dues.reduce(
        (sum, due) => sum + Number(due.amount_paid),
        0,
      ),
      overdueCount: dues.filter(
        (due) => due.status !== 'paid' && due.due_date < now,
      ).length,
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

  if (flatIds.length === 0) {
    return empty
  }

  return safely(async () => {
    const supabase = createServerSupabase()

    const [
      duesResult,
      membersResult,
      pendingResult,
      overdueResult,
    ] = await Promise.all([
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
      billed: dues.reduce(
        (sum, due) => sum + Number(due.amount),
        0,
      ),
      collected: dues.reduce(
        (sum, due) => sum + Number(due.amount_paid),
        0,
      ),
      pendingPayments: pendingResult.data ?? [],
      overdue: overdueResult.data ?? [],
    }
  }, empty)
}

export type ResidentFlatSummary = {
  id: string
  unitNumber: string
  buildingName: string
  monthlyRent: number
}

export type ResidentSummaryPerson = {
  id: string
  name: string
  email: string
  role: string
  rentShare: number
}

export type ResidentNotification = Pick<
  NotificationRow,
  'id' | 'title' | 'body' | 'link' | 'read_at' | 'created_at'
>

export type ResidentOverview = {
  outstanding: number
  nextDue: DueRow | null
  openDues: DueRow[]
  recentPayments: PaymentRow[]

  rentShare: number
  flat: ResidentFlatSummary | null
  moderator: ResidentSummaryPerson | null
  activeResidents: ResidentSummaryPerson[]
  notifications: ResidentNotification[]
}

export async function getResidentOverview(
  userId: string,
): Promise<ResidentOverview> {
  const empty: ResidentOverview = {
    outstanding: 0,
    nextDue: null,
    openDues: [],
    recentPayments: [],
    rentShare: 0,
    flat: null,
    moderator: null,
    activeResidents: [],
    notifications: [],
  }

  return safely(async () => {
    const supabase = createServerSupabase()

    const [
      duesResult,
      paymentsResult,
      membershipResult,
      notificationsResult,
    ] = await Promise.all([
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

      supabase
        .from('flat_members')
        .select('flat_id, rent_share')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle(),

      supabase
        .from('notifications')
        .select('id, title, body, link, read_at, created_at')
        .eq('user_id', userId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    const openDues = duesResult.data ?? []
    const membership = membershipResult.data
    const recentPayments = paymentsResult.data ?? []
    const notifications = notificationsResult.data ?? []

    let flat: ResidentFlatSummary | null = null
    let moderator: ResidentSummaryPerson | null = null
    let activeResidents: ResidentSummaryPerson[] = []

    if (membership?.flat_id) {
      const [
        flatResult,
        membersResult,
      ] = await Promise.all([
        supabase
          .from('flats')
          .select('id, unit_number, monthly_rent, building_id')
          .eq('id', membership.flat_id)
          .maybeSingle(),

        supabase
          .from('flat_members')
          .select('id, user_id, role, rent_share')
          .eq('flat_id', membership.flat_id)
          .eq('status', 'active')
          .order('joined_at', { ascending: true }),
      ])

      if (flatResult.data) {
        const { data: building } = await supabase
          .from('buildings')
          .select('name')
          .eq('id', flatResult.data.building_id)
          .maybeSingle()

        flat = {
          id: flatResult.data.id,
          unitNumber: flatResult.data.unit_number,
          buildingName: building?.name ?? 'Building',
          monthlyRent: Number(flatResult.data.monthly_rent),
        }
      }

      const memberRows = membersResult.data ?? []
      const memberUserIds = memberRows.map(
        (member) => member.user_id,
      )

      if (memberUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', memberUserIds)

        const profileMap = new Map(
          (profiles ?? []).map((profile) => [
            profile.id,
            profile,
          ]),
        )

        activeResidents = memberRows.map((member) => {
          const profile = profileMap.get(member.user_id)

          return {
            id: member.user_id,
            name: profile?.full_name ?? 'Resident',
            email: profile?.email ?? '',
            role: member.role,
            rentShare: Number(member.rent_share),
          }
        })

        moderator =
          activeResidents.find(
            (resident) => resident.role === 'moderator',
          ) ?? null
      }
    }

    return {
      outstanding: openDues.reduce(
        (sum, due) =>
          sum +
          (Number(due.amount) - Number(due.amount_paid)),
        0,
      ),
      nextDue: openDues[0] ?? null,
      openDues,
      recentPayments,
      rentShare: Number(membership?.rent_share ?? 0),
      flat,
      moderator,
      activeResidents,
      notifications,
    }
  }, empty)
}

export type GateOverview = {
  inside: number
  todayEntries: number
  buildingId: string | null
  buildingName: string | null
}

export async function getGateOverview(
  orgId: string | null,
): Promise<GateOverview> {
  const empty: GateOverview = {
    inside: 0,
    todayEntries: 0,
    buildingId: null,
    buildingName: null,
  }

  if (!orgId) {
    return empty
  }

  return safely(async () => {
    const supabase = createServerSupabase()

    const { data: building, error: buildingError } =
      await supabase
        .from('buildings')
        .select('id, name')
        .eq('org_id', orgId)
        .is('archived_at', null)
        .order('name')
        .limit(1)
        .maybeSingle()

    if (buildingError) {
      throw buildingError
    }

    if (!building) {
      return empty
    }

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