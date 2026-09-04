import Link from 'next/link'
import { Download } from 'lucide-react'
import { pageMetadata } from '@/lib/seo'
import { requirePermission } from '@/lib/auth/guards'
import {
  arrearsAgeing,
  arrearsByFlat,
  collectionForPeriod,
  collectionTrend,
  expenseBreakdown,
} from '@/services/reports.service'
import { formatTaka } from '@/lib/utils'
import { periodLabel, periodOf, previousPeriod } from '@/lib/billing'
import { monthOverMonth } from '@/lib/reports'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Stat } from '@/components/dashboard/stat'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { BarSeries } from '@/components/reports/bar-series'
import { AgeingTable } from '@/components/reports/ageing-table'

export const metadata = pageMetadata({
  title: 'Reports',
  description: 'Collection, arrears and expenses.',
  path: '/reports',
  noIndex: true,
})

/**
 * The owner's month in five numbers and three tables.
 *
 * Everything here reads through RLS, so the same page shows an owner their
 * whole organization and a moderator their own flat — the numbers narrow
 * with the role rather than the page changing.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { period?: string }
}) {
  await requirePermission('report.flat.view')

  const period = /^\d{4}-\d{2}-01$/.test(searchParams.period ?? '')
    ? searchParams.period!
    : periodOf()
  const earlier = previousPeriod(period)

  const [summary, lastMonth, trend, ageing, arrears, expenses] = await Promise.all([
    collectionForPeriod(period).catch(() => null),
    collectionForPeriod(earlier).catch(() => null),
    collectionTrend(12).catch(() => []),
    arrearsAgeing().catch(() => null),
    arrearsByFlat().catch(() => []),
    expenseBreakdown(period).catch(() => []),
  ])

  const change =
    summary && lastMonth ? monthOverMonth(summary.collected, lastMonth.collected) : null

  const spent = expenses.reduce((total, line) => total + line.total, 0)

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${periodLabel(period)} — collection, what is owed, and what the building spent.`}
        actions={
          <>
            <Link
              href={`/api/reports/ledger?period=${period}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Download /> Ledger CSV
            </Link>
            <Link
              href={`/api/reports/arrears?period=${period}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              <Download /> Arrears CSV
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Collected"
          value={formatTaka(summary?.collected ?? 0)}
          tone="paid"
          hint={
            change === null
              ? 'No comparison for last month'
              : `${change >= 0 ? '+' : ''}${change}% against ${periodLabel(earlier)}`
          }
        />
        <Stat
          label="Still owed this month"
          value={formatTaka(summary?.outstanding ?? 0)}
          tone={(summary?.outstanding ?? 0) > 0 ? 'due' : 'paid'}
          hint={`${summary?.rate ?? 0}% of ${formatTaka(summary?.billed ?? 0)} billed`}
        />
        <Stat
          label="Flats settled"
          value={`${summary?.flatsSettled ?? 0}/${summary?.flatsBilled ?? 0}`}
          hint="Nothing outstanding for the month"
        />
        <Stat
          label="Spent"
          value={formatTaka(spent)}
          hint={`${expenses.length} categories`}
        />
      </div>

      <section className="mt-10">
        <h2 className="text-title text-ink">Twelve months</h2>
        <p className="mt-1 text-sm text-muted">
          What was billed against what came in. A short bar with a tall shadow is a month
          that was chased late.
        </p>
        <div className="mt-4">
          {trend.length === 0 ? (
            <EmptyState
              title="Nothing billed yet"
              body="Bill a month and the shape appears here."
            />
          ) : (
            <BarSeries points={trend} />
          )}
        </div>
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="text-title text-ink">How old the arrears are</h2>
          <div className="mt-4">
            {ageing ? (
              <AgeingTable ageing={ageing} />
            ) : (
              <EmptyState title="Nothing outstanding" body="Every charge is settled." />
            )}
          </div>
        </section>

        <section>
          <h2 className="text-title text-ink">What was spent</h2>
          <div className="mt-4">
            {expenses.length === 0 ? (
              <EmptyState
                title="No expenses recorded"
                body="Shared bills and paid repairs appear here once they are entered."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Category</TH>
                    <TH>Items</TH>
                    <TH>Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {expenses.map((line) => (
                    <TR key={line.category}>
                      <TD className="capitalize">{line.category}</TD>
                      <TD className="tabular font-mono text-xs text-muted">
                        {line.count}
                      </TD>
                      <TD className="tabular font-mono">{formatTaka(line.total)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="text-title text-ink">Who owes what</h2>
        <p className="mt-1 text-sm text-muted">
          Worst first. The date is the oldest charge still unpaid, not the newest.
        </p>
        <div className="mt-4">
          {arrears.length === 0 ? (
            <EmptyState title="Nobody is behind" body="Every flat is settled." />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Flat</TH>
                  <TH>Building</TH>
                  <TH>Outstanding</TH>
                  <TH>Owed since</TH>
                  <TH>
                    <span className="sr-only">Statement</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {arrears.map((row) => (
                  <TR key={row.flatId}>
                    <TD className="tabular font-mono text-xs font-medium">
                      {row.unitNumber}
                    </TD>
                    <TD className="text-sm text-muted">{row.buildingName}</TD>
                    <TD className="tabular font-mono text-overdue">
                      {formatTaka(row.outstanding)}
                    </TD>
                    <TD>
                      {row.oldestDueDate ? (
                        <Badge tone="overdue" dot>
                          {row.oldestDueDate}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD>
                      <Link
                        href={`/api/statements/${row.flatId}?period=${period}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Statement
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </>
  )
}
