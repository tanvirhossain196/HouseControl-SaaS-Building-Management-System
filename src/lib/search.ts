/**
 * Search: parsing what someone typed, and making it safe to hand to Postgres.
 *
 * Two things here are load-bearing. The escaping, because a search box is the
 * most-used untrusted input in the app and `ilike` treats `%` as "everything".
 * And the parsing, because people type `5B overdue` and `flat:5B status:open`
 * and both should work without a syntax lesson.
 *
 * Pure. `npm run test:search` covers it.
 */

export type SearchFilters = {
  /** Free text, with any field filters removed. */
  text: string
  /** Recognised `field:value` pairs. */
  fields: Record<string, string>
}

/** Filters the app understands. Anything else stays as free text. */
export const FILTER_FIELDS = ['flat', 'status', 'building', 'method', 'priority'] as const
export type FilterField = (typeof FILTER_FIELDS)[number]

const FIELD_PATTERN = /(\w+):("[^"]*"|\S+)/g

/**
 * Splits `overdue flat:5B "gas share"` into filters and free text.
 *
 * An unknown field — `colour:blue` — is left in the free text rather than
 * silently dropped. Dropping it would return results that ignore half of
 * what the person asked for, which reads as a bug.
 */
export function parseQuery(input: string): SearchFilters {
  const fields: Record<string, string> = {}
  let text = input

  for (const match of input.matchAll(FIELD_PATTERN)) {
    const [whole, rawField, rawValue] = match
    const field = (rawField ?? '').toLowerCase()

    if (!FILTER_FIELDS.includes(field as FilterField)) continue

    fields[field] = (rawValue ?? '').replace(/^"|"$/g, '')
    text = text.replace(whole, ' ')
  }

  return { text: text.replace(/\s+/g, ' ').trim(), fields }
}

/**
 * Escapes a value for a Postgres `ilike` pattern.
 *
 * `%` and `_` are wildcards there. Someone searching for the literal string
 * `100%` should not get every row in the table, and someone searching `_`
 * should not match every single character.
 */
export function escapeLike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

/** A contains-match pattern, escaped and wrapped. */
export function likePattern(value: string): string {
  return `%${escapeLike(value.trim())}%`
}

/**
 * Whether a query is worth sending to the database.
 *
 * One character matches most of a building and costs a full scan on every
 * table. Two is the floor, except for unit numbers, which are genuinely one
 * or two characters — so a digit or a letter-digit pair passes.
 */
export function isSearchable(query: string): boolean {
  const trimmed = query.trim()
  if (trimmed.length >= 2) return true
  return /^\d$/.test(trimmed)
}

export type SearchKind =
  'flat' | 'resident' | 'payment' | 'visitor' | 'maintenance' | 'building'

export type SearchHit = {
  kind: SearchKind
  id: string
  title: string
  subtitle: string | null
  href: string
  /** Higher is better. */
  score: number
}

/**
 * How well a hit matches, so an exact unit number beats a name that merely
 * contains the same letters.
 *
 * Exact match, then prefix, then word-start, then anywhere. Shorter titles
 * win ties: "5B" is a better answer for "5b" than "Flat 5B extension".
 */
export function scoreHit(title: string, query: string): number {
  const haystack = title.toLowerCase()
  const needle = query.trim().toLowerCase()

  if (!needle) return 0
  if (haystack === needle) return 100
  if (haystack.startsWith(needle))
    return 80 - Math.min(20, haystack.length - needle.length)

  const wordStart = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  if (wordStart.test(haystack)) return 60

  if (haystack.includes(needle)) return 40
  return 10
}

/** Kind order for ties: what people are most often looking for. */
const KIND_RANK: Record<SearchKind, number> = {
  flat: 0,
  resident: 1,
  payment: 2,
  maintenance: 3,
  visitor: 4,
  building: 5,
}

export function rankHits(hits: SearchHit[]): SearchHit[] {
  return [...hits].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (KIND_RANK[a.kind] !== KIND_RANK[b.kind])
      return KIND_RANK[a.kind] - KIND_RANK[b.kind]
    return a.title.localeCompare(b.title, 'en', { numeric: true })
  })
}

export const KIND_LABELS: Record<SearchKind, string> = {
  flat: 'Flat',
  resident: 'Resident',
  payment: 'Payment',
  visitor: 'Visitor',
  maintenance: 'Repair',
  building: 'Building',
}

// ---------------------------------------------------------------------------
// Highlighting
// ---------------------------------------------------------------------------

export type Segment = { text: string; match: boolean }

/**
 * Splits a title into matched and unmatched runs, for bolding in the results.
 *
 * Returns segments rather than HTML so nothing has to be dangerously set —
 * a resident named `<script>` is a string here and stays one.
 */
export function highlight(title: string, query: string): Segment[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [{ text: title, match: false }]

  const segments: Segment[] = []
  const haystack = title.toLowerCase()
  let index = 0

  while (index < title.length) {
    const found = haystack.indexOf(needle, index)
    if (found === -1) {
      segments.push({ text: title.slice(index), match: false })
      break
    }

    if (found > index) segments.push({ text: title.slice(index, found), match: false })
    segments.push({ text: title.slice(found, found + needle.length), match: true })
    index = found + needle.length
  }

  return segments.filter((segment) => segment.text.length > 0)
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export type Page = {
  page: number
  perPage: number
  offset: number
  totalPages: number
  hasPrevious: boolean
  hasNext: boolean
}

/**
 * Turns a page number and a total into everything a list screen needs.
 *
 * Out-of-range pages are clamped rather than erroring: `?page=99` on a
 * two-page list should show page two, not a stack trace, because that URL
 * arrives whenever someone deletes a row while a link is being shared.
 */
export function paginate(total: number, page = 1, perPage = 20): Page {
  const size = Math.min(Math.max(1, Math.trunc(perPage)), 100)
  const totalPages = Math.max(1, Math.ceil(total / size))
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages)

  return {
    page: current,
    perPage: size,
    offset: (current - 1) * size,
    totalPages,
    hasPrevious: current > 1,
    hasNext: current < totalPages,
  }
}

/**
 * Sort keys are whitelisted per screen, never taken from the URL raw.
 *
 * `?sort=` goes straight into an `order()` call, and an unchecked column
 * name there is a way to read the shape of tables the caller cannot select.
 */
export function parseSort<T extends string>(
  requested: string | null | undefined,
  allowed: readonly T[],
  fallback: { column: T; ascending: boolean },
): { column: T; ascending: boolean } {
  if (!requested) return fallback

  const descending = requested.startsWith('-')
  const column = (descending ? requested.slice(1) : requested) as T

  if (!allowed.includes(column)) return fallback
  return { column, ascending: !descending }
}

/** Builds a query string that keeps the filters people already set. */
export function withParams(
  current: URLSearchParams | Record<string, string | undefined>,
  changes: Record<string, string | number | null | undefined>,
): string {
  const params =
    current instanceof URLSearchParams
      ? new URLSearchParams(current)
      : new URLSearchParams(
          Object.entries(current).filter((entry): entry is [string, string] =>
            Boolean(entry[1]),
          ),
        )

  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === '') params.delete(key)
    else params.set(key, String(value))
  }

  const query = params.toString()
  return query ? `?${query}` : ''
}
