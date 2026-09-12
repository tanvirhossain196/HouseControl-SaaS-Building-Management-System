import { NextResponse, type NextRequest } from 'next/server'
import { publicEnv } from '@/lib/env'
import type { IpnPayload } from '@/lib/gateway/signature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Bridge for gateway browser redirects (success / fail / cancel).
 *
 * Two jobs.
 *
 * First, SSLCommerz sends the customer back with a cross-site form POST. A POST
 * straight onto a page is blocked by the CSRF check in middleware, and even if
 * it were allowed the session cookie is SameSite=Lax so it would not be sent —
 * the page would bounce to /sign-in. This route absorbs the POST and answers
 * 303, which turns the next request into a same-site GET.
 *
 * Second, it runs the same verification the IPN handler runs. The return POST
 * carries `verify_sign`, `tran_id` and `val_id`, exactly like the IPN does, so
 * nothing is trusted any more here than there: the signature is checked, the
 * gateway is called back, and the amount is compared against the row we wrote
 * at checkout. This matters because the IPN is a separate server-to-server
 * call that can be late, lost, or never configured — sandbox especially. The
 * handlers are idempotent, so whichever arrives second records a duplicate and
 * changes nothing.
 */

const DEFAULT_TARGET = '/payments/return'

/** Only same-origin paths. Blocks `//evil.com` and absolute URLs. */
function safeTarget(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_TARGET
  }
  return value
}

async function bodyValues(request: NextRequest): Promise<Record<string, string>> {
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (
      !contentType.includes('form-data') &&
      !contentType.includes('x-www-form-urlencoded')
    ) {
      return {}
    }

    const form = await request.formData()
    const out: Record<string, string> = {}
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') out[key] = value
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Confirms through the same path the webhook uses. Failures are swallowed on
 * purpose: the customer still gets their page, and the IPN remains the backstop.
 */
async function settle(
  handler: string | null,
  body: Record<string, string>,
  transactionId: string | null,
) {
  /**
   * ZiniPay first: its return is a plain redirect with no body and no
   * signature, so the SSLCommerz gate below would drop it. Safe to run from
   * the query string because the handler ignores everything it is told and
   * verifies the invoice against ZiniPay itself.
   */
  if (handler === 'zinipay' || handler === 'rent-zinipay') {
    if (!transactionId) return

    try {
      if (handler === 'rent-zinipay') {
        const { handleZinipayRent } = await import('@/services/rent-zinipay.service')
        const result = await handleZinipayRent({ transactionId })
        console.info('[gateway-return] rent', transactionId, result.outcome)
        return
      }

      const { handleZinipaySubscription } =
        await import('@/services/subscription-zinipay.service')
      const result = await handleZinipaySubscription({ transactionId })
      console.info('[gateway-return] zinipay', transactionId, result.outcome)
    } catch (error) {
      console.error('[gateway-return] zinipay failed', transactionId, error)
    }
    return
  }

  if (!body.tran_id || !body.verify_sign) return

  try {
    if (handler === 'subscription') {
      const { handleSubscriptionIpn } =
        await import('@/services/subscription-gateway.service')
      const result = await handleSubscriptionIpn(body as IpnPayload)
      console.info('[gateway-return] subscription', body.tran_id, result.outcome)
      return
    }

    if (handler === 'payment') {
      const { handleSslIpn } = await import('@/services/gateway.service')
      const result = await handleSslIpn(body as IpnPayload)
      console.info('[gateway-return] payment', body.tran_id, result.outcome)
    }
  } catch (error) {
    console.error('[gateway-return] settle failed', body.tran_id, error)
  }
}

/**
 * ZiniPay overwrites the `status` we put in the redirect URL with its own
 * vocabulary — COMPLETED, FAILED, PENDING — so the value coming back cannot be
 * compared against the one we sent. Map it onto ours for the page, and treat
 * anything unrecognised as a success rather than a failure: the page reads the
 * real state from the database, and the row is only ever marked paid by a
 * verified call, so guessing wrong here shows a slightly odd banner at worst.
 */
function normalisedStatus(raw: string | null): string {
  if (!raw) return 'success'

  const value = raw.toLowerCase()

  if (value === 'completed' || value === 'true' || value === 'success') return 'success'
  if (value === 'failed' || value === 'false') return 'failed'
  if (value === 'cancelled' || value === 'canceled') return 'cancelled'

  return value
}

function redirectTo(request: NextRequest, body: Record<string, string>) {
  const params = request.nextUrl.searchParams

  /**
   * The public site URL, not the request's own host. Behind a tunnel or proxy
   * the incoming Host is the internal one (localhost:3000) while the scheme
   * says https, and redirecting to that gives the browser an address that does
   * not exist. This is the same value the gateway was handed at checkout.
   */
  const base = publicEnv().NEXT_PUBLIC_SITE_URL
  const url = new URL(safeTarget(params.get('to')), base)

  const status = normalisedStatus(params.get('status'))
  const tran = params.get('tran') ?? body.tran_id ?? ''

  url.searchParams.set('status', status)
  if (tran) url.searchParams.set('tran', tran)

  // 303 forces the browser to follow up with GET.
  return NextResponse.redirect(url, 303)
}

export async function POST(request: NextRequest) {
  const body = await bodyValues(request)

  const params = request.nextUrl.searchParams
  const handler = params.get('handler')

  /**
   * SSLCommerz keeps the status we gave it, so a non-success return there
   * really is a failure and there is nothing to settle. ZiniPay replaces it,
   * so its value tells us nothing and is ignored — the handler asks ZiniPay
   * directly and a failed or abandoned payment simply will not confirm.
   */
  if (
    handler === 'zinipay' ||
    handler === 'rent-zinipay' ||
    normalisedStatus(params.get('status')) === 'success'
  ) {
    await settle(handler, body, params.get('tran'))
  }

  return redirectTo(request, body)
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  // ZiniPay comes back as a GET redirect rather than a form POST.
  const handler = params.get('handler')

  if (handler === 'zinipay' || handler === 'rent-zinipay') {
    await settle(handler, {}, params.get('tran'))
  }

  return redirectTo(request, {})
}
