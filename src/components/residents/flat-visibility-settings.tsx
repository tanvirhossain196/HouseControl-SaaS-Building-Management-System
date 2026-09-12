'use client'

import { useState, useTransition } from 'react'
import { Check, Eye, EyeOff, Loader2, Settings2 } from 'lucide-react'

import { updateFlatVisibilityAction } from '@/app/(app)/flats/actions'

type VisibilitySettings = {
  showMemberPhone: boolean
  showMemberRent: boolean
  showPaymentStatus: boolean
  showDueDate: boolean
  showMemberList: boolean
  showModeratorPhone: boolean
}

type Props = {
  flatId: string
  initialSettings: VisibilitySettings
}

type SettingItem = {
  key: keyof VisibilitySettings
  title: string
  description: string
}

const settings: SettingItem[] = [
  {
    key: 'showMemberList',
    title: 'Show member list',
    description: 'Residents can see other active members of this flat.',
  },
  {
    key: 'showMemberPhone',
    title: 'Show member phone numbers',
    description: 'Residents can see the phone numbers of active members.',
  },
  {
    key: 'showMemberRent',
    title: 'Show member rent shares',
    description: 'Residents can see how much rent each member pays.',
  },
  {
    key: 'showPaymentStatus',
    title: 'Show payment status',
    description: 'Residents can see whether members have paid their dues.',
  },
  {
    key: 'showDueDate',
    title: 'Show due dates',
    description: 'Residents can see rent due dates and payment deadlines.',
  },
  {
    key: 'showModeratorPhone',
    title: 'Show moderator phone number',
    description: 'Residents can contact the flat moderator directly.',
  },
]

export function FlatVisibilitySettings({
  flatId,
  initialSettings,
}: Props) {
  const [values, setValues] = useState<VisibilitySettings>(initialSettings)
  const [savedValues, setSavedValues] =
    useState<VisibilitySettings>(initialSettings)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasChanges = settings.some(
    ({ key }) => values[key] !== savedValues[key],
  )

  function updateValue(
    key: keyof VisibilitySettings,
    value: boolean,
  ) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }))

    setMessage(null)
    setError(null)
  }

  function saveSettings() {
    setMessage(null)
    setError(null)

    startTransition(async () => {
      const result = await updateFlatVisibilityAction({
        flatId,
        ...values,
      })

      if (!result.ok) {
        setError(result.error)
        return
      }

      setSavedValues(values)
      setMessage('Visibility settings saved successfully.')
    })
  }

  function resetSettings() {
    setValues(savedValues)
    setMessage(null)
    setError(null)
  }

  return (
    <section className="rounded-panel border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary">
            <Settings2 className="size-5" aria-hidden />
          </div>

          <div>
            <h2 className="text-title text-ink">
              Resident visibility
            </h2>

            <p className="mt-1 max-w-[58ch] text-sm text-muted">
              Choose which flat information active residents can see on
              their My Flat page.
            </p>
          </div>
        </div>

        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
          <Eye className="size-3.5" aria-hidden />
          Moderator controls
        </span>
      </div>

      <div className="mt-6 divide-y divide-line rounded-control border border-line">
        {settings.map((item) => {
          const enabled = values[item.key]

          return (
            <div
              key={item.key}
              className="flex items-center justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {item.title}
                </p>

                <p className="mt-1 text-xs leading-5 text-muted">
                  {item.description}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={item.title}
                onClick={() => updateValue(item.key, !enabled)}
                className={[
                  'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors',
                  'focus:outline-none focus:ring-2 focus:ring-primary/40',
                  enabled ? 'bg-primary' : 'bg-line',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex size-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform',
                    enabled ? 'translate-x-5' : 'translate-x-0',
                  ].join(' ')}
                >
                  {enabled ? (
                    <Eye className="size-3 text-primary" aria-hidden />
                  ) : (
                    <EyeOff className="size-3 text-muted" aria-hidden />
                  )}
                </span>
              </button>
            </div>
          )
        })}
      </div>

      {(message || error) && (
        <div
          className={[
            'mt-4 rounded-control border px-4 py-3 text-sm',
            error
              ? 'border-due/30 bg-due-soft text-due'
              : 'border-paid/30 bg-paid-soft text-paid',
          ].join(' ')}
        >
          {error ?? message}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={resetSettings}
          disabled={!hasChanges || isPending}
          className="rounded-control border border-line px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-raised hover:text-ink disabled:pointer-events-none disabled:opacity-50"
        >
          Reset
        </button>

        <button
          type="button"
          onClick={saveSettings}
          disabled={!hasChanges || isPending}
          className="inline-flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Check className="size-4" aria-hidden />
          )}

          {isPending ? 'Saving...' : 'Save settings'}
        </button>
      </div>
    </section>
  )
}