import 'server-only'

import { normalisePhone } from '@/lib/gate'

/**
 * SMS.
 *
 * Bangladeshi buildings use local aggregators — SSL Wireless, Banglalink,
 * Robi — and each has its own HTTP shape. The interface is one function and
 * one env-var-driven adapter, so switching provider is a change here and
 * nowhere else.
 *
 * Every message costs money and lands on a phone, so the notification service
 * only calls this for events whose catalogue entry has written a short form.
 */

export type SmsResult =
  | { status: 'sent'; providerId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string }

export async function sendSms(input: {
  to: string
  message: string
}): Promise<SmsResult> {
  const endpoint = process.env.SMS_API_URL
  const apiKey = process.env.SMS_API_KEY
  const senderId = process.env.SMS_SENDER_ID ?? 'HouseCtrl'

  const to = normalisePhone(input.to)
  if (!to) return { status: 'skipped', reason: 'not a valid Bangladeshi mobile number' }

  // Trimmed to one segment. Two segments is two charges, and the catalogue
  // already writes these short.
  const message = input.message.slice(0, 160)

  if (!endpoint || !apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[sms] would send to ${to}: ${message}`)
    }
    return { status: 'skipped', reason: 'SMS_API_URL or SMS_API_KEY is not set' }
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ to, message, sender_id: senderId }),
      cache: 'no-store',
    })

    const payload = (await response.json().catch(() => ({}))) as {
      message_id?: string
      error?: string
    }

    if (!response.ok) {
      return { status: 'failed', error: payload.error ?? `HTTP ${response.status}` }
    }

    return { status: 'sent', providerId: payload.message_id ?? '' }
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'send failed',
    }
  }
}
