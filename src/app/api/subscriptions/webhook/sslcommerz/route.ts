import { NextResponse } from 'next/server'
import { handleSubscriptionIpn } from '@/services/subscription-gateway.service'
import type { IpnPayload } from '@/lib/gateway/signature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function formDataToPayload(formData: FormData): IpnPayload {
  const payload: Record<string, string> = {}

  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') {
      payload[key] = value
    }
  }

  return payload as unknown as IpnPayload
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? ''

    let payload: IpnPayload

    if (contentType.includes('application/json')) {
      payload = (await request.json()) as IpnPayload
    } else {
      const formData = await request.formData()
      payload = formDataToPayload(formData)
    }

    const result = await handleSubscriptionIpn(payload)

    return NextResponse.json(result, {
      status: 200,
    })
  } catch (error) {
    console.error('[subscription-webhook]', error)

    return NextResponse.json(
      {
        outcome: 'error',
        message: 'Subscription webhook processing failed.',
      },
      {
        status: 200,
      },
    )
  }
}
