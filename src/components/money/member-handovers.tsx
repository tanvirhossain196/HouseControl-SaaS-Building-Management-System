'use client'

import * as React from 'react'
import { Banknote, FileText } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/layout/page-header'
import { PayForm } from '@/components/money/pay-form'
import { formatTaka, dueLabel, latenessOf, type Lateness } from '@/lib/utils'
import { periodLabel, todayInDhaka } from '@/lib/billing'
import { daysUntil } from '@/lib/subscription'

/** Late is amber, overdue is red — the grace period is visible, not silent. */
const toneFor = (state: Lateness) =>
  state === 'overdue' ? 'overdue' : state === 'late' || state === 'due' ? 'due' : 'neutral'

export type MemberCharge = {
  id: string
  flatId: string
  unitNumber: string | null
  period: string
  description: string | null
  amount: number
  amountPaid: number
  dueDate: string
  status: string
  receipts: Array<{ id: string; amount: number; paidAt: string; receiptNo: string }>
  /** Recorded but not yet accepted by the moderator. */
  awaiting: number
  /** Turned down, with the moderator's reason. Most recent first. */
  rejected: Array<{ id: string; amount: number; reason: string | null }>
}

/**
 * What a resident owes their moderator, month by month.
 *
 * The same shape as the moderator's own handover list one level up, on purpose:
 * the money moves through the building in two identical hops, and a resident
 * who becomes a moderator should not have to learn a second screen.
 *
 * Recording a payment claims nothing. The moderator confirms it, and only then
 * does a receipt exist — which is why a recorded-but-unconfirmed amount is
 * called out separately rather than quietly subtracted from the balance.
 */
export function MemberHandovers({ charges }: { charges: MemberCharge[] }) {
  if (charges.length === 0) {
    return (
      <EmptyState
        title="Nothing to hand over"
        body="When your moderator bills the month's rent or your share of a bill, it appears here with the date it is due."
      />
    )
  }

  const today = todayInDhaka()

  return (
    <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
      {charges.map((charge) => {
        const outstanding = Math.round((charge.amount - charge.amountPaid) * 100) / 100
        const settled = charge.status === 'paid' || outstanding <= 0
        const left = daysUntil(charge.dueDate, today) ?? 0
        const state = latenessOf({
          dueDate: charge.dueDate,
          period: charge.period,
          today,
        })

        return (
          <li key={charge.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {periodLabel(charge.period)}
                {charge.unitNumber && (
                  <span className="text-muted"> · Flat {charge.unitNumber}</span>
                )}
              </p>

              <p className="mt-1 text-xs text-muted">
                {charge.description ?? 'Rent'} · {formatTaka(charge.amount)}
                {charge.amountPaid > 0 &&
                  ` · ${formatTaka(charge.amountPaid)} accepted so far`}
              </p>

              {charge.awaiting > 0 && (
                <p className="mt-1 text-xs text-due">
                  {formatTaka(charge.awaiting)} recorded — waiting for your
                  moderator to confirm.
                </p>
              )}

              {/*
                A rejection is the one thing here the resident has to act on,
                and the reason is the only part that tells them how. Silently
                dropping the amount back into the balance would leave them
                wondering why it went up again.
              */}
              {charge.rejected.map((entry) => (
                <p key={entry.id} className="mt-1 text-xs text-overdue">
                  {formatTaka(entry.amount)} was turned down
                  {entry.reason ? `: ${entry.reason}` : '.'} Record it again with
                  the right figures.
                </p>
              ))}
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <Badge
                tone={settled ? 'paid' : charge.awaiting > 0 ? 'due' : toneFor(state)}
                dot
              >
                {settled
                  ? 'Confirmed'
                  : charge.awaiting > 0
                    ? 'Waiting on your moderator'
                    : charge.amountPaid > 0
                      ? `${formatTaka(outstanding)} remaining`
                      : dueLabel(left, state)}
              </Badge>

              {!settled && charge.awaiting === 0 && (
                <PayForm
                  flatId={charge.flatId}
                  dueId={charge.id}
                  outstanding={outstanding}
                  label={`${periodLabel(charge.period)} — ${charge.description ?? 'Rent'}`}
                  trigger={
                    <Button size="sm">
                      <Banknote /> Record handover
                    </Button>
                  }
                />
              )}
            </div>

            {charge.receipts.length > 0 && (
              <ul className="w-full space-y-1 border-t border-line pt-3">
                {charge.receipts.map((receipt) => (
                  <li
                    key={receipt.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-muted">
                      {formatTaka(receipt.amount)} accepted on {receipt.paidAt}
                    </span>

                    <a
                      href={`/api/receipts/${receipt.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="tabular inline-flex items-center gap-1.5 font-mono text-primary underline-offset-4 hover:underline"
                    >
                      <FileText className="size-3.5" aria-hidden />
                      {receipt.receiptNo}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}