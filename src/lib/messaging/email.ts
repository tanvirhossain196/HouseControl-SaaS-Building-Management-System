import 'server-only'

import { site } from '@/lib/site'

/**
 * Email: your own SMTP first, Resend second.
 *
 * Deliberately small: one function that sends one message and reports what
 * happened. Retries, logging and preference resolution belong to the
 * notification service, not to the transport.
 *
 * SMTP is checked first on purpose. Sending from your own address is what
 * makes an invite look like it came from the building's owner rather than
 * from a service nobody has heard of, and it is what keeps the sending
 * reputation yours. Resend stays as the fallback for a deployment that has no
 * mail server.
 *
 * With neither configured it reports `skipped` rather than throwing, so a
 * development machine runs the whole app without a mail account.
 */

export type SendResult =
  | { status: 'sent'; providerId: string }
  | { status: 'skipped'; reason: string }
  | { status: 'failed'; error: string }

export async function sendEmail(input: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<SendResult> {
  if (process.env.SMTP_HOST) {
    return sendOverSmtp(input)
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? `${site.name} <no-reply@example.com>`

  if (!apiKey) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(`[email] would send "${input.subject}" to ${input.to}`)
    }
    return { status: 'skipped', reason: 'RESEND_API_KEY is not set' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      cache: 'no-store',
    })

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string
      message?: string
    }

    if (!response.ok) {
      return { status: 'failed', error: payload.message ?? `HTTP ${response.status}` }
    }

    return { status: 'sent', providerId: payload.id ?? '' }
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'send failed',
    }
  }
}

/**
 * The one email layout.
 *
 * Inline styles, a table-free single column, and no images: this has to
 * survive Gmail on an Android phone and a webmail client from 2011. The
 * plain-text version is not an afterthought — it is what SMS-style previews
 * and screen readers use.
 */
export function renderEmail(input: {
  title: string
  body: string
  actionLabel?: string
  actionUrl?: string
  footnote?: string
}): { html: string; text: string } {
  const url = input.actionUrl ? new URL(input.actionUrl, site.url).toString() : null

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;padding:24px;background:#f6f7fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#131a2b">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e0e4ee;border-radius:14px;padding:28px">
    <p style="margin:0 0 20px;font-size:15px;font-weight:600;letter-spacing:-0.01em">House<span style="color:#59627a">Control</span></p>
    <h1 style="margin:0 0 12px;font-size:19px;line-height:1.3;font-weight:600">${escapeHtml(input.title)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#59627a">${escapeHtml(input.body)}</p>
    ${
      url
        ? `<a href="${url}" style="display:inline-block;background:#2f4bd8;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:9px;font-size:14px;font-weight:500">${escapeHtml(input.actionLabel ?? 'Open HouseControl')}</a>`
        : ''
    }
    ${
      input.footnote
        ? `<p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#59627a">${escapeHtml(input.footnote)}</p>`
        : ''
    }
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;color:#59627a">
    Sent by ${escapeHtml(site.name)}. Change what you are emailed about in Settings → Notifications.
  </p>
</body></html>`

  const text = [
    input.title,
    '',
    input.body,
    url ? `\n${url}` : '',
    input.footnote ? `\n${input.footnote}` : '',
    '',
    'Change what you are emailed about in Settings → Notifications.',
  ]
    .filter(Boolean)
    .join('\n')

  return { html, text }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Sends through a plain SMTP server — Gmail, your hosting provider, anything
 * that speaks the protocol.
 *
 * The transport is created per send rather than kept alive. On a serverless
 * platform a pooled connection outlives the request that opened it and is
 * torn down mid-flight, which fails in a way that looks like the mail server
 * rejecting the message. One connection per email is slower and honest.
 */
async function sendOverSmtp(input: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<SendResult> {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASSWORD
  const from = process.env.EMAIL_FROM ?? user ?? `${site.name} <no-reply@example.com>`

  if (!host || !user || !pass) {
    return {
      status: 'skipped',
      reason: 'SMTP_HOST is set but SMTP_USER or SMTP_PASSWORD is not',
    }
  }

  try {
    const nodemailer = await import('nodemailer')
    const port = Number(process.env.SMTP_PORT ?? 587)

    const transport = nodemailer.createTransport({
      host,
      port,
      // 465 is implicit TLS; 587 starts plain and upgrades with STARTTLS.
      secure: port === 465,
      auth: { user, pass },
    })

    const result = await transport.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    })

    return { status: 'sent', providerId: result.messageId }
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'SMTP send failed',
    }
  }
}
