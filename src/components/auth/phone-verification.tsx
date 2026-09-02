'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { sendPhoneOtp, verifyPhoneOtp } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { FormError } from './form-error'
import { useToast } from '@/components/providers/toast-provider'

/**
 * Two steps in one component: send a code, then confirm it. The number is
 * needed before anyone can hold a moderator role, because the Phase 8 role
 * handover sends its OTP here.
 */
export function PhoneVerification({ next = '/dashboard' }: { next?: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const [step, setStep] = React.useState<'phone' | 'code'>('phone')
  const [phone, setPhone] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})
  const [secondsLeft, setSecondsLeft] = React.useState(0)

  React.useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [secondsLeft])

  async function requestCode(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (pending) return

    setPending(true)
    setError(null)
    setFields({})

    const result = await sendPhoneOtp({ phone })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    setStep('code')
    setSecondsLeft(60)
    toast({
      tone: 'info',
      title: 'Code sent',
      body: `We texted a six-digit code to ${phone}.`,
    })
  }

  async function confirmCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const token = String(new FormData(event.currentTarget).get('token') ?? '')
    setPending(true)
    setError(null)

    const result = await verifyPhoneOtp({ phone, token })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    toast({ tone: 'success', title: 'Number verified' })
    router.push(next)
    router.refresh()
  }

  if (step === 'phone') {
    return (
      <form onSubmit={requestCode} noValidate className="space-y-5">
        <FormError message={error} />
        <Field
          label="Mobile number"
          htmlFor="phone"
          error={fields.phone?.[0]}
          hint="We send one code now, and use this number for role handovers later."
          required
        >
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="01712345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={Boolean(fields.phone)}
          />
        </Field>
        <Button type="submit" size="lg" block loading={pending}>
          Send code
        </Button>
      </form>
    )
  }

  return (
    <form onSubmit={confirmCode} noValidate className="space-y-5">
      <FormError message={error} />
      <Field
        label="Six-digit code"
        htmlFor="token"
        error={fields.token?.[0]}
        hint={`Sent to ${phone}.`}
        required
      >
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
        Verify number
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => setStep('phone')}
          className="text-muted hover:text-ink"
        >
          Change number
        </button>
        <button
          type="button"
          disabled={secondsLeft > 0 || pending}
          onClick={() => void requestCode()}
          className="font-medium text-primary disabled:text-muted"
        >
          {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
        </button>
      </div>
    </form>
  )
}
