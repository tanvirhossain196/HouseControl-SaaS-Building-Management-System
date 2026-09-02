'use client'

import * as React from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/providers/toast-provider'

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Tell us who to reply to.'),
  email: z.string().trim().email('Use an address you can receive mail at.'),
  phone: z
    .string()
    .trim()
    .regex(
      /^(\+?88)?01[3-9]\d{8}$/,
      'Use a Bangladeshi mobile number, e.g. 01712345678.',
    ),
  units: z.string().min(1, 'Pick a range.'),
  message: z.string().trim().min(10, 'A sentence or two about your building is enough.'),
})

type FieldName = keyof z.infer<typeof contactSchema>
type Errors = Partial<Record<FieldName, string>>

const unitRanges = ['1–8 units', '9–20 units', '21–50 units', 'More than 50 units']

export function ContactForm() {
  const { toast } = useToast()
  const [errors, setErrors] = React.useState<Errors>({})
  const [pending, setPending] = React.useState(false)
  const [sent, setSent] = React.useState(false)
  const formRef = React.useRef<HTMLFormElement>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<
      string,
      string
    >
    const parsed = contactSchema.safeParse(data)

    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldName
        next[key] ??= issue.message
      }
      setErrors(next)
      const firstKey = Object.keys(next)[0]
      if (firstKey)
        formRef.current?.querySelector<HTMLElement>(`[name="${firstKey}"]`)?.focus()
      return
    }

    setErrors({})
    setPending(true)
    // Phase 1 has no backend yet — Phase 2 replaces this with a server action.
    await new Promise((resolve) => setTimeout(resolve, 900))
    setPending(false)
    setSent(true)
    formRef.current?.reset()
    toast({
      tone: 'success',
      title: 'Message sent',
      body: 'We reply within one working day, Sunday to Thursday.',
    })
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" error={errors.name} required>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="Shahnaz Karim"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'name-error' : undefined}
          />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email} required>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
        </Field>
        <Field label="Mobile" htmlFor="phone" error={errors.phone} required>
          <Input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="01712345678"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? 'phone-error' : undefined}
          />
        </Field>
        <Field label="How many units?" htmlFor="units" error={errors.units} required>
          <Select id="units" name="units" defaultValue={unitRanges[0]}>
            {unitRanges.map((range) => (
              <option key={range}>{range}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="What do you need help with?"
        htmlFor="message"
        error={errors.message}
        hint="Where the building is, how rent is collected today, anything unusual."
        required
      >
        <Textarea
          id="message"
          name="message"
          rows={5}
          placeholder="Six-storey building in Mirpur, twelve flats, three of them shared…"
          aria-invalid={Boolean(errors.message)}
          aria-describedby={errors.message ? 'message-error' : 'message-hint'}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" loading={pending}>
          {pending ? 'Sending' : 'Send message'}
        </Button>
        {sent && (
          <p role="status" className="text-sm text-paid">
            Sent. We reply within one working day.
          </p>
        )}
      </div>
    </form>
  )
}
