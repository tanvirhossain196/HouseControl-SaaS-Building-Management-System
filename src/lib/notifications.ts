/**
 * What we send, to whom, and down which channel.
 *
 * One catalogue rather than message strings scattered through the services:
 * a person's preferences are stored per event key, so the keys have to be
 * stable and knowable in one place, and the "should this wake someone up at
 * 3am" decision has to be made somewhere it can be tested.
 *
 * `npm run test:notifications` covers it.
 */

export type Channel = 'in_app' | 'email' | 'sms' | 'push'

export type EventKey =
  // money
  | 'due.raised'
  | 'due.reminder'
  | 'due.overdue'
  | 'payment.submitted'
  | 'payment.confirmed'
  | 'payment.rejected'
  // people
  | 'invite.received'
  | 'resident.joined'
  | 'resident.removed'
  | 'moderator.transfer_code'
  | 'moderator.transfer_offered'
  | 'moderator.transfer_accepted'
  | 'moderator.transfer_rolled_back'
  // gate
  | 'visitor.arrived'
  | 'visitor.preapproved_arrived'
  | 'visitor.denied'
  // repairs
  | 'maintenance.reported'
  | 'maintenance.status_changed'
  | 'maintenance.resolved'
  // account
  | 'account.password_changed'

export type Category = 'money' | 'people' | 'gate' | 'repairs' | 'account'

export type EventDefinition = {
  category: Category
  /** What the person sees in the list and in the subject line. */
  title: (data: Record<string, string>) => string
  body: (data: Record<string, string>) => string
  /** Under 160 characters, because SMS is billed per segment. */
  sms?: (data: Record<string, string>) => string
  /** Channels used when the person has expressed no preference. */
  defaults: Channel[]
  /**
   * Sent immediately regardless of quiet hours. Reserved for things where a
   * delay is worse than a disturbance.
   */
  urgent?: boolean
  /** Cannot be turned off. Security and money-movement facts. */
  mandatory?: boolean
}

const taka = (data: Record<string, string>) => data.amount ?? '0'

export const EVENTS: Record<EventKey, EventDefinition> = {
  'due.raised': {
    category: 'money',
    title: (d) => `${d.description ?? 'A charge'} — ৳${taka(d)}`,
    body: (d) => `Due ${d.dueDate ?? 'soon'} for flat ${d.unit ?? ''}.`.trim(),
    defaults: ['in_app', 'email'],
  },
  'due.reminder': {
    category: 'money',
    title: (d) => `Rent due in ${d.days ?? '3'} days`,
    body: (d) => `৳${taka(d)} for ${d.description ?? 'rent'}, due ${d.dueDate ?? ''}.`,
    sms: (d) =>
      `HouseControl: BDT ${taka(d)} due ${d.dueDate ?? 'soon'} for flat ${d.unit ?? ''}.`,
    defaults: ['in_app', 'email'],
  },
  'due.overdue': {
    category: 'money',
    title: (d) =>
      `${d.description ?? 'A charge'} is ${d.days ?? ''} days overdue`.replace('  ', ' '),
    body: (d) => `৳${taka(d)} is still outstanding for flat ${d.unit ?? ''}.`,
    sms: (d) =>
      `HouseControl: BDT ${taka(d)} for flat ${d.unit ?? ''} is overdue. Please settle it.`,
    defaults: ['in_app', 'email', 'sms'],
  },
  'payment.submitted': {
    category: 'money',
    title: (d) => `${d.payer ?? 'A resident'} recorded ৳${taka(d)}`,
    body: (d) => `Flat ${d.unit ?? ''} — confirm it when the money has arrived.`,
    defaults: ['in_app', 'email'],
  },
  'payment.confirmed': {
    category: 'money',
    title: (d) => `Payment confirmed — ৳${taka(d)}`,
    body: (d) => `Receipt ${d.receipt ?? ''}. Your balance is updated.`,
    sms: (d) => `HouseControl: BDT ${taka(d)} received. Receipt ${d.receipt ?? ''}.`,
    defaults: ['in_app', 'email'],
    mandatory: true,
  },
  'payment.rejected': {
    category: 'money',
    title: () => 'A payment was not confirmed',
    body: (d) =>
      `৳${taka(d)}: ${d.reason ?? 'no reason given'}. You can submit it again.`,
    defaults: ['in_app', 'email'],
    mandatory: true,
  },
  'invite.received': {
    category: 'people',
    title: (d) => `You have been invited to ${d.building ?? 'a building'}`,
    body: (d) =>
      `As ${d.role ?? 'a resident'}. The link works once and expires in seven days.`,
    defaults: ['in_app', 'email'],
  },
  'resident.joined': {
    category: 'people',
    title: (d) => `${d.name ?? 'Someone'} joined flat ${d.unit ?? ''}`,
    body: (d) => `Their share of the rent is ৳${taka(d)}.`,
    defaults: ['in_app'],
  },
  'resident.removed': {
    category: 'people',
    title: (d) => `${d.name ?? 'Someone'} left flat ${d.unit ?? ''}`,
    body: (d) => d.reason ?? 'Their share has been reassigned.',
    defaults: ['in_app'],
  },
  'moderator.transfer_code': {
    category: 'people',
    title: (d) => `Handover code for flat ${d.unit ?? ''}`,
    body: (d) =>
      `Your code is ${d.code ?? ''}. It expires in 10 minutes. If you did not start a handover, tell the building owner.`,
    sms: (d) =>
      `HouseControl: your handover code is ${d.code ?? ''}. Expires in 10 minutes.`,
    defaults: ['sms', 'in_app'],
    urgent: true,
    mandatory: true,
  },
  'moderator.transfer_offered': {
    category: 'people',
    title: (d) => `You have been asked to moderate flat ${d.unit ?? ''}`,
    body: () =>
      'Accepting makes you responsible for this flat’s rent, dues and residents.',
    defaults: ['in_app', 'email'],
    mandatory: true,
  },
  'moderator.transfer_accepted': {
    category: 'people',
    title: (d) => `Flat ${d.unit ?? ''} has a new moderator`,
    body: (d) =>
      `${d.name ?? 'Someone'} took the role. You can undo this for seven days.`,
    defaults: ['in_app', 'email'],
    mandatory: true,
  },
  'moderator.transfer_rolled_back': {
    category: 'people',
    title: () => 'A moderator handover was undone',
    body: (d) => d.reason ?? 'The previous moderator has the role again.',
    defaults: ['in_app', 'email'],
    mandatory: true,
  },
  'visitor.arrived': {
    category: 'gate',
    title: (d) => `${d.name ?? 'Someone'} is at the gate`,
    body: (d) => `${d.purpose ?? 'Visiting'} — flat ${d.unit ?? ''}.`,
    sms: (d) =>
      `HouseControl: ${d.name ?? 'a visitor'} is at the gate for flat ${d.unit ?? ''}.`,
    defaults: ['in_app', 'push'],
    urgent: true,
  },
  'visitor.preapproved_arrived': {
    category: 'gate',
    title: (d) => `${d.name ?? 'Your guest'} has arrived`,
    body: () => 'They used the code you sent and have been let in.',
    defaults: ['in_app', 'push'],
    urgent: true,
  },
  'visitor.denied': {
    category: 'gate',
    title: (d) => `${d.name ?? 'Someone'} was turned away`,
    body: (d) => d.reason ?? 'The guard did not let them in.',
    defaults: ['in_app'],
  },
  'maintenance.reported': {
    category: 'repairs',
    title: (d) => `${d.reference ?? 'A problem'} — ${d.title ?? 'reported'}`,
    body: (d) => `${d.priority ?? 'Normal'} priority, flat ${d.unit ?? 'building'}.`,
    defaults: ['in_app', 'email'],
  },
  'maintenance.status_changed': {
    category: 'repairs',
    title: (d) => `${d.reference ?? 'Your report'} is now ${d.status ?? 'updated'}`,
    body: (d) => d.note ?? 'Open it to see what has happened.',
    defaults: ['in_app'],
  },
  'maintenance.resolved': {
    category: 'repairs',
    title: (d) => `${d.reference ?? 'Your report'} has been resolved`,
    body: (d) => d.resolution ?? 'Tell us if it comes back.',
    defaults: ['in_app', 'email'],
  },
  'account.password_changed': {
    category: 'account',
    title: () => 'Your password was changed',
    body: () => 'If this was not you, reset it immediately and tell the building owner.',
    defaults: ['in_app', 'email'],
    urgent: true,
    mandatory: true,
  },
}

export const CATEGORY_LABELS: Record<Category, string> = {
  money: 'Rent and payments',
  people: 'Residents and roles',
  gate: 'The gate',
  repairs: 'Complaints and repairs',
  account: 'Account and security',
}

export type Preference = {
  in_app: boolean
  email: boolean
  sms: boolean
  push: boolean
}

/**
 * Which channels to use for one event and one person.
 *
 * A stored preference wins over the defaults, except for mandatory events:
 * "your payment was confirmed" and "your password changed" are facts a person
 * needs whether or not they have muted the category. In-app is never removed
 * — the bell is the record, and silencing it would lose the history.
 */
export function channelsFor(
  event: EventKey,
  preference: Partial<Preference> | null,
  available: { email: boolean; phone: boolean } = { email: true, phone: false },
): Channel[] {
  const definition = EVENTS[event]
  const chosen = new Set<Channel>(definition.defaults)

  if (preference) {
    for (const channel of ['in_app', 'email', 'sms', 'push'] as Channel[]) {
      const wanted = preference[channel]
      if (wanted === true) chosen.add(channel)
      if (wanted === false && !definition.mandatory) chosen.delete(channel)
    }
  }

  chosen.add('in_app')

  if (!available.email) chosen.delete('email')
  if (!available.phone) chosen.delete('sms')
  // SMS costs money per message, so it is only ever used where the catalogue
  // has written a short version.
  if (!definition.sms) chosen.delete('sms')

  return [...chosen]
}

/** Between these hours, only urgent messages go out by SMS or push. */
export const QUIET_START_HOUR = 22
export const QUIET_END_HOUR = 8

const DHAKA_OFFSET_MINUTES = 6 * 60

/** The hour it is in Dhaka, whatever the server thinks. */
export function dhakaHour(now: Date = new Date()): number {
  return new Date(now.getTime() + DHAKA_OFFSET_MINUTES * 60_000).getUTCHours()
}

export function inQuietHours(now: Date = new Date()): boolean {
  const hour = dhakaHour(now)
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR
}

/**
 * Filters the channels down to what may be sent right now.
 *
 * A rent reminder at 3am is a reason to uninstall. A visitor at the gate at
 * 3am is exactly when you want to know, so `urgent` events pass through.
 * In-app and email always pass: neither makes a phone ring.
 */
export function channelsNow(
  event: EventKey,
  channels: Channel[],
  now: Date = new Date(),
): { send: Channel[]; hold: Channel[] } {
  if (EVENTS[event].urgent || !inQuietHours(now)) return { send: channels, hold: [] }

  const noisy = new Set<Channel>(['sms', 'push'])
  return {
    send: channels.filter((channel) => !noisy.has(channel)),
    hold: channels.filter((channel) => noisy.has(channel)),
  }
}

/** When a held message should go out: the start of the next waking hour. */
export function nextSendableTime(now: Date = new Date()): Date {
  const dhaka = new Date(now.getTime() + DHAKA_OFFSET_MINUTES * 60_000)
  const target = new Date(dhaka)

  if (dhaka.getUTCHours() >= QUIET_START_HOUR) target.setUTCDate(target.getUTCDate() + 1)
  target.setUTCHours(QUIET_END_HOUR, 0, 0, 0)

  return new Date(target.getTime() - DHAKA_OFFSET_MINUTES * 60_000)
}

/**
 * The key that stops the same message being sent twice.
 *
 * A reminder job that runs hourly, a webhook the provider retries, a page
 * someone refreshes: all of them ask to notify again. The key is the event,
 * the person, the thing it is about, and the day — so a reminder can repeat
 * tomorrow but not this afternoon.
 */
export function dedupeKey(
  event: EventKey,
  userId: string,
  subjectId: string,
  day: string,
): string {
  return `${event}:${userId}:${subjectId}:${day}`
}

export type RenderedMessage = { title: string; body: string; sms: string | null }

export function render(event: EventKey, data: Record<string, string>): RenderedMessage {
  const definition = EVENTS[event]
  return {
    title: definition.title(data),
    body: definition.body(data),
    sms: definition.sms ? definition.sms(data).slice(0, 160) : null,
  }
}

/** Groups a list for the digest email: newest first, by category. */
export function groupForDigest<T extends { event: EventKey; createdAt: string }>(
  items: T[],
): { category: Category; label: string; items: T[] }[] {
  const groups = new Map<Category, T[]>()

  for (const item of items) {
    const category = EVENTS[item.event]?.category ?? 'account'
    groups.set(category, [...(groups.get(category) ?? []), item])
  }

  return [...groups.entries()]
    .map(([category, group]) => ({
      category,
      label: CATEGORY_LABELS[category],
      items: group.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    }))
    .sort((a, b) => b.items.length - a.items.length)
}
