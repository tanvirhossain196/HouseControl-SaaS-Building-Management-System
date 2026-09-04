import 'server-only'

import { createServerSupabase } from '@/lib/supabase/server'
import {
  isSearchable,
  likePattern,
  parseQuery,
  rankHits,
  scoreHit,
  type SearchHit,
} from '@/lib/search'
import { formatTaka } from '@/lib/utils'

/**
 * Search across everything the caller is allowed to see.
 *
 * Six small queries rather than one clever join or a materialised search
 * table. Two reasons: each table's RLS policy applies to its own query, so a
 * resident searching "5B" gets their own flat and not the building's, and a
 * failure in one area returns the other five rather than an empty screen.
 *
 * Every user string goes through `likePattern`, which escapes the wildcards
 * `ilike` would otherwise honour.
 */

const PER_KIND = 5

async function safely<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work()
  } catch (error) {
    console.error('[search]', error)
    return fallback
  }
}

export type SearchResults = {
  query: string
  hits: SearchHit[]
  truncated: boolean
}

export async function search(rawQuery: string, limit = 20): Promise<SearchResults> {
  const { text, fields } = parseQuery(rawQuery)
  const term = text || fields.flat || ''

  if (!isSearchable(term)) return { query: rawQuery, hits: [], truncated: false }

  const pattern = likePattern(term)

  const [flats, residents, payments, visitors, repairs, buildings] = await Promise.all([
    searchFlats(pattern, term, fields),
    searchResidents(pattern, term),
    searchPayments(pattern, term),
    searchVisitors(pattern, term),
    searchRepairs(pattern, term, fields),
    searchBuildings(pattern, term),
  ])

  const all = rankHits([
    ...flats,
    ...residents,
    ...payments,
    ...visitors,
    ...repairs,
    ...buildings,
  ])

  return {
    query: rawQuery,
    hits: all.slice(0, limit),
    truncated: all.length > limit,
  }
}

async function searchFlats(
  pattern: string,
  term: string,
  fields: Record<string, string>,
): Promise<SearchHit[]> {
  return safely(async () => {
    const supabase = createServerSupabase()

    let query = supabase
      .from('flats')
      .select('id, unit_number, floor, occupancy_status, monthly_rent, buildings(name)')
      .ilike('unit_number', fields.flat ? likePattern(fields.flat) : pattern)
      .is('archived_at', null)
      .limit(PER_KIND)

    if (fields.building) {
      query = query.ilike('buildings.name', likePattern(fields.building))
    }

    const { data } = await query

    // Embedded selects are not expressible in the hand-written Database type.
    const rows = (data ?? []) as unknown as {
      id: string
      unit_number: string
      floor: number
      occupancy_status: string
      monthly_rent: number
      buildings: { name: string } | null
    }[]

    return rows.map((flat) => ({
      kind: 'flat' as const,
      id: flat.id,
      title: `Flat ${flat.unit_number}`,
      subtitle: `${flat.buildings?.name ?? 'Building'} · ${flat.occupancy_status} · ${formatTaka(Number(flat.monthly_rent))}`,
      href: `/flats/${flat.id}`,
      score: scoreHit(flat.unit_number, term),
    }))
  }, [])
}

async function searchResidents(pattern: string, term: string): Promise<SearchHit[]> {
  return safely(async () => {
    const supabase = createServerSupabase()

    // Phone numbers are searched as written and as typed: someone looking for
    // 01712345678 should find a profile stored as +8801712345678.
    const digits = term.replace(/\D/g, '')

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .or(
        digits.length >= 4
          ? `full_name.ilike.${pattern},phone.ilike.${likePattern(digits)}`
          : `full_name.ilike.${pattern},email.ilike.${pattern}`,
      )
      .limit(PER_KIND)

    return (data ?? []).map((person) => ({
      kind: 'resident' as const,
      id: person.id,
      title: person.full_name,
      subtitle: person.phone ?? person.email,
      href: `/admin/residents?q=${encodeURIComponent(person.full_name)}`,
      score: scoreHit(person.full_name, term),
    }))
  }, [])
}

async function searchPayments(pattern: string, term: string): Promise<SearchHit[]> {
  return safely(async () => {
    const supabase = createServerSupabase()

    const { data } = await supabase
      .from('payments')
      .select(
        'id, amount, method, paid_at, receipt_no, reference, status, flats(unit_number)',
      )
      .or(
        `receipt_no.ilike.${pattern},reference.ilike.${pattern},transaction_id.ilike.${pattern}`,
      )
      .limit(PER_KIND)

    const rows = (data ?? []) as unknown as {
      id: string
      amount: number
      method: string
      paid_at: string
      receipt_no: string | null
      reference: string | null
      status: string
      flats: { unit_number: string } | null
    }[]

    return rows.map((payment) => ({
      kind: 'payment' as const,
      id: payment.id,
      title:
        payment.receipt_no ?? payment.reference ?? formatTaka(Number(payment.amount)),
      subtitle: `${formatTaka(Number(payment.amount))} · ${payment.status} · flat ${payment.flats?.unit_number ?? '—'} · ${payment.paid_at}`,
      href: payment.receipt_no ? `/api/receipts/${payment.id}` : '/payments',
      score: scoreHit(payment.receipt_no ?? payment.reference ?? '', term),
    }))
  }, [])
}

async function searchVisitors(pattern: string, term: string): Promise<SearchHit[]> {
  return safely(async () => {
    const supabase = createServerSupabase()

    const { data } = await supabase
      .from('visitors')
      .select('id, full_name, phone, state, entered_at, flats(unit_number)')
      .ilike('full_name', pattern)
      .order('entered_at', { ascending: false })
      .limit(PER_KIND)

    const rows = (data ?? []) as unknown as {
      id: string
      full_name: string
      phone: string | null
      state: string
      entered_at: string | null
      flats: { unit_number: string } | null
    }[]

    return rows.map((visitor) => ({
      kind: 'visitor' as const,
      id: visitor.id,
      title: visitor.full_name,
      subtitle: `${visitor.state} · flat ${visitor.flats?.unit_number ?? 'building'}${visitor.entered_at ? ` · ${visitor.entered_at.slice(0, 10)}` : ''}`,
      href: '/gate',
      score: scoreHit(visitor.full_name, term),
    }))
  }, [])
}

async function searchRepairs(
  pattern: string,
  term: string,
  fields: Record<string, string>,
): Promise<SearchHit[]> {
  return safely(async () => {
    const supabase = createServerSupabase()

    let query = supabase
      .from('maintenance_requests')
      .select('id, reference, title, status, priority, flats(unit_number)')
      .or(`title.ilike.${pattern},reference.ilike.${pattern}`)
      .limit(PER_KIND)

    // Only values the column actually holds; anything else is ignored rather
    // than sent to Postgres as an enum it would reject.
    const statuses = ['open', 'in_progress', 'resolved', 'cancelled'] as const
    const priorities = ['low', 'normal', 'high', 'urgent'] as const

    const status = statuses.find((value) => value === fields.status)
    const priority = priorities.find((value) => value === fields.priority)

    if (status) query = query.eq('status', status)
    if (priority) query = query.eq('priority', priority)

    const { data } = await query

    const rows = (data ?? []) as unknown as {
      id: string
      reference: string
      title: string
      status: string
      priority: string
      flats: { unit_number: string } | null
    }[]

    return rows.map((request) => ({
      kind: 'maintenance' as const,
      id: request.id,
      title: `${request.reference} — ${request.title}`,
      subtitle: `${request.status.replace('_', ' ')} · ${request.priority} · flat ${request.flats?.unit_number ?? 'building'}`,
      href: `/maintenance/${request.id}`,
      score: Math.max(scoreHit(request.reference, term), scoreHit(request.title, term)),
    }))
  }, [])
}

async function searchBuildings(pattern: string, term: string): Promise<SearchHit[]> {
  return safely(async () => {
    const supabase = createServerSupabase()

    const { data } = await supabase
      .from('buildings')
      .select('id, name, address_line, area, city')
      .or(`name.ilike.${pattern},area.ilike.${pattern},address_line.ilike.${pattern}`)
      .is('archived_at', null)
      .limit(PER_KIND)

    return (data ?? []).map((building) => ({
      kind: 'building' as const,
      id: building.id,
      title: building.name,
      subtitle: `${building.address_line}${building.area ? `, ${building.area}` : ''}, ${building.city}`,
      href: `/admin/buildings/${building.id}`,
      score: scoreHit(building.name, term),
    }))
  }, [])
}
