'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { UserCog } from 'lucide-react'
import { respondToTransferAction } from '@/app/(app)/flats/transfer-actions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/providers/toast-provider'
import type { TransferView } from '@/services/transfers.service'

/**
 * The incoming resident's side. Shown at the top of their dashboard, because
 * an offer that sits unnoticed for 48 hours helps nobody.
 */
export function IncomingTransfer({ transfer }: { transfer: TransferView }) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = React.useState<'accept' | 'decline' | null>(null)

  async function respond(answer: 'accept' | 'decline') {
    setPending(answer)
    const result = await respondToTransferAction(transfer.id, answer)
    setPending(null)

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not respond', body: result.error })
      return
    }

    toast({
      tone: 'success',
      title: answer === 'accept' ? 'You now moderate this flat' : 'Declined',
      body:
        answer === 'accept'
          ? 'Billing, payments and residents for this flat are yours.'
          : 'The role stays where it was.',
    })
    router.refresh()
  }

  const ready = Boolean(transfer.otp_verified_at)

  return (
    <div className="mb-8 rounded-panel border border-primary/30 bg-primary-soft/50 p-5">
      <div className="flex gap-3">
        <UserCog className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">
            {transfer.fromName ?? 'The current moderator'} wants to hand you flat{' '}
            {transfer.unitNumber}
          </p>
          <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-muted">
            Accepting makes you responsible for this flat: billing the rent, confirming
            payments, and adding or removing residents. You can hand it on later, and the
            building owner can undo this for seven days.
          </p>
          {transfer.note && (
            <p className="mt-2 text-sm italic text-muted">“{transfer.note}”</p>
          )}
          {!ready && (
            <p className="mt-2 text-xs text-muted">
              Waiting for them to confirm their code before you can accept.
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 sm:pl-8">
        <Button
          size="sm"
          disabled={!ready}
          loading={pending === 'accept'}
          onClick={() => respond('accept')}
        >
          Accept the role
        </Button>
        <Button
          size="sm"
          variant="outline"
          loading={pending === 'decline'}
          onClick={() => respond('decline')}
        >
          Decline
        </Button>
      </div>
    </div>
  )
}
