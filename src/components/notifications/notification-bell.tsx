'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import {
  markAllReadAction,
  markReadAction,
} from '@/app/(app)/settings/notifications/actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { NotificationRow } from '@/types'

/**
 * The bell. Opens a short list rather than a page, because the common case is
 * "what happened while I was away", answered in three seconds.
 */
export function NotificationBell({
  notifications,
  unread,
}: {
  notifications: NotificationRow[]
  unread: number
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const wrapRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function open_(id: string, link: string | null) {
    await markReadAction([id])
    setOpen(false)
    if (link) router.push(link)
    else router.refresh()
  }

  return (
    <div ref={wrapRef} className="relative">
      <Button
        variant="quiet"
        size="icon-sm"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell />
        {unread > 0 && (
          <span
            aria-hidden
            className="tabular absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-overdue px-1 font-mono text-[0.6rem] font-semibold text-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(22rem,calc(100vw-2rem))] animate-scale-in overflow-hidden rounded-panel border border-line bg-surface shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-medium text-ink">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs text-muted hover:text-ink"
                onClick={async () => {
                  await markAllReadAction()
                  router.refresh()
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Nothing yet.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => open_(notification.id, notification.link)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors hover:bg-raised/60',
                      !notification.read_at && 'bg-primary-soft/40',
                    )}
                  >
                    <span className="flex items-start gap-2">
                      {!notification.read_at && (
                        <span
                          aria-hidden
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                        />
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">
                          {notification.title}
                        </span>
                        {notification.body && (
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                            {notification.body}
                          </span>
                        )}
                        <span className="tabular mt-1 block font-mono text-[0.65rem] text-muted">
                          {notification.created_at.slice(0, 16).replace('T', ' ')}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/*
            Two links, not one. The dropdown holds the most recent handful, so
            there has to be a way to the rest — and the preferences page answers
            a different question entirely: not "what happened" but "what should
            reach me".
          */}
          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              See all
            </Link>

            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-muted hover:text-ink"
            >
              Choose what you are told about
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
