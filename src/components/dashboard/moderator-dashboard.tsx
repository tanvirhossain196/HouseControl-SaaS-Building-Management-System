import Link from 'next/link'
import { getModeratorOverview } from '@/services/overview.service'
import { formatTaka } from '@/lib/utils'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { CollectionMeter, Stat } from './stat'

/** A moderator runs one flat. The screen is about who still owes what. */
export async function ModeratorDashboard({
  flatIds,
  name,
}: {
  flatIds: string[]
  name: string
}) {
  const stats = await getModeratorOverview(flatIds)

  return (
    <>
      <PageHeader
        title={`Your flat, ${name}.`}
        description="Confirm what has come in, and see what has not."
        actions={
          flatIds[0] ? (
            <Link
              href={`/flats/${flatIds[0]}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Residents and rent split
            </Link>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Outstanding"
          value={formatTaka(stats.billed - stats.collected)}
          tone={stats.billed - stats.collected > 0 ? 'due' : 'paid'}
        />
        <Stat
          label="To confirm"
          value={String(stats.pendingPayments.length)}
          hint="Payments waiting on you"
        />
        <Stat label="Residents" value={String(stats.residents)} />
        <CollectionMeter collected={stats.collected} billed={stats.billed} />
      </div>

      <section className="mt-10">
        <h2 className="text-title text-ink">Payments waiting on you</h2>
        <div className="mt-4">
          {stats.pendingPayments.length === 0 ? (
            <EmptyState
              title="Nothing to confirm"
              body="When a resident sends rent and uploads the proof, it appears here until you confirm or reject it."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Paid on</TH>
                  <TH>Amount</TH>
                  <TH>Method</TH>
                  <TH>Reference</TH>
                </TR>
              </THead>
              <TBody>
                {stats.pendingPayments.map((payment) => (
                  <TR key={payment.id}>
                    <TD className="tabular font-mono text-xs">{payment.paid_at}</TD>
                    <TD className="tabular font-mono">
                      {formatTaka(Number(payment.amount))}
                    </TD>
                    <TD className="text-muted">{payment.method.replace('_', ' ')}</TD>
                    <TD className="text-muted">{payment.reference ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>

      {stats.overdue.length > 0 && (
        <section className="mt-10">
          <h2 className="text-title text-ink">Overdue</h2>
          <ul className="mt-4 divide-y divide-line rounded-panel border border-line bg-surface">
            {stats.overdue.map((due) => (
              <li
                key={due.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <span className="text-sm text-ink">{due.description ?? 'Rent'}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular font-mono text-sm text-ink">
                    {formatTaka(Number(due.amount) - Number(due.amount_paid))}
                  </span>
                  <Badge tone="overdue" dot>
                    Due {due.due_date}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
