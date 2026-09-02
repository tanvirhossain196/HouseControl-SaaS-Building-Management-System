'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { createBuildingAction, updateBuildingAction } from '@/app/(app)/admin/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import { cn } from '@/lib/utils'
import type { BuildingRow } from '@/types'

const AMENITIES = [
  'lift',
  'generator',
  'parking',
  'security',
  'gas line',
  'water reserve',
  'CCTV',
  'rooftop',
] as const

/**
 * One form for both create and edit. Amenities are toggles rather than a text
 * field because they feed the filters on the flats screen.
 */
export function BuildingForm({
  orgId,
  building,
  trigger,
}: {
  orgId: string
  building?: BuildingRow
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})
  const [amenities, setAmenities] = React.useState<string[]>(building?.amenities ?? [])
  const formRef = React.useRef<HTMLFormElement>(null)

  const editing = Boolean(building)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget))
    setPending(true)
    setError(null)
    setFields({})

    const payload = { ...data, amenities, orgId }
    const result = editing
      ? await updateBuildingAction(building!.id, payload)
      : await createBuildingAction(payload)

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    setOpen(false)
    formRef.current?.reset()
    toast({
      tone: 'success',
      title: editing ? 'Building updated' : 'Building added',
      body: editing ? undefined : 'Add its floors and units next.',
    })
    router.refresh()
  }

  return (
    <>
      {React.cloneElement(trigger, { onClick: () => setOpen(true) })}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${building!.name}` : 'Add a building'}
        description={
          editing
            ? 'Changes apply immediately. Unit numbers and rents are edited on the building page.'
            : 'Name it, place it, and say how many floors it has. Units come next.'
        }
        className="max-w-2xl"
      >
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5 pb-2">
          <FormError message={error} />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Building name" htmlFor="name" error={fields.name?.[0]} required>
              <Input
                id="name"
                name="name"
                defaultValue={building?.name}
                placeholder="Nasreen Tower"
                aria-invalid={Boolean(fields.name)}
              />
            </Field>

            <Field
              label="Floors"
              htmlFor="floorsCount"
              error={fields.floorsCount?.[0]}
              hint="Above ground. Basements are added as units later."
              required
            >
              <Input
                id="floorsCount"
                name="floorsCount"
                inputMode="numeric"
                defaultValue={building?.floors_count ?? 6}
                aria-invalid={Boolean(fields.floorsCount)}
              />
            </Field>

            <Field
              label="Street address"
              htmlFor="addressLine"
              error={fields.addressLine?.[0]}
              className="sm:col-span-2"
              required
            >
              <Input
                id="addressLine"
                name="addressLine"
                defaultValue={building?.address_line}
                placeholder="Road 7, House 22"
                aria-invalid={Boolean(fields.addressLine)}
              />
            </Field>

            <Field label="Area" htmlFor="area" error={fields.area?.[0]}>
              <Input
                id="area"
                name="area"
                defaultValue={building?.area ?? ''}
                placeholder="Mirpur DOHS"
              />
            </Field>

            <Field label="City" htmlFor="city" error={fields.city?.[0]}>
              <Input id="city" name="city" defaultValue={building?.city ?? 'Dhaka'} />
            </Field>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-ink">Amenities</legend>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {AMENITIES.map((amenity) => {
                const active = amenities.includes(amenity)
                return (
                  <button
                    key={amenity}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setAmenities((current) =>
                        active
                          ? current.filter((item) => item !== amenity)
                          : [...current, amenity],
                      )
                    }
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-line text-muted hover:border-ink/25 hover:text-ink',
                    )}
                  >
                    {amenity}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <Field label="Notes" htmlFor="notes" error={fields.notes?.[0]}>
            <Textarea
              id="notes"
              name="notes"
              rows={3}
              defaultValue={building?.notes ?? ''}
              placeholder="Caretaker's name, gas line quirks, anything the next person should know."
            />
          </Field>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? 'Save changes' : 'Add building'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
