'use client'

import * as React from 'react'
import Link from 'next/link'
import { startSubscriptionCheckout } from '@/app/(app)/settings/billing/actions'
import { Button } from '@/components/ui/button'
import type { PlanId } from '@/lib/pricing'

export function SubscriptionCheckoutButton({
  planId,
  months,
  label,
  variant = 'primary',
}: {
  planId: Exclude<PlanId, 'free'>
  months: number
  label: string
  variant?: 'primary' | 'outline'
}) {
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /**
   * Agreeing to the terms before money moves.
   *
   * Required by the payment gateway before a live merchant account is granted,
   * and worth having regardless: the refund rules and what happens when a plan
   * ends are exactly the things people say afterwards they were never told.
   * Unticked by default — a pre-ticked box is not consent.
   */
  const [agreed, setAgreed] = React.useState(false)
  const checkboxId = React.useId()

  async function handleCheckout() {
    setLoading(true)
    setError(null)

    const result = await startSubscriptionCheckout({
      planId,
      months,
    })

    if (!result.ok) {
      setError(result.error)
      setLoading(false)
      return
    }

    window.location.assign(result.data.redirectUrl)
  }

  return (
    <div className="mt-7">
      <label
        htmlFor={checkboxId}
        className="mb-3 flex items-start gap-2.5 text-left text-xs leading-relaxed text-muted"
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 size-3.5 shrink-0 rounded-tile border-line accent-primary"
        />

        <span>
          I have read and accept the{' '}
          <Link
            href="/terms"
            target="_blank"
            className="text-primary underline-offset-4 hover:underline"
          >
            terms
          </Link>
          ,{' '}
          <Link
            href="/privacy"
            target="_blank"
            className="text-primary underline-offset-4 hover:underline"
          >
            privacy policy
          </Link>{' '}
          and{' '}
          <Link
            href="/refund"
            target="_blank"
            className="text-primary underline-offset-4 hover:underline"
          >
            refund policy
          </Link>
          .
        </span>
      </label>

      <Button
        type="button"
        block
        variant={variant}
        loading={loading}
        disabled={!agreed}
        onClick={handleCheckout}
      >
        {label}
      </Button>

      {error && (
        <p className="mt-2 text-center text-xs text-overdue">
          {error}
        </p>
      )}
    </div>
  )
}