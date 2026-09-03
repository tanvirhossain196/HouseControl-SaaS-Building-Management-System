import Link from 'next/link'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { getCheckoutStatus } from '@/services/gateway.service'
import { formatTaka } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export const metadata = pageMetadata({
  title: 'Payment',
  description: 'How your online payment went.',
  path: '/payments/return',
  noIndex: true,
})

/**
 * Where the gateway sends the resident back to.
 *
 * This page reads our own record rather than the query string. The gateway's
 * `status=success` in the URL is a hint about where to look, not proof — the
 * confirmation arrives on the server through the IPN callback, and it may
 * land a second after the redirect does.
 */
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: { status?: string; tran?: string }
}) {
  const session = await requireSession('/dues')
  const transactionId = searchParams.tran ?? ''

  const payment = transactionId
    ? await getCheckoutStatus(session.userId, transactionId).catch(() => null)
    : null

  const state =
    payment?.status === 'confirmed'
      ? 'confirmed'
      : payment?.status === 'failed' || searchParams.status === 'failed'
        ? 'failed'
        : searchParams.status === 'cancelled'
          ? 'cancelled'
          : 'pending'

  const copy = {
    confirmed: {
      icon: CheckCircle2,
      tone: 'text-paid',
      title: 'Payment received',
      body: payment?.receipt_no
        ? `Receipt ${payment.receipt_no}. Your balance is already updated.`
        : 'Your balance is updated.',
    },
    pending: {
      icon: Clock,
      tone: 'text-due',
      title: 'Waiting for the bank',
      body: 'The gateway has taken the payment and is confirming it with us. This usually takes a few seconds — your dues page will show it once it lands.',
    },
    failed: {
      icon: XCircle,
      tone: 'text-overdue',
      title: 'The payment did not go through',
      body: 'Nothing was charged. Try again, or record a bKash payment by hand instead.',
    },
    cancelled: {
      icon: XCircle,
      tone: 'text-muted',
      title: 'Payment cancelled',
      body: 'Nothing was charged. The charge is still on your dues page when you want it.',
    },
  }[state]

  const Icon = copy.icon

  return (
    <div className="mx-auto max-w-lg py-16">
      <Icon className={`size-8 ${copy.tone}`} aria-hidden />
      <h1 className="mt-5 text-display text-ink">{copy.title}</h1>
      <p className="mt-4 text-lead text-muted">{copy.body}</p>

      {payment && (
        <p className="tabular mt-4 font-mono text-sm text-muted">
          {formatTaka(Number(payment.amount))} · {transactionId}
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link href="/dues" className={buttonVariants({ size: 'lg' })}>
          Back to my dues
        </Link>
        {state === 'confirmed' && payment && (
          <a
            href={`/api/receipts/${payment.id}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            Download receipt
          </a>
        )}
      </div>
    </div>
  )
}
