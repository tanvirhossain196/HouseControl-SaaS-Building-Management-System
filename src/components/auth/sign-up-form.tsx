'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { signUpWithPassword } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { PasswordField } from './password-field'
import { FormError } from './form-error'

export function SignUpForm() {
  const router = useRouter()
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

    const result = await signUpWithPassword(data)
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    router.push(
      `/check-email?email=${encodeURIComponent(result.data.email)}&reason=verify`,
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError message={error} />

      <Field label="Your name" htmlFor="fullName" error={fields.fullName?.[0]} required>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          placeholder="Shahnaz Karim"
          aria-invalid={Boolean(fields.fullName)}
        />
      </Field>

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

      <PasswordField
        autoComplete="new-password"
        showStrength
        hint="At least 10 characters, with upper and lower case and a number."
        error={fields.password?.[0]}
      />

      <PasswordField
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        error={fields.confirmPassword?.[0]}
      />

      <Button type="submit" size="lg" block loading={pending}>
        Create account
      </Button>

      <p className="text-xs leading-relaxed text-muted">
        We send a verification link before the account can be used. Unverified accounts
        cannot see any building.
      </p>
    </form>
  )
}
