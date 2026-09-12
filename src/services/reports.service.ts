import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import { toAppError } from '@/lib/errors'
import { periodOf, previousPeriod, todayInDhaka } from '@/lib/billing'
import {
  ageArrears,
  buildStatement,
  collectionRate,
  fillMonths,
  sumTaka,
  type Ageing,
  type MonthlyPoint,
  type Statement,
  type StatementLine,
} from '@/lib/reports'

/**
 * Reports.
 *
 * Every query runs as the signed-in user, so the same function answers three
 * different questions: an owner's report covers their organization, a
 * moderator's their flat, a resident's their own charges. There is no scope
 * parameter to get wrong, because RLS is doing the scoping.
 *
 * Arithmetic lives in `lib/reports.ts` and is tested there; this file only
 * fetches and hands over.
 */

type DueRecord = {
  id: string
  flat_id: string
  user_id: string | null
  amount: number
  amount_paid: number
  due_date: string
  period: string
  status: string
  description: string | null
  source: string
}

type PaymentRecord = {
  id: string
  flat_id: string
  amount: number
  paid_at: string
  status: string
  method: string
  receipt_no: string | null
  due_id: string | null
}

export type CollectionSummary = {
  period: string
  billed: number
  collected: number
  outstanding: number
  rate: number
  flatsBilled: number
  flatsSettled: number
}

/** How one month went, for everything the caller can see. */
export async function collectionForPeriod(
  period = periodOf(),
): Promise<CollectionSummary> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('dues')
    .select('flat_id, amount, amount_paid, status')
    .eq('period', period)

  if (error) throw toAppError(error)

  const rows = data ?? []
  const billed = sumTaka(rows.map((row) => Number(row.amount)))
  const collected = sumTaka(rows.map((row) => Number(row.amount_paid)))

  const flats = new Set(rows.map((row) => row.flat_id))
  const unsettled = new Set(
    rows
      .filter((row) => row.status !== 'paid' && row.status !== 'waived')
      .map((row) => row.flat_id),
  )

  return {
    period,
    billed,
    collected,
    outstanding: sumTaka([billed, -collected]),
    rate: collectionRate(billed, collected),
    flatsBilled: flats.size,
    flatsSettled: flats.size - unsettled.size,
  }
}

/** Twelve months of billing and collection, with empty months kept. */
export async function collectionTrend(months = 12): Promise<MonthlyPoint[]> {
  const supabase = createServerSupabase()

  let from = periodOf()
  for (let index = 1; index < months; index += 1) from = previousPeriod(from)

  const { data, error } = await supabase
    .from('dues')
    .select('period, amount, amount_paid')
    .gte('period', from)
    .order('period')

  if (error) throw toAppError(error)

  const grouped = new Map<string, { billed: number[]; collected: number[] }>()
  for (const row of data ?? []) {
    const bucket = grouped.get(row.period) ?? { billed: [], collected: [] }
    bucket.billed.push(Number(row.amount))
    bucket.collected.push(Number(row.amount_paid))
    grouped.set(row.period, bucket)
  }

  const points: MonthlyPoint[] = [...grouped.entries()].map(([period, bucket]) => ({
    period,
    billed: sumTaka(bucket.billed),
    collected: sumTaka(bucket.collected),
  }))

  return fillMonths(points, from.slice(0, 7), periodOf().slice(0, 7))
}

/** Everything still owed, by how late it is. */
export async function arrearsAgeing(asOf = todayInDhaka()): Promise<Ageing> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('dues')
    .select('amount, amount_paid, due_date')
    .in('status', ['open', 'partially_paid'])

  if (error) throw toAppError(error)

  return ageArrears(
    (data ?? []).map((row) => ({
      dueDate: row.due_date,
      outstanding: Number(row.amount) - Number(row.amount_paid),
    })),
    asOf,
  )
}

export type FlatArrears = {
  flatId: string
  unitNumber: string
  buildingName: string
  outstanding: number
  oldestDueDate: string | null
}

/** Who owes what, worst first — the list an owner works down. */
export async function arrearsByFlat(): Promise<FlatArrears[]> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('dues')
    .select('flat_id, amount, amount_paid, due_date, flats(unit_number, buildings(name))')
    .in('status', ['open', 'partially_paid'])

  if (error) throw toAppError(error)

  // Embedded selects are not expressible in the hand-written Database type.
  const rows = (data ?? []) as unknown as (DueRecord & {
    flats: { unit_number: string; buildings: { name: string } | null } | null
  })[]

  const byFlat = new Map<string, FlatArrears & { amounts: number[] }>()

  for (const row of rows) {
    const outstanding = Number(row.amount) - Number(row.amount_paid)
    if (outstanding <= 0) continue

    const existing = byFlat.get(row.flat_id) ?? {
      flatId: row.flat_id,
      unitNumber: row.flats?.unit_number ?? '—',
      buildingName: row.flats?.buildings?.name ?? '',
      outstanding: 0,
      oldestDueDate: null,
      amounts: [],
    }

    existing.amounts.push(outstanding)
    if (!existing.oldestDueDate || row.due_date < existing.oldestDueDate) {
      existing.oldestDueDate = row.due_date
    }

    byFlat.set(row.flat_id, existing)
  }

  return [...byFlat.values()]
    .map(({ amounts, ...flat }) => ({ ...flat, outstanding: sumTaka(amounts) }))
    .sort((a, b) => b.outstanding - a.outstanding)
}

export type ExpenseLine = {
  category: string
  total: number
  count: number
}

/** What the building spent, by category, for a month. */
export async function expenseBreakdown(period = periodOf()): Promise<ExpenseLine[]> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('expenses')
    .select('category, amount')
    .eq('period', period)

  if (error) throw toAppError(error)

  const grouped = new Map<string, number[]>()
  for (const row of data ?? []) {
    grouped.set(row.category, [...(grouped.get(row.category) ?? []), Number(row.amount)])
  }

  return [...grouped.entries()]
    .map(([category, amounts]) => ({
      category,
      total: sumTaka(amounts),
      count: amounts.length,
    }))
    .sort((a, b) => b.total - a.total)
}

export type FlatStatement = Statement & {
  flatId: string
  unitNumber: string
  buildingName: string
  from: string
  to: string
}

/**
 * A running statement for one flat.
 *
 * The opening balance is everything charged before the window minus
 * everything paid before it, so the statement balances against the ledger
 * rather than starting from zero and pretending history began in January.
 */
export async function flatStatement(
  flatId: string,
  from: string,
  to: string,
): Promise<FlatStatement> {
  const supabase = createServerSupabase()

  const [{ data: flat }, { data: dues }, { data: payments }] = await Promise.all([
    supabase
      .from('flats')
      .select('id, unit_number, buildings(name)')
      .eq('id', flatId)
      .maybeSingle(),
    supabase
      .from('dues')
      .select('id, amount, amount_paid, due_date, period, description, source, status')
      .eq('flat_id', flatId)
      .order('due_date'),
    supabase
      .from('payments')
      .select('id, amount, paid_at, status, method, receipt_no, due_id')
      .eq('flat_id', flatId)
      .eq('status', 'confirmed')
      .order('paid_at'),
  ])

  const flatRow = flat as unknown as {
    unit_number: string
    buildings: { name: string } | null
  } | null

  const dueRows = (dues ?? []) as unknown as DueRecord[]
  const paymentRows = (payments ?? []) as unknown as PaymentRecord[]

  const before = {
    charges: dueRows
      .filter((due) => due.due_date < from)
      .map((due) => Number(due.amount)),
    payments: paymentRows
      .filter((payment) => payment.paid_at < from)
      .map((payment) => Number(payment.amount)),
  }

  const opening = sumTaka([
    ...before.charges,
    ...before.payments.map((amount) => -amount),
  ])

  const lines: StatementLine[] = [
    ...dueRows
      .filter(
        (due) => due.due_date >= from && due.due_date <= to && due.status !== 'waived',
      )
      .map((due) => ({
        date: due.due_date,
        description: due.description ?? `${due.source} · ${due.period.slice(0, 7)}`,
        charge: Number(due.amount),
        payment: 0,
      })),
    ...paymentRows
      .filter((payment) => payment.paid_at >= from && payment.paid_at <= to)
      .map((payment) => ({
        date: payment.paid_at,
        description: `Payment received (${payment.method.replace('_', ' ')})`,
        charge: 0,
        payment: Number(payment.amount),
        reference: payment.receipt_no,
      })),
  ]

  return {
    ...buildStatement(opening, lines),
    flatId,
    unitNumber: flatRow?.unit_number ?? '—',
    buildingName: flatRow?.buildings?.name ?? '',
    from,
    to,
  }
}

export type LedgerRow = {
  date: string
  unit: string
  resident: string
  description: string
  charged: number
  paid: number
  status: string
  receipt: string
}

/** The flat export: every charge in a period, with what has been paid against it. */
export async function ledgerRows(period = periodOf()): Promise<LedgerRow[]> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('dues')
    .select(
      // profiles is ambiguous on dues (user_id and created_by), so name the column.
      'amount, amount_paid, due_date, description, source, status, flats(unit_number), resident:profiles!user_id(full_name)',
    )
    .eq('period', period)
    .order('due_date')

  if (error) throw toAppError(error)

  const rows = (data ?? []) as unknown as (DueRecord & {
    flats: { unit_number: string } | null
    resident: { full_name: string } | null
  })[]

  return rows.map((row) => ({
    date: row.due_date,
    unit: row.flats?.unit_number ?? '',
    resident: row.resident?.full_name ?? 'Unassigned',
    description: row.description ?? row.source,
    charged: Number(row.amount),
    paid: Number(row.amount_paid),
    status: row.status,
    receipt: '',
  }))
}