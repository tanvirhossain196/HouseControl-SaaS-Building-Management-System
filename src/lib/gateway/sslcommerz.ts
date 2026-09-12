import 'server-only'

import { AppError } from '@/lib/errors'
import {
  newTransactionId,
  verifyIpnSignature,
  type IpnPayload,
} from './signature'

export { newTransactionId, verifyIpnSignature }
export type { IpnPayload }

const SANDBOX = {
  session:
    'https://sandbox.sslcommerz.com/gwprocess/v4/api.php',
  validation:
    'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php',
}

const LIVE = {
  session:
    'https://securepay.sslcommerz.com/gwprocess/v4/api.php',
  validation:
    'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php',
}

export type SslConfig = {
  storeId: string
  storePassword: string
  sandbox: boolean
}

export function sslConfig(): SslConfig {
  const storeId = process.env.SSLCOMMERZ_STORE_ID
  const storePassword =
    process.env.SSLCOMMERZ_STORE_PASSWORD

  if (!storeId || !storePassword) {
    throw new AppError(
      'internal_error',
      'Online payment is not configured for this deployment.',
    )
  }

  return {
    storeId,
    storePassword,
    sandbox: process.env.SSLCOMMERZ_SANDBOX !== 'false',
  }
}

function endpoints(config: SslConfig) {
  return config.sandbox ? SANDBOX : LIVE
}

export type CheckoutRequest = {
  transactionId: string
  amount: number
  customerName: string
  customerEmail: string
  customerPhone: string
  productName: string
  productCategory?: string
  successUrl: string
  failUrl: string
  cancelUrl: string
  ipnUrl: string
}

/**
 * Starts a hosted SSLCommerz checkout session.
 *
 * The browser never sends the payable amount directly. The server creates
 * this request from a trusted due or subscription quote.
 */
export async function startSession(
  request: CheckoutRequest,
  config: SslConfig = sslConfig(),
): Promise<{
  redirectUrl: string
  sessionKey: string
}> {
  if (!Number.isFinite(request.amount) || request.amount <= 0) {
    throw new AppError(
      'bad_request',
      'Payment amount must be greater than zero.',
    )
  }

  if (!request.transactionId.trim()) {
    throw new AppError(
      'bad_request',
      'Payment transaction id is required.',
    )
  }

  const body = new URLSearchParams({
    store_id: config.storeId,
    store_passwd: config.storePassword,
    total_amount: request.amount.toFixed(2),
    currency: 'BDT',
    tran_id: request.transactionId,
    success_url: request.successUrl,
    fail_url: request.failUrl,
    cancel_url: request.cancelUrl,
    ipn_url: request.ipnUrl,
    cus_name: request.customerName || 'HouseControl customer',
    cus_email:
      request.customerEmail || 'customer@example.com',
    cus_phone: request.customerPhone || '01700000000',
    cus_add1: 'N/A',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
    shipping_method: 'NO',
    product_name: request.productName || 'HouseControl payment',
    product_category:
      request.productCategory || 'Service',
    product_profile: 'non-physical-goods',
  })

  let response: Response

  try {
    response = await fetch(endpoints(config).session, {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
      body,
      cache: 'no-store',
    })
  } catch {
    throw new AppError(
      'internal_error',
      'The payment gateway could not be reached. Try again.',
    )
  }

  if (!response.ok) {
    throw new AppError(
      'internal_error',
      'The payment gateway did not respond. Try again.',
    )
  }

  let result: {
    status?: string
    GatewayPageURL?: string
    sessionkey?: string
    failedreason?: string
  }

  try {
    result = (await response.json()) as typeof result
  } catch {
    throw new AppError(
      'internal_error',
      'The payment gateway returned an invalid response.',
    )
  }

  if (
    result.status !== 'SUCCESS' ||
    !result.GatewayPageURL
  ) {
    throw new AppError(
      'internal_error',
      result.failedreason ??
        'The payment gateway refused to start a session.',
    )
  }

  return {
    redirectUrl: result.GatewayPageURL,
    sessionKey: result.sessionkey ?? '',
  }
}

export type ValidationResult = {
  valid: boolean
  status: string
  amount: number
  currency: string
  transactionId: string
  bankTransactionId: string | null
  cardType: string | null
  raw: unknown
}

/**
 * Validates a transaction directly with SSLCommerz.
 *
 * A callback alone is never trusted as final payment confirmation.
 */
export async function validateTransaction(
  validationId: string,
  config: SslConfig = sslConfig(),
): Promise<ValidationResult> {
  if (!validationId.trim()) {
    throw new AppError(
      'bad_request',
      'Validation id is required.',
    )
  }

  const url = new URL(
    endpoints(config).validation,
  )

  url.searchParams.set('val_id', validationId)
  url.searchParams.set('store_id', config.storeId)
  url.searchParams.set(
    'store_passwd',
    config.storePassword,
  )
  url.searchParams.set('format', 'json')

  let response: Response

  try {
    response = await fetch(url, {
      cache: 'no-store',
    })
  } catch {
    throw new AppError(
      'internal_error',
      'Could not reach the gateway to validate the payment.',
    )
  }

  if (!response.ok) {
    throw new AppError(
      'internal_error',
      'Could not reach the gateway to validate the payment.',
    )
  }

  let result: {
    status?: string
    amount?: string | number
    currency?: string
    tran_id?: string
    bank_tran_id?: string
    card_type?: string
  }

  try {
    result = (await response.json()) as typeof result
  } catch {
    throw new AppError(
      'internal_error',
      'The gateway returned an invalid validation response.',
    )
  }

  const status = result.status ?? 'UNKNOWN'
  const amount = Number(result.amount ?? 0)
  const currency = result.currency ?? 'BDT'

  return {
    valid:
      (status === 'VALID' ||
        status === 'VALIDATED') &&
      Number.isFinite(amount) &&
      amount > 0 &&
      currency.toUpperCase() === 'BDT',

    status,
    amount,
    currency,
    transactionId: result.tran_id ?? '',
    bankTransactionId:
      result.bank_tran_id ?? null,
    cardType: result.card_type ?? null,
    raw: result,
  }
}