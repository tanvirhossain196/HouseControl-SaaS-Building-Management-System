'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { LogIn, LogOut, Search, ShieldX } from 'lucide-react'
import {
  denyEntryAction,
  logEntryAction,
  lookUpCodeAction,
  markExitAction,
} from '@/app/(app)/gate/actions'
import { durationSince, isValidCodeShape, KIND_LABELS, visitIsStale } from '@/lib/gate'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Badge } from '@/components/ui/badge'
import { FormError } from '@/components/auth/form-error'
import { EmptyState } from '@/components/layout/page-header'
import { useToast } from '@/components/providers/toast-provider'
import { cn } from '@/lib/utils'
import type { VisitorWithContext } from '@/services/visitors.service'

type Flat = { id: string; unitNumber: string }

/**
 * The guard's whole screen.
 *
 * Built for one thumb on a mid-range phone at a gate: three actions, large
 * targets, no nested menus, and nothing that needs a second page load while
 * somebody is standing there waiting.
 */
export function GateConsole({
  buildingId,
  flats,
  inside,
  expected,
}: {
  buildingId: string
  flats: Flat[]
  inside: VisitorWithContext[]
  expected: VisitorWithContext[]
}) {
  const router = useRouter()
  const { toast } = useToast()

  const [entryOpen, setEntryOpen] = React.useState(false)
  const [denyOpen, setDenyOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})
  const [kind, setKind] = React.useState('guest')
  const [matched, setMatched] = React.useState<{
    id: string
    name: string
    unit: string | null
    purpose: string | null
  } | null>(null)
  const [code, setCode] = React.useState('')
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const formRef = React.useRef<HTMLFormElement>(null)

  async function lookUp(event: React.FormEvent) {
    event.preventDefault()
    if (!isValidCodeShape(code)) {
      setError('A code is six letters and numbers, like KF7-2M9.')
      return
    }

    setPending(true)
    setError(null)
    const result = await lookUpCodeAction(buildingId, code)
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    if (!result.data) {
      setError('No guest is expected on that code. Log them in by hand instead.')
      return
    }

    setMatched(result.data)
  }

  async function admitMatched() {
    if (!matched) return
    setPending(true)

    const result = await logEntryAction({
      buildingId,
      visitorId: matched.id,
      fullName: matched.name,
      kind: 'guest',
    })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      tone: 'success',
      title: `${matched.name} logged in`,
      body: 'The flat has been told.',
    })
    setMatched(null)
    setCode('')
    router.refresh()
  }

  async function submitEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget))
    setPending(true)
    setError(null)
    setFields({})

    const result = await logEntryAction({ ...data, buildingId, kind })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    setEntryOpen(false)
    formRef.current?.reset()
    toast({ tone: 'success', title: `${result.data.name} logged in` })
    router.refresh()
  }

  async function submitDeny(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget))
    setPending(true)
    setError(null)

    const result = await denyEntryAction({ ...data, buildingId })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setDenyOpen(false)
    toast({
      tone: 'success',
      title: 'Recorded',
      body: 'The building owner can see this.',
    })
    router.refresh()
  }

  async function exit(visitor: VisitorWithContext) {
    setBusyId(visitor.id)
    const result = await markExitAction(buildingId, visitor.id)
    setBusyId(null)

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not mark them out', body: result.error })
      return
    }

    router.refresh()
  }

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <Button size="lg" className="h-14 text-base" onClick={() => setEntryOpen(true)}>
          <LogIn /> Log someone in
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-14 text-base"
          onClick={() => setDenyOpen(true)}
        >
          <ShieldX /> Turned away
        </Button>
      </div>

      <section className="rounded-panel border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">
          Expected guest? Check their code
        </h2>
        <form onSubmit={lookUp} className="mt-3 flex gap-2">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="KF7-2M9"
            aria-label="Entry code"
            autoCapitalize="characters"
            className="tabular h-12 font-mono text-base uppercase tracking-[0.2em]"
          />
          <Button type="submit" size="lg" variant="outline" loading={pending}>
            {!pending && <Search />} Check
          </Button>
        </form>
        {error && !entryOpen && !denyOpen && (
          <p className="mt-2 text-sm text-overdue">{error}</p>
        )}
        {expected.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            {expected.length} guest{expected.length === 1 ? '' : 's'} expected today.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-title text-ink">Inside now</h2>
        <p className="mt-1 text-sm text-muted">
          {inside.length} logged in and not yet marked out.
        </p>

        <div className="mt-4">
          {inside.length === 0 ? (
            <EmptyState
              title="Nobody inside"
              body="Everyone who came in has been marked out. Log the next arrival with the button above."
            />
          ) : (
            <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
              {inside.map((visitor) => {
                const stale = visitIsStale(visitor.entered_at)
                return (
                  <li key={visitor.id} className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{visitor.full_name}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                        <span>{KIND_LABELS[visitor.kind]}</span>
                        {visitor.unitNumber && (
                          <span className="tabular font-mono text-xs">
                            Flat {visitor.unitNumber}
                          </span>
                        )}
                        <span
                          className={cn('tabular font-mono text-xs', stale && 'text-due')}
                        >
                          {durationSince(visitor.entered_at)}
                        </span>
                      </p>
                      {stale && (
                        <Badge tone="due" className="mt-1.5">
                          Still in after 12 hours — check
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-12 shrink-0"
                      loading={busyId === visitor.id}
                      onClick={() => exit(visitor)}
                    >
                      {busyId !== visitor.id && <LogOut />} Out
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <Modal
        open={Boolean(matched)}
        onClose={() => setMatched(null)}
        title={matched?.name ?? ''}
        description={
          matched?.unit
            ? `Expected at flat ${matched.unit}${matched.purpose ? ` · ${matched.purpose}` : ''}`
            : 'Approved by a resident'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setMatched(null)}>
              Cancel
            </Button>
            <Button loading={pending} onClick={admitMatched}>
              Log them in
            </Button>
          </>
        }
      >
        <p className="text-sm">
          The code matches. Logging them in tells the flat they have arrived and uses up
          the code.
        </p>
      </Modal>

      <Modal
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        title="Log someone in"
        description="Name and which flat is enough. The rest helps later."
      >
        <form ref={formRef} onSubmit={submitEntry} noValidate className="space-y-5 pb-2">
          <FormError message={error} />

          <Field label="Name" htmlFor="fullName" error={fields.fullName?.[0]} required>
            <Input id="fullName" name="fullName" className="h-12 text-base" autoFocus />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Who is it" htmlFor="kind">
              <Select
                id="kind"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
                className="h-12 text-base"
              >
                <option value="guest">Guest</option>
                <option value="courier">Delivery</option>
                <option value="service">Service — plumber, electrician</option>
                <option value="staff">Staff</option>
                <option value="other">Other</option>
              </Select>
            </Field>

            <Field
              label="Flat"
              htmlFor="flatId"
              error={fields.flatId?.[0]}
              hint={
                kind === 'staff' || kind === 'other' ? 'Optional for staff.' : undefined
              }
            >
              <Select
                id="flatId"
                name="flatId"
                defaultValue=""
                className="h-12 text-base"
              >
                <option value="">No flat</option>
                {flats.map((flat) => (
                  <option key={flat.id} value={flat.id}>
                    {flat.unitNumber}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Phone" htmlFor="phone" error={fields.phone?.[0]}>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                placeholder="01712345678"
                className="h-12 text-base"
              />
            </Field>

            <Field label="Vehicle" htmlFor="vehicle" hint="Plate or “motorbike”.">
              <Input id="vehicle" name="vehicle" className="h-12 text-base" />
            </Field>
          </div>

          <Field label="Purpose" htmlFor="purpose">
            <Input
              id="purpose"
              name="purpose"
              placeholder="Parcel for 5B"
              className="h-12 text-base"
            />
          </Field>

          <Field label="ID checked" htmlFor="idNote" hint="What you saw, not the number.">
            <Input
              id="idNote"
              name="idNote"
              placeholder="NID seen"
              className="h-12 text-base"
            />
          </Field>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setEntryOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="lg" loading={pending}>
              Log in
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={denyOpen}
        onClose={() => setDenyOpen(false)}
        title="Someone turned away"
        description="Recorded for the owner. Nobody is added to the blocked list by this."
      >
        <form onSubmit={submitDeny} noValidate className="space-y-5 pb-2">
          <FormError message={error} />

          <Field label="Name" htmlFor="denyName" required>
            <Input id="denyName" name="fullName" className="h-12 text-base" />
          </Field>

          <Field label="Phone" htmlFor="denyPhone">
            <Input
              id="denyPhone"
              name="phone"
              type="tel"
              inputMode="tel"
              className="h-12 text-base"
            />
          </Field>

          <Field label="Why" htmlFor="denyReason" required>
            <Textarea
              id="denyReason"
              name="reason"
              rows={2}
              placeholder="Would not say which flat."
            />
          </Field>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setDenyOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Record it
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
