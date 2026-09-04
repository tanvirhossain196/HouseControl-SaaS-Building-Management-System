'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { BellRing, LogOut, ShieldCheck, User } from 'lucide-react'
import { signOut } from '@/lib/auth/actions'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
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
}: {
  name: string
  email: string
  role: string
  phoneVerified: boolean
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
          <Avatar name={name} size="sm" />
        </button>
      }
    >
      <div className="px-3 py-2.5">
        <p className="truncate text-sm font-medium text-ink">{name}</p>
        <p className="truncate text-xs text-muted">{email}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone="primary">{role}</Badge>
          {!phoneVerified && <Badge tone="due">Phone unverified</Badge>}
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
