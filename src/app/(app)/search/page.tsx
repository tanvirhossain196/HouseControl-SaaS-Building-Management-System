import Link from 'next/link'
import { pageMetadata } from '@/lib/seo'
import { requireSession } from '@/lib/auth/session'
import { search } from '@/services/search.service'
import {
  highlight,
  isSearchable,
  KIND_LABELS,
  parseQuery,
  type SearchKind,
} from '@/lib/search'
import { PageHeader, EmptyState } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'

export const metadata = pageMetadata({
  title: 'Search',
  description: 'Everything you can see, in one place.',
  path: '/search',
  noIndex: true,
})

const ORDER: SearchKind[] = [
  'flat',
  'resident',
  'payment',
  'maintenance',
  'visitor',
  'building',
]

/**
 * The full-page version of the header search, for when the twelve results in
 * the dialog were not enough — and for the URL people share.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  await requireSession('/search')

  const query = (searchParams.q ?? '').slice(0, 120)
  const { fields } = parseQuery(query)
  const results = isSearchable(query)
    ? await search(query, 60).catch(() => ({ query, hits: [], truncated: false }))
    : { query, hits: [], truncated: false }

  const grouped = ORDER.map((kind) => ({
    kind,
    hits: results.hits.filter((hit) => hit.kind === kind),
  })).filter((group) => group.hits.length > 0)

  return (
    <>
      <PageHeader
        title={query ? `“${query}”` : 'Search'}
        description={
          results.hits.length > 0
            ? `${results.hits.length} result${results.hits.length === 1 ? '' : 's'}${results.truncated ? ', showing the closest' : ''}`
            : 'Flats, residents, payments, repairs, visitors and buildings.'
        }
      />

      {Object.keys(fields).length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {Object.entries(fields).map(([field, value]) => (
            <Badge key={field} tone="primary">
              {field}: {value}
            </Badge>
          ))}
        </div>
      )}

      {!isSearchable(query) ? (
        <EmptyState
          title="Type at least two characters"
          body="Try a unit number, someone's name, a receipt like HC-2609-0004, or a repair like MR-0007. You can narrow it with flat:5B or status:open."
        />
      ) : grouped.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          body="Nothing you have access to matches that. A resident sees their own flat, so a colleague may find something you cannot."
        />
      ) : (
        <div className="space-y-10">
          {grouped.map((group) => (
            <section key={group.kind}>
              <h2 className="text-title text-ink">{KIND_LABELS[group.kind]}s</h2>
              <ul className="mt-4 divide-y divide-line rounded-panel border border-line bg-surface">
                {group.hits.map((hit) => (
                  <li key={hit.id}>
                    <Link
                      href={hit.href}
                      className="flex items-center gap-3 p-4 transition-colors hover:bg-raised/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">
                          {highlight(hit.title, parseQuery(query).text).map(
                            (segment, index) => (
                              <span
                                key={index}
                                className={
                                  segment.match ? 'font-semibold text-primary' : undefined
                                }
                              >
                                {segment.text}
                              </span>
                            ),
                          )}
                        </span>
                        {hit.subtitle && (
                          <span className="block truncate text-xs text-muted">
                            {hit.subtitle}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
