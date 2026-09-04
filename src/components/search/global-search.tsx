'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { highlight, isSearchable, KIND_LABELS, type SearchHit } from '@/lib/search'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * The search box in the header.
 *
 * Opens on ⌘K or /, closes on Escape, and moves through results with the
 * arrow keys — the three habits people bring from every other tool. The
 * request is debounced and the older one is aborted, so typing quickly does
 * not leave a stale response overwriting a newer one.
 */
export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState<SearchHit[]>([])
  const [loading, setLoading] = React.useState(false)
  const [active, setActive] = React.useState(0)

  const inputRef = React.useRef<HTMLInputElement>(null)
  const debounced = useDebouncedValue(query, 220)

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typingElsewhere =
        event.target instanceof HTMLElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)

      if (
        (event.key === 'k' && (event.metaKey || event.ctrlKey)) ||
        (event.key === '/' && !typingElsewhere)
      ) {
        event.preventDefault()
        setOpen(true)
        window.setTimeout(() => inputRef.current?.focus(), 0)
      }

      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  React.useEffect(() => {
    if (!isSearchable(debounced)) {
      setHits([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)

    fetch(`/api/search?q=${encodeURIComponent(debounced)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.ok) {
          setHits(payload.data.hits ?? [])
          setActive(0)
        }
      })
      .catch(() => {
        // An aborted request is the normal case while typing.
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [debounced])

  function go(hit: SearchHit | undefined) {
    if (!hit) return
    setOpen(false)
    setQuery('')
    router.push(hit.href)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          window.setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm text-muted transition-colors hover:border-ink/20 hover:text-ink"
        aria-label="Search"
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden sm:inline">Search</span>
        <kbd className="tabular hidden rounded border border-line px-1 font-mono text-[0.65rem] sm:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]">
          <div
            className="absolute inset-0 animate-fade-in bg-ink/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            className="relative w-full max-w-xl animate-scale-in overflow-hidden rounded-sheet border border-line bg-surface shadow-lift"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              {loading ? (
                <Loader2 className="size-4 animate-spin text-muted" aria-hidden />
              ) : (
                <Search className="size-4 text-muted" aria-hidden />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setActive((index) => Math.min(index + 1, hits.length - 1))
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setActive((index) => Math.max(index - 1, 0))
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    if (hits.length > 0) go(hits[active])
                    else if (query.trim()) {
                      setOpen(false)
                      router.push(`/search?q=${encodeURIComponent(query)}`)
                    }
                  }
                }}
                placeholder="Flat 5B, Shirin, MR-0007, HC-2609-0004…"
                aria-label="Search everything"
                className="h-14 flex-1 bg-transparent text-[0.95rem] text-ink outline-none placeholder:text-muted/70"
              />
            </div>

            {hits.length > 0 ? (
              <ul className="max-h-[52vh] overflow-y-auto p-2">
                {hits.map((hit, index) => (
                  <li key={`${hit.kind}-${hit.id}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(hit)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition-colors',
                        index === active ? 'bg-raised' : 'hover:bg-raised/60',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">
                          {highlight(hit.title, query).map((segment, position) => (
                            <span
                              key={position}
                              className={
                                segment.match ? 'font-semibold text-primary' : undefined
                              }
                            >
                              {segment.text}
                            </span>
                          ))}
                        </span>
                        {hit.subtitle && (
                          <span className="block truncate text-xs text-muted">
                            {hit.subtitle}
                          </span>
                        )}
                      </span>
                      <Badge tone="neutral">{KIND_LABELS[hit.kind]}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-muted">
                {isSearchable(query)
                  ? loading
                    ? 'Looking…'
                    : 'Nothing matches. Try a unit number, a name, or a reference like MR-0007.'
                  : 'Type at least two characters. You can also filter: flat:5B, status:open.'}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
