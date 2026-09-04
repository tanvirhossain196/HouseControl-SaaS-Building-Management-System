'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { MailCheck } from 'lucide-react'
import { requestPasswordReset, verifyResetCode } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { FormError } from './form-error'

/**
 * Resetting a password with a six-digit code.
 *
 * A code rather than a link because of where this gets used: a resident
 * opens the email in Gmail on their phone, and a link opens a second browser
 * that has none of the session the first one was building. A code is read
 * from one app and typed into another, which is the thing people are already
 * doing with every OTP in the country.
 *
 * The link still works — the same email can carry both — and lands on the
 * same page through /auth/callback.
 */
export function ForgotPasswordForm() {
  const router = useRouter()
  const [step, setStep] = React.useState<'email' | 'code'>('email')
  const [email, setEmail] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})
  const [secondsLeft, setSecondsLeft] = React.useState(0)

  React.useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  async function sendCode(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (pending) return

    setPending(true)
    setError(null)
    setFields({})

    const result = await requestPasswordReset({ email })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    setStep('code')
    setSecondsLeft(60)
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const token = String(new FormData(event.currentTarget).get('token') ?? '')
    setPending(true)
    setError(null)

    const result = await verifyResetCode({ email, token })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    // The code created a short-lived recovery session; the next page uses it
    // to set the new password.
    router.push('/reset-password')
    router.refresh()
  }

  if (step === 'email') {
    return (
      <form onSubmit={sendCode} noValidate className="space-y-5">
        <FormError message={error} />

        <Field label="Email" htmlFor="email" error={fields.email?.[0]} required>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(fields.email)}
          />
        </Field>

        <Button type="submit" size="lg" block loading={pending}>
          Email me a code
        </Button>

        <p className="text-xs leading-relaxed text-muted">
          We send a six-digit code to this address. It works once and expires in an hour.
        </p>
      </form>
    )
  }

  return (
    <form onSubmit={submitCode} noValidate className="space-y-5">
      <div className="flex items-center gap-3 rounded-control border border-line bg-raised/60 px-4 py-3">
        <MailCheck className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-ink">
          Sent to <span className="font-medium">{email}</span>
        </p>
      </div>

      <FormError message={error} />

      <Field label="Six-digit code" htmlFor="token" error={fields.token?.[0]} required>
        <Input
          id="token"
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          className="tabular text-center font-mono text-lg tracking-[0.4em]"
          aria-invalid={Boolean(fields.token)}
        />
      </Field>

      <Button type="submit" size="lg" block loading={pending}>
        Continue
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => {
            setStep('email')
            setError(null)
          }}
          className="text-muted hover:text-ink"
        >
          Use a different address
        </button>
        <button
          type="button"
          disabled={secondsLeft > 0 || pending}
          onClick={() => void sendCode()}
          className="font-medium text-primary disabled:text-muted"
        >
          {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
        </button>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        The email also contains a link. Either one works — whichever is easier on the device you
        are reading it on.
      </p>
    </form>
  )
}
