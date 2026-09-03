import 'server-only'

import { createAdminSupabase } from '@/lib/supabase/admin'
import { createServerSupabase } from '@/lib/supabase/server'
import { toAppError } from '@/lib/errors'
import { sendEmail, renderEmail } from '@/lib/messaging/email'
import { sendSms } from '@/lib/messaging/sms'
import {
  channelsFor,
  channelsNow,
  dedupeKey,
  EVENTS,
  nextSendableTime,
  render,
  type Channel,
  type EventKey,
  type Preference,
} from '@/lib/notifications'
import type { NotificationRow } from '@/types'

/**
 * Sending things to people.
 *
 * One entry point — `notify()` — that every other service calls. It resolves
 * the person's preferences, writes the in-app row, and hands the noisy
 * channels to the transports.
 *
 * Two rules run through all of it:
 *
 *   - **Nothing sends twice.** A dedupe key on the notification row makes the
 *     database refuse a repeat, so an hourly reminder job, a retried webhook
 *     and a refreshed page all produce one message.
 *   - **A failed send never fails the action.** Confirming a payment must not
 *     roll back because an SMS gateway timed out.
 */

export type NotifyInput = {
  userId: string
  event: EventKey
  data?: Record<string, string>
  /** What the notification is about — a due, a request, a visit. */
  subjectId?: string
  link?: string
  orgId?: string
  /** Set to make the message repeatable per day rather than once ever. */
  dedupeOn?: 'day' | 'subject' | 'none'
}

const today = () => new Date().toISOString().slice(0, 10)

async function loadPreference(
  userId: string,
  event: EventKey,
): Promise<Partial<Preference> | null> {
  const admin = createAdminSupabase()
  const category = `category:${EVENTS[event].category}`

  const { data } = await admin
    .from('notification_preferences')
    .select('event, in_app, email, sms, push')
    .eq('user_id', userId)
    .in('event', [event, category])

  if (!data?.length) return null

  // A preference set on the exact event beats one set on its category.
  const specific = data.find((row) => row.event === event)
  const broad = data.find((row) => row.event === category)
  const chosen = specific ?? broad

  return chosen
    ? { in_app: chosen.in_app, email: chosen.email, sms: chosen.sms, push: chosen.push }
    : null
}

/**
 * Sends one notification.
 *
 * Returns quietly when the message has already been sent — the caller does
 * not need to know, and treating a duplicate as an error would make every
 * retry look like a failure.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const admin = createAdminSupabase()
  const data = input.data ?? {}

  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('email, phone, phone_verified_at, full_name')
      .eq('id', input.userId)
      .maybeSingle()

    if (!profile) return

    const preference = await loadPreference(input.userId, input.event)
    const wanted = channelsFor(input.event, preference, {
      email: Boolean(profile.email),
      phone: Boolean(profile.phone && profile.phone_verified_at),
    })

    const now = new Date()
    const { send, hold } = channelsNow(input.event, wanted, now)
    const message = render(input.event, data)

    const key =
      input.dedupeOn === 'none'
        ? null
        : input.dedupeOn === 'subject'
          ? dedupeKey(input.event, input.userId, input.subjectId ?? '', 'once')
          : dedupeKey(input.event, input.userId, input.subjectId ?? '', today())

    const { data: notification, error } = await admin
      .from('notifications')
      .insert({
        user_id: input.userId,
        org_id: input.orgId ?? null,
        event: input.event,
        title: message.title,
        body: message.body,
        link: input.link ?? null,
        channel: 'in_app',
        subject_id: input.subjectId ?? null,
        dedupe_key: key,
        send_after: hold.length > 0 ? nextSendableTime(now).toISOString() : null,
        data,
      })
      .select('id')
      .maybeSingle()

    // 23505 is the dedupe index: this exact message has already gone out.
    if (error) {
      if ((error as { code?: string }).code !== '23505') {
        console.error('[notify] could not write notification', error.message)
      }
      return
    }

    await Promise.all(
      send
        .filter((channel) => channel !== 'in_app' && channel !== 'push')
        .map((channel) =>
          deliver({
            channel,
            userId: input.userId,
            notificationId: notification?.id ?? null,
            event: input.event,
            to: { email: profile.email, phone: profile.phone },
            message,
            link: input.link,
          }),
        ),
    )
  } catch (error) {
    // Never let a notification failure take down the thing that caused it.
    console.error('[notify] failed', error)
  }
}

/** Sends to many people at once — an owner list, a flat's residents. */
export async function notifyMany(
  userIds: string[],
  input: Omit<NotifyInput, 'userId'>,
): Promise<void> {
  await Promise.all([...new Set(userIds)].map((userId) => notify({ ...input, userId })))
}

type DeliverInput = {
  channel: Channel
  userId: string
  notificationId: string | null
  event: EventKey
  to: { email: string | null; phone: string | null }
  message: { title: string; body: string; sms: string | null }
  link?: string
}

/** One send, and a row in `message_deliveries` saying what happened. */
async function deliver(input: DeliverInput): Promise<void> {
  const admin = createAdminSupabase()

  const result =
    input.channel === 'email' && input.to.email
      ? await sendEmail({
          to: input.to.email,
          subject: input.message.title,
          ...renderEmail({
            title: input.message.title,
            body: input.message.body,
            actionLabel: 'Open HouseControl',
            actionUrl: input.link ?? '/dashboard',
          }),
        })
      : input.channel === 'sms' && input.to.phone && input.message.sms
        ? await sendSms({ to: input.to.phone, message: input.message.sms })
        : { status: 'skipped' as const, reason: 'no destination for this channel' }

  await admin.from('message_deliveries').insert({
    channel: input.channel,
    user_id: input.userId,
    notification_id: input.notificationId,
    to_email: input.channel === 'email' ? input.to.email : null,
    to_phone: input.channel === 'sms' ? input.to.phone : null,
    template: input.event,
    status:
      result.status === 'sent'
        ? 'sent'
        : result.status === 'skipped'
          ? 'skipped'
          : 'failed',
    provider_id: result.status === 'sent' ? result.providerId : null,
    error:
      result.status === 'failed'
        ? result.error
        : result.status === 'skipped'
          ? result.reason
          : null,
    attempts: 1,
    last_attempt_at: new Date().toISOString(),
    sent_at: result.status === 'sent' ? new Date().toISOString() : null,
  })
}

// ---------------------------------------------------------------------------
// Reading, for the bell
// ---------------------------------------------------------------------------

export async function listNotifications(limit = 30): Promise<NotificationRow[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw toAppError(error)
  return data
}

export async function unreadCount(): Promise<number> {
  const supabase = createServerSupabase()
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)

  return count ?? 0
}

export async function markRead(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('id', notificationIds)
    .is('read_at', null)

  if (error) throw toAppError(error)
}

export async function markAllRead(): Promise<void> {
  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)

  if (error) throw toAppError(error)
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export type PreferenceRow = { event: string } & Preference

export async function listPreferences(): Promise<PreferenceRow[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('event, in_app, email, sms, push')

  if (error) throw toAppError(error)
  return data as PreferenceRow[]
}

/** Saves one category's settings. In-app is always on and is not stored as off. */
export async function savePreference(
  userId: string,
  event: string,
  preference: Preference,
): Promise<void> {
  const supabase = createServerSupabase()

  const { error } = await supabase.from('notification_preferences').upsert(
    {
      user_id: userId,
      event,
      in_app: true,
      email: preference.email,
      sms: preference.sms,
      push: preference.push,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,event' },
  )

  if (error) throw toAppError(error)
}
