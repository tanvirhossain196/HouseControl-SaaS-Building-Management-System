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
 * Opens on ⌘K or /, closes on Escape, and moves through results with the arrow
 * keys — the three habits people bring from every other tool. The request is
 * debounced and the older one aborted, so typing quickly cannot leave a stale
 * response overwriting a newer one.
 *
 * The field lives in the bar, not under it. Opening replaces the button with
 * an input in the same flex row, so the header rearranges rather than growing a
 * floating panel — search reads as part of the chrome instead of a dialog that
 * happens to be near it.
 *
 * On a phone the input takes a full-width row of its own beneath the icons: the
 * navbar gets taller, which is the honest way to fit a text field on 360px.
 * Only the results hang below, because a list of hits genuinely is an overlay.
 */
export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState<SearchHit[]>([])
  const [loading, setLoading] = React.useState(false)
  const [active, setActive] = React.useState(0)

  const inputRef = React.useRef<HTMLInputElement>(null)
  const fieldRef = React.useRef<HTMLDivElement>(null)
  const debounced = useDebouncedValue(query, 220)

  /**
   * Close on a click anywhere else.
   *
   * This used to be a full-screen scrim, which closed the field but also dimmed
   * the page behind it — and a dimmed page is the language of a modal. Search is
   * not modal: it sits in the bar, and the rest of the screen should carry on
   * looking usable while it is open.
   *
   * mousedown rather than click, so a press that starts outside dismisses
   * immediately instead of waiting for the release.
   */
  React.useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!fieldRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

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
    <div className="contents">
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            window.setTimeout(() => inputRef.current?.focus(), 0)
          }}
          className="inline-flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-sm text-muted transition-colors hover:border-ink/20 hover:text-ink sm:px-3"
          aria-label="Search"
        >
          <Search className="size-4" aria-hidden />
          <span className="hidden md:inline">Search</span>
          <kbd className="tabular hidden rounded border border-line px-1 font-mono text-[0.65rem] md:inline">
            ⌘K
          </kbd>
        </button>
      )}

      {open && (
        <>
          <div
            ref={fieldRef}
            role="search"
            /*
              `basis-full order-last` puts it on its own row below the icons on a
              phone, which is what makes the navbar taller. From `sm` up it
              returns to the icon row and takes a fixed, comfortable width.
            */
            className="relative z-50 order-last mt-2 w-full basis-full sm:order-none sm:mt-0 sm:w-auto sm:max-w-none sm:flex-1 sm:basis-auto lg:max-w-[26rem]"
          >
            {/*
              Quiet by default, lit only while focused. A permanent ring and a
              drop shadow made the field read as a panel that had landed on the
              bar; the point is for it to look like part of it.
            */}
            {/*
              The focus state belongs to this box, not to the input inside it.
              globals.css gives every focusable element a 2px ring, which drew a
              second bordered rectangle inside this one — so the input's ring is
              switched off and the container lights up instead.
            */}
            <div className="flex h-9 items-center gap-2.5 rounded-control border border-line bg-raised/70 px-3 transition-colors focus-within:border-primary/45 focus-within:bg-surface">
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
                className="h-full flex-1 bg-transparent text-sm text-ink outline-none ring-0 ring-offset-0 placeholder:text-muted/70 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            {/*
              The results do float — a list of hits is genuinely an overlay, and
              growing the header by six rows as somebody types would push the
              page around under them. It hangs from the field, so the connection
              to what was typed stays obvious.
            */}
            <div className="absolute inset-x-0 top-full z-50 mt-1.5 animate-scale-in overflow-hidden rounded-control border border-line bg-surface shadow-panel">
              {hits.length > 0 ? (
                <ul className="max-h-[60dvh] overflow-y-auto p-2 sm:max-h-[52vh]">
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
                <p className="px-4 py-5 text-sm text-muted">
                  {isSearchable(query)
                    ? loading
                      ? 'Looking…'
                      : 'Nothing matches. Try a unit number, a name, or a reference like MR-0007.'
                    : 'Type at least two characters. You can also filter: flat:5B, status:open.'}
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
