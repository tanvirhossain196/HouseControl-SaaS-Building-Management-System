'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { savePreferenceAction } from '@/app/(app)/settings/notifications/actions'
import { useToast } from '@/components/providers/toast-provider'
import { cn } from '@/lib/utils'
import { CATEGORY_LABELS, type Category } from '@/lib/notifications'

type Row = { email: boolean; sms: boolean; push: boolean }

const DESCRIPTIONS: Record<Category, string> = {
  money: 'Charges raised, reminders before they are due, payments confirmed or rejected.',
  people: 'Someone joining or leaving a flat, and moderator handovers.',
  gate: 'A visitor arriving for your flat, and guests you pre-approved.',
  repairs: 'Problems reported, work started, and repairs finished.',
  account: 'Sign-in and password changes. These always reach you.',
}

/**
 * Preferences by category, not by event: four rows a person will actually
 * read. The finer per-event settings exist underneath and are respected if
 * something ever writes them.
 */
export function PreferenceForm({
  categories,
  smsAvailable,
}: {
  categories: { key: Category; current: Row; locked: boolean }[]
  smsAvailable: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [state, setState] = React.useState(
    Object.fromEntries(categories.map((row) => [row.key, row.current])) as Record<
      Category,
      Row
    >,
  )
  const [saving, setSaving] = React.useState<string | null>(null)

  async function toggle(category: Category, channel: keyof Row) {
    const next = { ...state[category], [channel]: !state[category][channel] }
    setState((current) => ({ ...current, [category]: next }))
    setSaving(`${category}:${channel}`)

    const result = await savePreferenceAction({ event: `category:${category}`, ...next })
    setSaving(null)

    if (!result.ok) {
      setState((current) => ({ ...current, [category]: state[category] }))
      toast({ tone: 'error', title: 'Could not save that', body: result.error })
      return
    }

    router.refresh()
  }

  return (
    <div className="divide-y divide-line rounded-panel border border-line bg-surface">
      {categories.map(({ key, locked }) => (
        <div key={key} className="p-5">
          <p className="font-medium text-ink">{CATEGORY_LABELS[key]}</p>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">{DESCRIPTIONS[key]}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Toggle
              label="In app"
              checked
              disabled
              hint="Always on — the bell is the record."
            />
            <Toggle
              label="Email"
              checked={state[key].email}
              disabled={locked || saving === `${key}:email`}
              onClick={() => toggle(key, 'email')}
            />
            <Toggle
              label="SMS"
              checked={state[key].sms}
              disabled={!smsAvailable || locked || saving === `${key}:sms`}
              hint={
                smsAvailable
                  ? 'Only for the few things worth a text.'
                  : 'Verify your mobile number to use SMS.'
              }
              onClick={() => toggle(key, 'sms')}
            />
          </div>

          {locked && (
            <p className="mt-3 text-xs text-muted">
              These cannot be turned off — they are about your money or your account.
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

function Toggle({
  label,
  checked,
  disabled,
  hint,
  onClick,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  hint?: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hint ? `${label} — ${hint}` : label}
      title={hint}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
        checked
          ? 'border-primary bg-primary-soft text-primary'
          : 'border-line text-muted hover:border-ink/25 hover:text-ink',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', checked ? 'bg-primary' : 'bg-line')}
      />
      {label}
    </button>
  )
}
