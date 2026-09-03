/**
 * Complaints and repairs: reference numbers, response targets, and which
 * status change is allowed to follow which.
 *
 * The state machine is here rather than scattered through the UI because the
 * awkward transitions are the ones that matter — reopening something already
 * resolved, cancelling something a plumber is standing in front of — and they
 * should be decided in one place that can be tested.
 *
 * `npm run test:maintenance` covers it.
 */

export type MaintenanceStatus = 'open' | 'in_progress' | 'resolved' | 'cancelled'
export type MaintenancePriority = 'low' | 'normal' | 'high' | 'urgent'

export const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  open: 'Open',
  in_progress: 'Being fixed',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
}

export const PRIORITY_LABELS: Record<MaintenancePriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
}

/**
 * How long the building has to respond, by priority.
 *
 * "Urgent" means water is coming through a ceiling or the lift has someone in
 * it; four hours is a promise a caretaker can keep. Anything longer than a
 * week stops being a target anyone reads.
 */
export const RESPONSE_HOURS: Record<MaintenancePriority, number> = {
  urgent: 4,
  high: 24,
  normal: 72,
  low: 168,
}

/** Order for a list screen: worst first, then oldest. */
export const PRIORITY_RANK: Record<MaintenancePriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

/**
 * Reference numbers are per building and never reused: MR-0001, MR-0002.
 *
 * A resident calls the caretaker and says "the lift one, MR-0007". That only
 * works if the number is short, spoken easily, and unique in the building
 * rather than across the platform.
 */
export function maintenanceReference(sequence: number): string {
  return `MR-${String(Math.max(1, Math.trunc(sequence))).padStart(4, '0')}`
}

export function parseReference(reference: string): number | null {
  const match = /^MR-(\d{4,})$/.exec(reference.trim().toUpperCase())
  if (!match) return null
  const value = Number(match[1])
  return value > 0 ? value : null
}

/** The next reference for a building, given the highest one it already has. */
export function nextReference(existing: string[]): string {
  const highest = existing.reduce((max, reference) => {
    const value = parseReference(reference)
    return value && value > max ? value : max
  }, 0)

  return maintenanceReference(highest + 1)
}

/**
 * Which transitions are allowed.
 *
 * Resolved is not final: things come back. Reopening produces a new event on
 * the same request rather than a second request, so the history shows the
 * tap was fixed twice — which is the thing an owner needs to see before
 * paying the same plumber again.
 *
 * Cancelled is final. A cancelled request that could be revived would let
 * somebody quietly resurrect a complaint after it was withdrawn.
 */
const TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  open: ['in_progress', 'resolved', 'cancelled'],
  in_progress: ['resolved', 'open', 'cancelled'],
  resolved: ['open'],
  cancelled: [],
}

export function canTransition(from: MaintenanceStatus, to: MaintenanceStatus): boolean {
  if (from === to) return false
  return TRANSITIONS[from].includes(to)
}

export function allowedTransitions(from: MaintenanceStatus): MaintenanceStatus[] {
  return [...TRANSITIONS[from]]
}

/** When a response is due, from when it was reported. */
export function responseDueAt(
  priority: MaintenancePriority,
  reportedAt: string | Date,
): string {
  const start = typeof reportedAt === 'string' ? new Date(reportedAt) : reportedAt
  return new Date(start.getTime() + RESPONSE_HOURS[priority] * 3_600_000).toISOString()
}

export type SlaState = 'met' | 'due_soon' | 'breached' | 'closed'

/**
 * Whether the building is keeping its promise on one request.
 *
 * A resolved or cancelled request is closed and no longer counts against
 * anyone — including one resolved late, because a target that keeps punishing
 * you after the work is done stops being useful.
 */
export function slaState(
  request: {
    status: MaintenanceStatus
    priority: MaintenancePriority
    createdAt: string
  },
  now: Date = new Date(),
): SlaState {
  if (request.status === 'resolved' || request.status === 'cancelled') return 'closed'

  const due = new Date(responseDueAt(request.priority, request.createdAt)).getTime()
  const remaining = due - now.getTime()

  if (remaining <= 0) return 'breached'
  if (remaining <= RESPONSE_HOURS[request.priority] * 3_600_000 * 0.25) return 'due_soon'
  return 'met'
}

/** "2 days ago", "4h ago", "just now" — how long a complaint has been sitting. */
export function ageOf(createdAt: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(createdAt).getTime()) / 60_000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`

  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

export type SortableRequest = {
  status: MaintenanceStatus
  priority: MaintenancePriority
  createdAt: string
}

/**
 * The order a caretaker should work through them: open before closed, urgent
 * before low, and within a priority the one that has waited longest first.
 */
export function compareRequests(a: SortableRequest, b: SortableRequest): number {
  const closed = (request: SortableRequest) =>
    request.status === 'resolved' || request.status === 'cancelled' ? 1 : 0

  if (closed(a) !== closed(b)) return closed(a) - closed(b)
  if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  }
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}
