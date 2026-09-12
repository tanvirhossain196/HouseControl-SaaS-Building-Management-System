'use client'

import * as React from 'react'
import { CreditCard } from 'lucide-react'
import { startCheckoutAction } from '@/app/(app)/payments/actions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/providers/toast-provider'

/**
 * Sends the resident to the gateway. Nothing is confirmed here — the callback
 * to our server does that, so closing the tab mid-payment cannot lose money.
 *
 * In test mode the button says so. A sandbox checkout looks identical to a real
 * one right down to the success page, so the only thing standing between a
 * resident and believing they have paid their rent is this label.
 */
export function PayOnlineButton({
  flatId,
  dueId,
  test = false,
}: {
  flatId: string
  dueId: string
  test?: boolean
}) {
  const { toast } = useToast()
  const [pending, setPending] = React.useState(false)

  async function start() {
    setPending(true)
    const result = await startCheckoutAction({ flatId, dueId })

    if (!result.ok) {
      setPending(false)
      toast({ tone: 'error', title: 'Could not start the payment', body: result.error })
      return
    }

    window.location.href = result.data.redirectUrl
  }

  return (
    <Button
      size="sm"
      variant={test ? 'outline' : 'primary'}
      loading={pending}
      onClick={start}
      title={test ? 'Sandbox gateway — no money moves' : undefined}
    >
      {!pending && <CreditCard />}
      {test ? 'Pay online (test)' : 'Pay online'}
    </Button>
  )
}