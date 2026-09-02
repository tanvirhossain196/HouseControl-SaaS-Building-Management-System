'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Field, Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Length first, then variety — the same order the schema checks. */
function strengthOf(value: string) {
  if (!value) return { score: 0, label: '' }
  let score = 0
  if (value.length >= 10) score += 1
  if (value.length >= 14) score += 1
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1
  if (/\d/.test(value)) score += 1
  if (/[^A-Za-z0-9]/.test(value)) score += 1

  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Strong']
  return { score, label: labels[score] ?? '' }
}

export function PasswordField({
  id = 'password',
  name = 'password',
  label = 'Password',
  autoComplete = 'current-password',
  error,
  hint,
  showStrength = false,
}: {
  id?: string
  name?: string
  label?: string
  autoComplete?: 'current-password' | 'new-password'
  error?: string
  hint?: string
  showStrength?: boolean
}) {
  const [visible, setVisible] = useState(false)
  const [value, setValue] = useState('')
  const strength = strengthOf(value)

  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          className="pr-11"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute right-1 top-1 inline-flex size-8 items-center justify-center rounded-tile text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      {showStrength && value.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <div className="flex flex-1 gap-1" aria-hidden>
            {[1, 2, 3, 4, 5].map((step) => (
              <span
                key={step}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors',
                  step <= strength.score
                    ? strength.score <= 2
                      ? 'bg-overdue'
                      : strength.score === 3
                        ? 'bg-due'
                        : 'bg-paid'
                    : 'bg-raised',
                )}
              />
            ))}
          </div>
          <span className="text-xs text-muted" aria-live="polite">
            {strength.label}
          </span>
        </div>
      )}
    </Field>
  )
}
