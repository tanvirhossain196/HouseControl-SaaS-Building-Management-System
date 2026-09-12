import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import type {
  DueStatus,
  FlatVisibilitySettingsRow,
  MembershipStatus,
} from '@/types'

type MembershipRow = {
  flat_id: string
  role: 'moderator' | 'resident'
  rent_share: number
  status: MembershipStatus
}

type FlatWithBuildingRow = {
  id: string
  unit_number: string
  floor: number | null
  monthly_rent: number
  rent_due_day: number
  buildings: {
    id: string
    name: string
    area: string | null
  } | null
}

type ProfileRow = {
  id: string
  full_name: string
  email: string
  phone: string | null
}

type DueSummaryRow = {
  user_id: string | null
  amount: number
  amount_paid: number
  due_date: string
  status: DueStatus
}

export type MemberPaymentStatus = 'paid' | 'partial' | 'due' | 'none'

export type MyFlatMember = {
  id: string
  userId: string
  name: string
  email: string
  phone: string | null
  roomNumber: string
  role: 'resident' | 'moderator'
  rentShare: number
  status: 'active' | 'suspended'
  outstanding: number
  paidAmount: number
  dueDate: string | null
  paymentStatus: MemberPaymentStatus
}

export type MyFlatVisibility = {
  showMemberPhone: boolean
  showMemberRent: boolean
  showPaymentStatus: boolean
  showDueDate: boolean
  showMemberList: boolean
  showModeratorPhone: boolean
}

export type MyFlat = {
  id: string
  unit_number: string
  floor: number | null
  monthly_rent: number
  rent_due_day: number
  building: {
    id: string
    name: string
    area: string | null
  } | null
  role: 'resident' | 'moderator'
  ownRentShare: number
  members: MyFlatMember[]
  moderator: MyFlatMember | null
  activeResidents: MyFlatMember[]
  visibility: MyFlatVisibility
}

const defaultVisibility: MyFlatVisibility = {
  showMemberPhone: true,
  showMemberRent: true,
  showPaymentStatus: true,
  showDueDate: true,
  showMemberList: true,
  showModeratorPhone: true,
}

function normalizeVisibility(
  row: FlatVisibilitySettingsRow | null | undefined,
): MyFlatVisibility {
  return {
    showMemberPhone: row?.show_member_phone ?? true,
    showMemberRent: row?.show_member_rent ?? true,
    showPaymentStatus: row?.show_payment_status ?? true,
    showDueDate: row?.show_due_date ?? true,
    showMemberList: row?.show_member_list ?? true,
    showModeratorPhone: row?.show_moderator_phone ?? true,
  }
}

function paymentStatus(
  amount: number,
  amountPaid: number,
): MemberPaymentStatus {
  if (amount <= 0 && amountPaid <= 0) return 'none'
  if (amountPaid >= amount) return 'paid'
  if (amountPaid > 0) return 'partial'
  return 'due'
}

function buildDueSummary(rows: DueSummaryRow[]) {
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.amount), 0)
  const totalPaid = rows.reduce(
    (sum, row) => sum + Number(row.amount_paid),
    0,
  )

  const dueDate =
    rows
      .map((row) => row.due_date)
      .filter(Boolean)
      .sort()[0] ?? null

  return {
    amount: totalAmount,
    paid: totalPaid,
    dueDate,
    status: paymentStatus(totalAmount, totalPaid),
  }
}

async function loadFlatMembers(
  flatId: string,
  unitNumber: string,
  supabase: ReturnType<typeof createServerSupabase>,
): Promise<MyFlatMember[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('flat_members')
    .select('id, user_id, role, rent_share, status')
    .eq('flat_id', flatId)
    .in('status', ['active', 'suspended'])
    .order('role', { ascending: true })

  if (membershipError || !memberships || memberships.length === 0) {
    return []
  }

  const typedMemberships = memberships as unknown as Array<{
    id: string
    user_id: string
    role: 'moderator' | 'resident'
    rent_share: number
    status: MembershipStatus
  }>

  const userIds = typedMemberships.map((membership) => membership.user_id)

  const [{ data: profiles }, { data: dues }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .in('id', userIds),

    supabase
      .from('dues')
      .select('user_id, amount, amount_paid, due_date, status')
      .eq('flat_id', flatId)
      .in('user_id', userIds)
      .order('due_date', { ascending: true }),
  ])

  const typedProfiles = (profiles ?? []) as unknown as ProfileRow[]
  const typedDues = (dues ?? []) as unknown as DueSummaryRow[]

  return typedMemberships.map((membership) => {
    const profile = typedProfiles.find(
      (item) => item.id === membership.user_id,
    )

    const memberDues = typedDues.filter(
      (due) => due.user_id === membership.user_id,
    )

    const summary = buildDueSummary(memberDues)

    return {
      id: membership.id,
      userId: membership.user_id,
      name: profile?.full_name ?? 'Unknown resident',
      email: profile?.email ?? '',
      phone: profile?.phone ?? null,
      roomNumber: unitNumber,
      role: membership.role,
      rentShare: Number(membership.rent_share ?? 0),
      status: membership.status === 'active' ? 'active' : 'suspended',
      outstanding: Math.max(0, summary.amount - summary.paid),
      paidAmount: summary.paid,
      dueDate: summary.dueDate,
      paymentStatus: summary.status,
    }
  })
}

export async function getMyFlat(userId: string): Promise<MyFlat[]> {
  const supabase = createServerSupabase()

  const { data: memberships, error: membershipError } = await supabase
    .from('flat_members')
    .select('flat_id, role, rent_share, status')
    .eq('user_id', userId)
    .in('status', ['active', 'suspended'])

  if (membershipError || !memberships || memberships.length === 0) {
    return []
  }

  const typedMemberships = memberships as unknown as MembershipRow[]
  const flatIds = [
    ...new Set(typedMemberships.map((membership) => membership.flat_id)),
  ]

  const { data: flats, error: flatsError } = await supabase
    .from('flats')
    .select(
      `
        id,
        unit_number,
        floor,
        monthly_rent,
        rent_due_day,
        buildings(
          id,
          name,
          area
        )
      `,
    )
    .in('id', flatIds)
    .is('archived_at', null)

  if (flatsError || !flats) {
    return []
  }

  const typedFlats = flats as unknown as FlatWithBuildingRow[]

  const results = await Promise.all(
    typedFlats.map(async (flat) => {
      const currentMembership = typedMemberships.find(
        (membership) => membership.flat_id === flat.id,
      )

      const currentRole: MyFlat['role'] =
  currentMembership?.role === 'moderator'
    ? 'moderator'
    : 'resident'

      const [{ data: settings }, members] = await Promise.all([
        supabase
          .from('flat_visibility_settings')
          .select(
            `
              flat_id,
              show_member_phone,
              show_member_rent,
              show_payment_status,
              show_due_date,
              show_member_list,
              show_moderator_phone,
              updated_by,
              created_at,
              updated_at
            `,
          )
          .eq('flat_id', flat.id)
          .maybeSingle(),

        loadFlatMembers(flat.id, flat.unit_number, supabase),
      ])

      const visibility = normalizeVisibility(
        settings as unknown as FlatVisibilitySettingsRow | null,
      )

      const ownMember =
        members.find((member) => member.userId === userId) ?? null

      const moderator =
        members.find((member) => member.role === 'moderator') ?? null

      const activeResidents = members.filter(
        (member) =>
          member.role === 'resident' && member.status === 'active',
      )

      const canSeeEverything = currentRole === 'moderator'

      const visibleMembers = members.map((member) => {
        const isSelf = member.userId === userId
        const isModerator = member.role === 'moderator'

        return {
          ...member,

          phone:
            canSeeEverything ||
            isSelf ||
            (isModerator
              ? visibility.showModeratorPhone
              : visibility.showMemberPhone)
              ? member.phone
              : null,

          rentShare:
            canSeeEverything ||
            isSelf ||
            visibility.showMemberRent
              ? member.rentShare
              : 0,

          outstanding:
            canSeeEverything ||
            isSelf ||
            visibility.showPaymentStatus
              ? member.outstanding
              : 0,

          paidAmount:
            canSeeEverything ||
            isSelf ||
            visibility.showPaymentStatus
              ? member.paidAmount
              : 0,

          paymentStatus:
            canSeeEverything ||
            isSelf ||
            visibility.showPaymentStatus
              ? member.paymentStatus
              : 'none',

          dueDate:
            canSeeEverything ||
            isSelf ||
            visibility.showDueDate
              ? member.dueDate
              : null,
        }
      })

      const finalMembers =
        canSeeEverything || visibility.showMemberList
          ? visibleMembers
          : visibleMembers.filter((member) => member.userId === userId)

      const finalModerator =
        moderator && (canSeeEverything || visibility.showMemberList)
          ? {
              ...moderator,
              phone:
                canSeeEverything || visibility.showModeratorPhone
                  ? moderator.phone
                  : null,
              rentShare:
                canSeeEverything || visibility.showMemberRent
                  ? moderator.rentShare
                  : 0,
              outstanding:
                canSeeEverything || visibility.showPaymentStatus
                  ? moderator.outstanding
                  : 0,
              paidAmount:
                canSeeEverything || visibility.showPaymentStatus
                  ? moderator.paidAmount
                  : 0,
              paymentStatus:
                canSeeEverything || visibility.showPaymentStatus
                  ? moderator.paymentStatus
                  : 'none',
              dueDate:
                canSeeEverything || visibility.showDueDate
                  ? moderator.dueDate
                  : null,
            }
          : null

      const finalResidents =
        canSeeEverything || visibility.showMemberList
          ? finalMembers.filter(
              (member) =>
                member.role === 'resident' &&
                member.status === 'active',
            )
          : []

      return {
        id: flat.id,
        unit_number: flat.unit_number,
        floor: flat.floor,
        monthly_rent: Number(flat.monthly_rent),
        rent_due_day: flat.rent_due_day,

        building: flat.buildings
          ? {
              id: flat.buildings.id,
              name: flat.buildings.name,
              area: flat.buildings.area,
            }
          : null,

        role: currentRole,

        ownRentShare: Number(ownMember?.rentShare ?? 0),

        members: finalMembers,
        moderator: finalModerator,
        activeResidents: finalResidents,

        visibility: canSeeEverything
          ? visibility
          : visibility ?? defaultVisibility,
      }
    }),
  )

  return results
}