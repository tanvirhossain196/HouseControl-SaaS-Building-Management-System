'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { sendMagicLink, signInWithPassword } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { PasswordField } from './password-field'
import { FormError } from './form-error'
import { AuthLink } from './auth-card'
import { cn } from '@/lib/utils'

type Mode = 'password' | 'link'

/**
 * Two ways in, one form. The magic-link path exists because a resident who
 * signs in twice a month will not remember a password.
 */
export function SignInForm({ next = '/dashboard' }: { next?: string }) {
  const router = useRouter()
  const [mode, setMode] = React.useState<Mode>('password')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<
      string,
      string
    >
    setPending(true)
    setError(null)
    setFields({})

    const result =
      mode === 'password'
        ? await signInWithPassword(data)
        : await sendMagicLink({ email: data.email })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    if (mode === 'link') {
      router.push(
        `/check-email?email=${encodeURIComponent(data.email ?? '')}&reason=link`,
      )
      return
    }

    router.push(next)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <div
        role="tablist"
        className="grid grid-cols-2 gap-1 rounded-control bg-raised p-1"
      >
        {(['password', 'link'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => {
              setMode(option)
              setError(null)
            }}
            className={cn(
              'rounded-tile px-3 py-1.5 text-sm font-medium transition-colors',
              mode === option
                ? 'bg-surface text-ink shadow-panel'
                : 'text-muted hover:text-ink',
            )}
          >
            {option === 'password' ? 'Password' : 'Email link'}
          </button>
        ))}
      </div>

      <FormError message={error} />

      <Field label="Email" htmlFor="email" error={fields.email?.[0]} required>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-invalid={Boolean(fields.email)}
        />
      </Field>

      {mode === 'password' && (
        <>
          <PasswordField error={fields.password?.[0]} />
          <div className="-mt-2 text-right">
            <AuthLink href="/forgot-password">Forgot your password?</AuthLink>
          </div>
        </>
      )}

      <Button type="submit" size="lg" block loading={pending}>
        {mode === 'password' ? 'Sign in' : 'Email me a sign-in link'}
      </Button>

      {mode === 'link' && (
        <p className="text-xs leading-relaxed text-muted">
          We send a link that signs you in for 30 days on this device. No password to
          remember.
        </p>
      )}
    </form>
  )
}
