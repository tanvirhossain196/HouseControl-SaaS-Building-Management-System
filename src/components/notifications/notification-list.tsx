'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCheck } from 'lucide-react'

import {
  markAllReadAction,
  markReadAction,
} from '@/app/(app)/settings/notifications/actions'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/layout/page-header'
import { FilterChips } from '@/components/ui/filter-chips'
import { useToast } from '@/components/providers/toast-provider'
import { cn } from '@/lib/utils'
import type { NotificationRow } from '@/types'

/**
 * Everything that has been sent to this person.
 *
 * Opening a notification marks it read and follows its link, because those are
 * the same intention — nobody reads a notification in order to leave it unread.
 * Ones without a link are marked on click and stay put.
 *
 * The list is not re-sorted by read state. A record that rearranges itself
 * under the cursor is a record people stop trusting; unread ones are tinted
 * instead, and the filter is there for when only those matter.
 */
const CATEGORIES: Array<{ value: string; label: string; prefixes: string[] }> = [
  { value: 'money', label: 'Money', prefixes: ['due.', 'payment.', 'subscription.'] },
  { value: 'people', label: 'People', prefixes: ['invite.', 'resident.', 'moderator.'] },
  { value: 'gate', label: 'Gate', prefixes: ['visitor.'] },
  { value: 'repairs', label: 'Repairs', prefixes: ['maintenance.'] },
]

function categoryOf(event: string): string {
  return (
    CATEGORIES.find((category) =>
      category.prefixes.some((prefix) => event.startsWith(prefix)),
    )?.value ?? 'other'
  )
}

export function NotificationList({
  notifications,
}: {
  notifications: NotificationRow[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = React.useState(false)
  const [unreadOnly, setUnreadOnly] = React.useState(false)
  const [category, setCategory] = React.useState<string | null>(null)

  const unread = notifications.filter((row) => !row.read_at).length

  const visible = React.useMemo(
    () =>
      notifications
        .filter((row) => !unreadOnly || !row.read_at)
        .filter((row) => category === null || categoryOf(row.event) === category),
    [notifications, unreadOnly, category],
  )

  const options = React.useMemo(
    () =>
      CATEGORIES.map((entry) => ({
        value: entry.value,
        label: entry.label,
        count: notifications.filter((row) => categoryOf(row.event) === entry.value)
          .length,
      })),
    [notifications],
  )

  async function open(row: NotificationRow) {
    if (!row.read_at) {
      await markReadAction([row.id])
      router.refresh()
    }

    if (row.link) router.push(row.link)
  }

  async function readEverything() {
    if (pending || unread === 0) return

    setPending(true)
    const result = await markAllReadAction()
    setPending(false)

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not mark them read', body: result.error })
      return
    }

    router.refresh()
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        title="Nothing yet"
        body="Rent billed, payments confirmed, invites accepted, someone at the gate — anything worth knowing shows up here."
      />
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          label="About"
          allLabel="Everything"
          value={category}
          onChange={setCategory}
          options={options}
        />

        <div className="flex items-center gap-2">
          <Button
            variant={unreadOnly ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setUnreadOnly(!unreadOnly)}
          >
            Unread{unread > 0 ? ` (${unread})` : ''}
          </Button>

          {unread > 0 && (
            <Button variant="quiet" size="sm" loading={pending} onClick={readEverything}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nothing here"
            body="No notification matches those filters. Clear one to widen it."
          />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-panel border border-line bg-surface">
          {visible.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => open(row)}
                className={cn(
                  'flex w-full items-start gap-3 px-5 py-4 text-left transition-colors hover:bg-raised/60',
                  !row.read_at && 'bg-primary-soft/30',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 size-1.5 shrink-0 rounded-full',
                    row.read_at ? 'bg-transparent' : 'bg-primary',
                  )}
                />

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{row.title}</span>

                  {row.body && (
                    <span className="mt-0.5 block text-sm leading-relaxed text-muted">
                      {row.body}
                    </span>
                  )}

                  <span className="tabular mt-1.5 block font-mono text-[0.65rem] text-muted">
                    {row.created_at.slice(0, 16).replace('T', ' ')}
                  </span>
                </span>

                {!row.read_at && (
                  <span className="shrink-0 text-[0.65rem] uppercase tracking-wide text-primary">
                    New
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted">
        Not hearing about something you want to?{' '}
        <Link
          href="/settings/notifications"
          className="text-primary underline-offset-4 hover:underline"
        >
          Choose what reaches you
        </Link>
      </p>
    </>
  )
}
