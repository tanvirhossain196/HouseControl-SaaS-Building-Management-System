import { NextResponse, type NextRequest } from 'next/server'
import { handleSslIpn } from '@/services/gateway.service'
import type { IpnPayload } from '@/lib/gateway/signature'

/**
 * SSLCommerz IPN endpoint.
 *
 * Public by necessity — the gateway has no session with us — which is why the
 * signature check and the server-side validation call in `handleSslIpn` carry
 * the whole weight. Nothing here trusts the request body.
 *
 * Always answers 200 once the payload has been recorded, including for a
 * payload we refuse. A 500 would make SSLCommerz retry an event we have
 * already decided about; the decision is in `webhook_events` either way.
 */
export async function POST(request: NextRequest) {
  let payload: IpnPayload

  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      payload = (await request.json()) as IpnPayload
    } else {
      const form = await request.formData()
      payload = Object.fromEntries(
        [...form.entries()].map(([key, value]) => [key, String(value)]),
      )
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed payload.' }, { status: 400 })
  }

  try {
    const result = await handleSslIpn(payload)
    return NextResponse.json({ ok: true, outcome: result.outcome })
  } catch (error) {
    // Something in our own stack failed rather than the payload being wrong.
    // A 500 is correct here: we want the retry.
    console.error('[ipn] handler failed', error)
    return NextResponse.json({ ok: false, error: 'Handler failed.' }, { status: 500 })
  }
}

/** The gateway sometimes probes the URL with a GET before enabling it. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'sslcommerz-ipn' })
}

export const dynamic = 'force-dynamic'
