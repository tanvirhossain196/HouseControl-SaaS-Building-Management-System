'use client'

import Link from 'next/link'

import { useTransition } from 'react'

import { BellRing, LogOut, ShieldCheck, User, DoorOpen } from 'lucide-react'

import { signOut } from '@/lib/auth/actions'

import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'

import { LocaleToggle } from './locale-toggle'

import { ThemeToggle } from './theme-toggle'

import type { Locale } from '@/lib/i18n/locales'

import { Avatar } from '@/components/ui/avatar'

import { Badge } from '@/components/ui/badge'

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

  const isResident = role === 'resident'

  const isModerator = role === 'moderator'

  return (
    <Dropdown
      align="end"

      className="min-w-60"

      trigger={
        <button
          type="button"

          className="rounded-full transition-opacity hover:opacity-80"
        >
          <Avatar
            name={name}

            src={avatarUrl ?? undefined}

            size="sm"
          />
        </button>
      }
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <Avatar
          name={name}

          src={avatarUrl ?? undefined}

          size="md"
        />

        <div>
          <p className="text-sm font-medium text-ink">{name}</p>

          <p className="text-xs text-muted">{email}</p>

          <Badge tone="primary">{role}</Badge>
        </div>
      </div>

      <DropdownSeparator />

      {(isResident || isModerator) && (
        <Link href="/flats">
          <DropdownItem>
            <DoorOpen className="size-4" />
            My Flat
          </DropdownItem>
        </Link>
      )}

      <Link href="/settings/profile">
        <DropdownItem>
          <User className="size-4" />
          Profile
        </DropdownItem>
      </Link>

      <Link href="/settings/notifications">
        <DropdownItem>
          <BellRing className="size-4" />
          Notifications
        </DropdownItem>
      </Link>

      {!phoneVerified && (
        <Link href="/onboarding/phone">
          <DropdownItem>
            <ShieldCheck className="size-4" />
            Verify phone
          </DropdownItem>
        </Link>
      )}

      {locale && (
        <>
          <DropdownSeparator />

          <div className="flex justify-between px-3 py-2 sm:hidden">
            <span>Language</span>

            <LocaleToggle current={locale} />
          </div>

          <div className="flex justify-between px-3 py-2 sm:hidden">
            <span>Theme</span>

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
        <LogOut className="size-4" />

        {pending ? 'Signing out…' : 'Sign out'}
      </DropdownItem>
    </Dropdown>
  )
}
