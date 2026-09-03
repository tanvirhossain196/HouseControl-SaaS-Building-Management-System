import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { AppError, conflict, forbidden, notFound, toAppError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import { periodOf } from '@/lib/billing'
import {
  canTransition,
  compareRequests,
  nextReference,
  type MaintenancePriority,
  type MaintenanceStatus,
} from '@/lib/maintenance'
import type { ExpenseCategory, MaintenanceRow } from '@/types'

/**
 * Complaints and repairs.
 *
 * The rules that matter are about who may close what. A resident reports a
 * problem, adds to it and can withdraw it; only the person who did the work
 * marks it resolved. RLS enforces the same split, so a complaint closed by
 * the complainant is not possible from either direction.
 */

export type MaintenanceWithContext = MaintenanceRow & {
  reporterName: string | null
  assigneeName: string | null
  unitNumber: string | null
  buildingName: string | null
  scheduled_for: string | null
  resolved_by: string | null
  cost: number | null
  expense_id: string | null
  reopened_count: number
}

const WITH_CONTEXT =
  '*, reporter:profiles!maintenance_requests_reported_by_fkey(full_name), assignee:profiles!maintenance_requests_assigned_to_fkey(full_name), flats(unit_number), buildings(name)'

function decorate(rows: unknown[]): MaintenanceWithContext[] {
  const requests = rows as (MaintenanceWithContext & {
    reporter: { full_name: string } | null
    assignee: { full_name: string } | null
    flats: { unit_number: string } | null
    buildings: { name: string } | null
  })[]

  return requests.map((request) => ({
    ...request,
    reporterName: request.reporter?.full_name ?? null,
    assigneeName: request.assignee?.full_name ?? null,
    unitNumber: request.flats?.unit_number ?? null,
    buildingName: request.buildings?.name ?? null,
  }))
}

const sortable = (request: MaintenanceWithContext) => ({
  status: request.status as MaintenanceStatus,
  priority: request.priority as MaintenancePriority,
  createdAt: request.created_at,
})

/**
 * Everything the caller can see, worst first.
 *
 * There is no flat or building filter here on purpose: RLS already decides
 * the rows, so a resident's query returns their own, a moderator's their
 * flat's, and an owner's the whole building's. One function, three answers.
 */
export async function listRequests(limit = 100): Promise<MaintenanceWithContext[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('maintenance_requests')
    .select(WITH_CONTEXT)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw toAppError(error)

  return decorate(data ?? []).sort((a, b) => compareRequests(sortable(a), sortable(b)))
}

export async function getRequest(requestId: string): Promise<MaintenanceWithContext> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('maintenance_requests')
    .select(WITH_CONTEXT)
    .eq('id', requestId)
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw notFound('That request')

  return decorate([data])[0]!
}

export type TimelineEntry = {
  id: string
  kind: 'status' | 'note'
  fromStatus: MaintenanceStatus | null
  toStatus: MaintenanceStatus | null
  note: string | null
  actorName: string | null
  createdAt: string
}

/** Status changes and notes in one order — the whole story of the request. */
export async function listTimeline(requestId: string): Promise<TimelineEntry[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('maintenance_events')
    .select('id, kind, from_status, to_status, note, created_at, profiles(full_name)')
    .eq('request_id', requestId)
    .order('created_at', { ascending: true })

  if (error) throw toAppError(error)

  const rows = (data ?? []) as unknown as {
    id: string
    kind: 'status' | 'note'
    from_status: MaintenanceStatus | null
    to_status: MaintenanceStatus | null
    note: string | null
    created_at: string
    profiles: { full_name: string } | null
  }[]

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    note: row.note,
    actorName: row.profiles?.full_name ?? null,
    createdAt: row.created_at,
  }))
}

export type CreateRequestInput = {
  buildingId: string
  flatId?: string
  title: string
  description: string
  category: ExpenseCategory
  priority: MaintenancePriority
  photoUrls?: string[]
}

/**
 * Reports a problem.
 *
 * The reference is per building and read aloud on the phone — "the lift one,
 * MR-0007" — so it is allocated from the building's existing numbers rather
 * than a global sequence. A race between two people reporting at once fails
 * on the unique index and retries.
 */
export async function createRequest(
  userId: string,
  input: CreateRequestInput,
): Promise<MaintenanceRow> {
  const supabase = createServerSupabase()

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: existing } = await supabase
      .from('maintenance_requests')
      .select('reference')
      .eq('building_id', input.buildingId)
      .order('created_at', { ascending: false })
      .limit(200)

    const reference = nextReference((existing ?? []).map((row) => row.reference))

    const { data, error } = await supabase
      .from('maintenance_requests')
      .insert({
        building_id: input.buildingId,
        flat_id: input.flatId ?? null,
        reference,
        title: input.title,
        description: input.description,
        category: input.category,
        priority: input.priority,
        status: 'open',
        photo_urls: input.photoUrls ?? [],
        reported_by: userId,
      })
      .select('*')
      .single()

    if (!error && data) {
      await writeAuditLog({
        actorId: userId,
        action: 'maintenance.reported',
        entityType: 'maintenance',
        entityId: data.id,
        after: { reference, title: data.title, priority: data.priority },
      })
      return data
    }

    // 23505 is the reference collision; anything else is a real failure.
    if ((error as { code?: string } | null)?.code !== '23505') throw toAppError(error)
  }

  throw new AppError('conflict', 'Could not allocate a reference number. Try again.')
}

/** Adds a note to the thread. Anyone who can see the request can do this. */
export async function addNote(
  userId: string,
  requestId: string,
  note: string,
): Promise<void> {
  const supabase = createServerSupabase()

  const { error } = await supabase.from('maintenance_events').insert({
    request_id: requestId,
    kind: 'note',
    to_status: 'open',
    note,
    actor_id: userId,
  })

  if (error) throw toAppError(error)
}

export type StatusChangeInput = {
  requestId: string
  status: MaintenanceStatus
  note?: string
  /** Only meaningful when resolving. */
  resolution?: string
  cost?: number
  assignTo?: string | null
  scheduledFor?: string | null
}

/**
 * Moves a request along.
 *
 * The transition itself is checked against the state machine in
 * `lib/maintenance.ts`, so "resolve a cancelled request" is refused here
 * rather than producing a confusing timeline. Reopening bumps a counter: a
 * tap fixed three times is a different conversation from three taps.
 */
export async function changeStatus(
  actorId: string,
  input: StatusChangeInput,
): Promise<MaintenanceWithContext> {
  const supabase = createServerSupabase()
  const request = await getRequest(input.requestId)
  const from = request.status as MaintenanceStatus

  if (!canTransition(from, input.status)) {
    throw conflict(
      from === 'cancelled'
        ? 'A cancelled request cannot be reopened. Report it again if it is still a problem.'
        : `A request that is ${from.replace('_', ' ')} cannot be marked ${input.status.replace('_', ' ')}.`,
    )
  }

  if (input.status === 'resolved' && !input.resolution?.trim()) {
    throw new AppError('validation_failed', 'Say what was done to fix it.')
  }

  const reopening = from === 'resolved' && input.status === 'open'

  const { data, error } = await supabase
    .from('maintenance_requests')
    .update({
      status: input.status,
      ...(input.assignTo !== undefined && { assigned_to: input.assignTo }),
      ...(input.scheduledFor !== undefined && { scheduled_for: input.scheduledFor }),
      ...(input.status === 'resolved' && {
        resolved_at: new Date().toISOString(),
        resolved_by: actorId,
        resolution: input.resolution,
        cost: input.cost ?? null,
      }),
      ...(reopening && {
        resolved_at: null,
        resolved_by: null,
        reopened_count: request.reopened_count + 1,
      }),
    })
    .eq('id', input.requestId)
    .eq('status', from)
    .select('id')
    .maybeSingle()

  if (error) throw toAppError(error)
  if (!data) throw conflict('Somebody else changed this request a moment ago.')

  if (input.note?.trim()) {
    await addNote(actorId, input.requestId, input.note)
  }

  // A repair with a cost becomes a building expense, so the money and the
  // work stay attached to each other.
  if (input.status === 'resolved' && input.cost && input.cost > 0) {
    await recordRepairCost(actorId, request, input.cost)
  }

  await writeAuditLog({
    actorId,
    action: reopening ? 'maintenance.reopened' : `maintenance.${input.status}`,
    entityType: 'maintenance',
    entityId: input.requestId,
    before: { status: from },
    after: { status: input.status, cost: input.cost ?? null },
  })

  return getRequest(input.requestId)
}

/** Creates the expense for a paid repair and links it back to the request. */
async function recordRepairCost(
  actorId: string,
  request: MaintenanceWithContext,
  cost: number,
): Promise<void> {
  const supabase = createServerSupabase()

  const { data: expense, error } = await supabase
    .from('expenses')
    .insert({
      building_id: request.building_id,
      flat_id: request.flat_id,
      scope: request.flat_id ? 'flat' : 'building',
      category: request.category,
      title: `${request.reference} — ${request.title}`,
      amount: cost,
      period: periodOf(),
      split_method: 'equal',
      created_by: actorId,
    })
    .select('id')
    .single()

  // A failed expense must not undo a completed repair; the work is done
  // either way, and the owner can add the cost by hand.
  if (error) {
    console.error('[maintenance] could not record repair cost', error.message)
    return
  }

  await supabase
    .from('maintenance_requests')
    .update({ expense_id: expense.id })
    .eq('id', request.id)
}

/** The reporter withdrawing their own complaint. */
export async function cancelOwnRequest(
  userId: string,
  requestId: string,
  reason: string,
): Promise<void> {
  const supabase = createServerSupabase()
  const request = await getRequest(requestId)

  if (request.reported_by !== userId) {
    throw forbidden('Only the person who reported this can withdraw it.')
  }
  if (request.status === 'resolved' || request.status === 'cancelled') {
    throw conflict('This request is already closed.')
  }

  const { error } = await supabase
    .from('maintenance_requests')
    .update({ status: 'cancelled' })
    .eq('id', requestId)

  if (error) throw toAppError(error)

  await addNote(userId, requestId, `Withdrawn: ${reason}`)

  await writeAuditLog({
    actorId: userId,
    action: 'maintenance.withdrawn',
    entityType: 'maintenance',
    entityId: requestId,
    after: { reason },
  })
}

/** Who a request can be assigned to: the people who work this building. */
export async function listAssignees(
  buildingId: string,
): Promise<{ userId: string; fullName: string; role: string }[]> {
  const admin = createAdminSupabase()

  const { data: building } = await admin
    .from('buildings')
    .select('org_id')
    .eq('id', buildingId)
    .maybeSingle()

  if (!building) return []

  const { data } = await admin
    .from('org_members')
    .select('user_id, role, profiles(full_name)')
    .eq('org_id', building.org_id)
    .eq('status', 'active')

  const rows = (data ?? []) as unknown as {
    user_id: string
    role: string
    profiles: { full_name: string } | null
  }[]

  return rows.map((row) => ({
    userId: row.user_id,
    fullName: row.profiles?.full_name ?? 'Someone',
    role: row.role,
  }))
}
