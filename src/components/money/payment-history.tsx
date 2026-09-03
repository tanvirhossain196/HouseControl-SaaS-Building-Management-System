import { Badge } from '@/components/ui/badge'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/layout/page-header'
import { formatTaka } from '@/lib/utils'
import { FileText } from 'lucide-react'
import type { PaymentWithContext } from '@/services/payments.service'
import type { PaymentStatus } from '@/types'

const statusTone: Record<PaymentStatus, 'paid' | 'due' | 'overdue' | 'neutral'> = {
  confirmed: 'paid',
  pending: 'due',
  rejected: 'overdue',
  failed: 'overdue',
  refunded: 'neutral',
}

const methodLabel: Record<string, string> = {
  bkash: 'bKash',
  nagad: 'Nagad',
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  other: 'Other',
}

/** Settled history. The receipt number is the column people come here for. */
export function PaymentHistory({
  payments,
  showWho = false,
}: {
  payments: PaymentWithContext[]
  showWho?: boolean
}) {
  if (payments.length === 0) {
    return (
      <EmptyState
        title="No payments yet"
        body="Confirmed and rejected payments both stay here, with the reason and the receipt number."
      />
    )
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Date</TH>
          {showWho && <TH>Who</TH>}
          <TH>Amount</TH>
          <TH>Method</TH>
          <TH>Receipt</TH>
          <TH>Status</TH>
        </TR>
      </THead>
      <TBody>
        {payments.map((payment) => (
          <TR key={payment.id}>
            <TD className="tabular whitespace-nowrap font-mono text-xs">
              {payment.paid_at}
            </TD>
            {showWho && (
              <TD className="text-sm text-muted">
                {payment.payerName ?? '—'}
                {payment.unitNumber && (
                  <span className="tabular ml-2 font-mono text-xs">
                    {payment.unitNumber}
                  </span>
                )}
              </TD>
            )}
            <TD className="tabular font-mono">{formatTaka(Number(payment.amount))}</TD>
            <TD className="text-sm text-muted">
              {methodLabel[payment.method] ?? payment.method}
            </TD>
            <TD className="tabular font-mono text-xs text-muted">
              {payment.receipt_no ? (
                <a
                  href={`/api/receipts/${payment.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <FileText className="size-3.5" aria-hidden />
                  {payment.receipt_no}
                </a>
              ) : (
                '—'
              )}
            </TD>
            <TD>
              <Badge tone={statusTone[payment.status]} dot>
                {payment.status}
              </Badge>
              {payment.rejection_reason && (
                <p className="mt-1 max-w-[32ch] text-xs text-muted">
                  {payment.rejection_reason}
                </p>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  )
}
