import 'server-only'

import { AppError } from '@/lib/errors'
import { newTransactionId, verifyIpnSignature, type IpnPayload } from './signature'

export { newTransactionId, verifyIpnSignature }
export type { IpnPayload }

/**
 * SSLCommerz.
 *
 * Three things happen here and they are deliberately separate:
 *
 *   1. `startSession` asks the gateway for a checkout URL.
 *   2. `verifyIpnSignature` checks that an incoming IPN really came from
 *      SSLCommerz and was not altered on the way.
 *   3. `validateTransaction` asks SSLCommerz directly what it thinks happened.
 *
 * Step 2 alone is not enough. A signature proves the message is authentic, not
 * that the payment succeeded — a replayed or partially-crafted callback can
 * carry a valid signature for the wrong facts. Nothing is confirmed until
 * step 3 agrees, from a request we made ourselves.
 */

const SANDBOX = {
  session: 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php',
  validation: 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php',
}

const LIVE = {
  session: 'https://securepay.sslcommerz.com/gwprocess/v4/api.php',
  validation: 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php',
}

export type SslConfig = {
  storeId: string
  storePassword: string
  sandbox: boolean
}

export function sslConfig(): SslConfig {
  const storeId = process.env.SSLCOMMERZ_STORE_ID
  const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD

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

const endpoints = (config: SslConfig) => (config.sandbox ? SANDBOX : LIVE)

export type CheckoutRequest = {
  transactionId: string
  amount: number
  customerName: string
  customerEmail: string
  customerPhone: string
  productName: string
  successUrl: string
  failUrl: string
  cancelUrl: string
  ipnUrl: string
}

/** Asks SSLCommerz for a hosted checkout URL to send the resident to. */
export async function startSession(
  request: CheckoutRequest,
  config: SslConfig = sslConfig(),
): Promise<{ redirectUrl: string; sessionKey: string }> {
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
    cus_name: request.customerName,
    cus_email: request.customerEmail,
    cus_phone: request.customerPhone,
    cus_add1: 'N/A',
    cus_city: 'Dhaka',
    cus_country: 'Bangladesh',
    shipping_method: 'NO',
    product_name: request.productName,
    product_category: 'Rent',
    product_profile: 'non-physical-goods',
  })

  const response = await fetch(endpoints(config).session, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new AppError(
      'internal_error',
      'The payment gateway did not respond. Try again.',
    )
  }

  const result = (await response.json()) as {
    status?: string
    GatewayPageURL?: string
    sessionkey?: string
    failedreason?: string
  }

  if (result.status !== 'SUCCESS' || !result.GatewayPageURL) {
    throw new AppError(
      'internal_error',
      result.failedreason ?? 'The payment gateway refused to start a session.',
    )
  }

  return { redirectUrl: result.GatewayPageURL, sessionKey: result.sessionkey ?? '' }
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
 * Asks SSLCommerz what actually happened, using the validation id from the
 * callback. This is the answer we trust — the callback only tells us to go
 * and look.
 */
export async function validateTransaction(
  validationId: string,
  config: SslConfig = sslConfig(),
): Promise<ValidationResult> {
  const url = new URL(endpoints(config).validation)
  url.searchParams.set('val_id', validationId)
  url.searchParams.set('store_id', config.storeId)
  url.searchParams.set('store_passwd', config.storePassword)
  url.searchParams.set('format', 'json')

  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new AppError(
      'internal_error',
      'Could not reach the gateway to validate the payment.',
    )
  }

  const result = (await response.json()) as {
    status?: string
    amount?: string
    currency?: string
    tran_id?: string
    bank_tran_id?: string
    card_type?: string
  }

  // VALID means captured; VALIDATED means captured and already validated once.
  const status = result.status ?? 'UNKNOWN'

  return {
    valid: status === 'VALID' || status === 'VALIDATED',
    status,
    amount: Number(result.amount ?? 0),
    currency: result.currency ?? 'BDT',
    transactionId: result.tran_id ?? '',
    bankTransactionId: result.bank_tran_id ?? null,
    cardType: result.card_type ?? null,
    raw: result,
  }
}
