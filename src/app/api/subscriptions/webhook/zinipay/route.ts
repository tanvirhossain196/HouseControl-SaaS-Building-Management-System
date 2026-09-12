import { NextResponse, type NextRequest } from 'next/server'
import { handleZinipaySubscription } from '@/services/subscription-zinipay.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ZiniPay's callback for a subscription payment.
 *
 * The body is `{ invoice_id, status }`, or the same pair as query parameters,
 * and it is unsigned — there is nothing to check it against. So only the
 * invoice id is read, and `status` is thrown away: the handler calls ZiniPay
 * back and forms its own opinion. Trusting `status: "true"` from an unsigned
 * POST would hand a free Pro plan to anyone who could guess an invoice id.
 *
 * Always answers 200. A non-200 makes providers retry, and a retry cannot fix
 * a payment that was already applied or was never real.
 */
async function invoiceIdFrom(request: NextRequest): Promise<string | null> {
  const fromQuery = request.nextUrl.searchParams.get('invoice_id')
  if (fromQuery?.trim()) return fromQuery.trim()

  try {
    const contentType = request.headers.get('content-type') ?? ''

    if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>
      const value = body.invoice_id ?? body.invoiceId
      return typeof value === 'string' && value.trim() ? value.trim() : null
    }

    const form = await request.formData()
    const value = form.get('invoice_id')
    return typeof value === 'string' && value.trim() ? value.trim() : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const invoiceId = await invoiceIdFrom(request)

    if (!invoiceId) {
      return NextResponse.json(
        { outcome: 'invalid', message: 'No invoice id.' },
        { status: 200 },
      )
    }

    const result = await handleZinipaySubscription({ invoiceId })
    console.info('[zinipay-webhook]', invoiceId, result.outcome)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('[zinipay-webhook]', error)

    return NextResponse.json(
      { outcome: 'error', message: 'Webhook processing failed.' },
      { status: 200 },
    )
  }
}

/** Some setups ping the URL with GET; treat it the same way. */
export async function GET(request: NextRequest) {
  const invoiceId = request.nextUrl.searchParams.get('invoice_id')?.trim()

  if (!invoiceId) {
    return NextResponse.json(
      { outcome: 'invalid', message: 'No invoice id.' },
      { status: 200 },
    )
  }

  const result = await handleZinipaySubscription({ invoiceId })
  console.info('[zinipay-webhook]', invoiceId, result.outcome)

  return NextResponse.json(result, { status: 200 })
}