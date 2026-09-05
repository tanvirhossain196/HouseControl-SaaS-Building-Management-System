'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { BellRing, LogOut, ShieldCheck, User } from 'lucide-react'
import { signOut } from '@/lib/auth/actions'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
import { LocaleToggle } from './locale-toggle'
import { ThemeToggle } from './theme-toggle'
import type { Locale } from '@/lib/i18n/locales'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'

/**
 * The avatar in the header, with somewhere to go from it.
 *
 * It used to be a link straight to phone verification, which is a strange
 * thing to find behind your own face. Everything about the account lives
 * here now: who you are signed in as, your profile, your notification
 * choices, and the way out.
 */
export function ProfileMenu({
  name,
  email,
  role,
  phoneVerified,
  avatarUrl,
  locale,
}: {
  name: string
  email: string
  role: string
  phoneVerified: boolean
  avatarUrl?: string | null
  locale?: Locale
}) {
  const [pending, startTransition] = useTransition()

  return (
    <Dropdown
      align="end"
      className="min-w-60"
      trigger={
        <button
          type="button"
          className="rounded-full transition-opacity hover:opacity-80"
          aria-label="Your account"
        >
          <Avatar name={name} src={avatarUrl ?? undefined} size="sm" />
        </button>
      }
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Avatar name={name} src={avatarUrl ?? undefined} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{name}</p>
          <p className="truncate text-xs text-muted">{email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="primary">{role}</Badge>
            {!phoneVerified && <Badge tone="due">Phone unverified</Badge>}
          </div>
        </div>
      </div>

      <DropdownSeparator />

      <Link href="/settings/profile">
        <DropdownItem>
          <User className="size-4" /> Your profile
        </DropdownItem>
      </Link>

      <Link href="/settings/notifications">
        <DropdownItem>
          <BellRing className="size-4" /> Notifications
        </DropdownItem>
      </Link>

      {!phoneVerified && (
        <Link href="/onboarding/phone">
          <DropdownItem>
            <ShieldCheck className="size-4" /> Verify your phone
          </DropdownItem>
        </Link>
      )}

      {/* Only where the header has no room for them. */}
      {locale && (
        <>
          <DropdownSeparator />
          <div className="flex items-center justify-between gap-3 px-3 py-2 sm:hidden">
            <span className="text-sm text-muted">Language</span>
            <LocaleToggle current={locale} />
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2 sm:hidden">
            <span className="text-sm text-muted">Theme</span>
            <ThemeToggle />
          </div>
        </>
      )}

      <DropdownSeparator />

      <DropdownItem
        className="text-overdue"
        disabled={pending}
        onClick={() => startTransition(() => void signOut())}
      >
        <LogOut className="size-4" /> {pending ? 'Signing out…' : 'Sign out'}
      </DropdownItem>
    </Dropdown>
  )
}
