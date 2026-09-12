import 'server-only'

import { AppError } from '@/lib/errors'

/**
 * ZiniPay: create a hosted invoice, then ask the backend what happened.
 *
 * The shape mirrors sslcommerz.ts on purpose — a config reader, a "start a
 * payment" call and a "tell me the truth about it" call — so the service layer
 * treats the two providers the same way.
 *
 * One difference matters and is handled here rather than left to callers:
 * ZiniPay's webhook carries no signature. It is a nudge, not evidence. Nothing
 * in this file trusts a callback body; `verifyInvoice` is the only thing that
 * decides whether money moved, and it asks ZiniPay directly over an
 * authenticated connection.
 */

export type ZiniConfig = {
  apiKey: string
  baseUrl: string
}

export function ziniConfig(): ZiniConfig {
  const apiKey = process.env.ZINIPAY_API_KEY

  if (!apiKey) {
    throw new AppError('internal_error', 'ZINIPAY_API_KEY is not set.')
  }

  return {
    apiKey,
    baseUrl: process.env.ZINIPAY_BASE_URL ?? 'https://api.zinipay.com',
  }
}

export function hasZinipay(): boolean {
  return Boolean(process.env.ZINIPAY_API_KEY)
}

export type ZiniCreateRequest = {
  amount: number
  customerName: string
  customerEmail: string
  redirectUrl: string
  cancelUrl: string
  webhookUrl: string
  /** Our own transaction id, echoed back on verify. */
  metadata: Record<string, string>
}

export type ZiniInvoice = {
  invoiceId: string
  paymentUrl: string
}

export type ZiniStatus = 'PENDING' | 'COMPLETED' | 'FAILED'

export type ZiniVerification = {
  invoiceId: string
  amount: number
  status: ZiniStatus
  /** The MFS transaction id — bKash's TrxID and friends. */
  transactionId: string | null
  paymentMethod: string | null
  metadata: Record<string, unknown>
  raw: unknown
}

async function call(
  path: string,
  body: unknown,
  config: ZiniConfig,
): Promise<Record<string, unknown>> {
  let response: Response

  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'zini-api-key': config.apiKey,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
  } catch {
    throw new AppError('internal_error', 'Could not reach the payment provider.')
  }

  const payload = (await response.json().catch(() => null)) as
    | Record<string, unknown>
    | null

  if (!response.ok || !payload) {
    const message =
      (payload?.message as string | undefined) ?? `Provider returned ${response.status}`
    throw new AppError('internal_error', message)
  }

  return payload
}

/**
 * The invoice id is not a documented field of the create response — only
 * `payment_url` is, and the id is its last path segment. Read the field when
 * it is there and fall back to the URL when it is not, so this keeps working
 * whichever way they send it.
 */
function invoiceIdFrom(payload: Record<string, unknown>): string | null {
  const direct = payload.invoice_id ?? payload.invoiceId
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const url = payload.payment_url
  if (typeof url !== 'string') return null

  const segment = url.split('?')[0]?.split('/').filter(Boolean).pop()
  return segment?.trim() || null
}

export async function createInvoice(
  request: ZiniCreateRequest,
  config: ZiniConfig = ziniConfig(),
): Promise<ZiniInvoice> {
  if (!(request.amount > 0)) {
    throw new AppError('bad_request', 'Payment amount must be greater than zero.')
  }

  const payload = await call(
    '/v1/payment/create',
    {
      cus_name: request.customerName || 'HouseControl customer',
      cus_email: request.customerEmail || 'customer@example.com',
      amount: request.amount,
      metadata: request.metadata,
      redirect_url: request.redirectUrl,
      cancel_url: request.cancelUrl,
      webhook_url: request.webhookUrl,
    },
    config,
  )

  const paymentUrl = payload.payment_url
  const invoiceId = invoiceIdFrom(payload)

  if (payload.status === false || typeof paymentUrl !== 'string' || !invoiceId) {
    throw new AppError(
      'internal_error',
      (payload.message as string | undefined) ?? 'Could not start the payment.',
    )
  }

  return { invoiceId, paymentUrl }
}

function readStatus(value: unknown): ZiniStatus {
  const status = String(value ?? '').toUpperCase()
  if (status === 'COMPLETED') return 'COMPLETED'
  if (status === 'FAILED') return 'FAILED'
  return 'PENDING'
}

/** The only thing in this integration that may conclude a payment happened. */
export async function verifyInvoice(
  invoiceId: string,
  config: ZiniConfig = ziniConfig(),
): Promise<ZiniVerification> {
  const payload = await call('/v1/payment/verify', { invoice_id: invoiceId }, config)

  const metadata =
    payload.metadata && typeof payload.metadata === 'object'
      ? (payload.metadata as Record<string, unknown>)
      : {}

  return {
    invoiceId: String(payload.invoice_id ?? invoiceId),
    amount: Number(payload.amount ?? 0),
    status: readStatus(payload.status),
    transactionId:
      typeof payload.transaction_id === 'string' ? payload.transaction_id : null,
    paymentMethod:
      typeof payload.payment_method === 'string' ? payload.payment_method : null,
    metadata,
    raw: payload,
  }
}