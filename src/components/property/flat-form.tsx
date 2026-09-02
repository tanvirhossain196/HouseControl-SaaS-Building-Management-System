'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { createFlatAction, updateFlatAction } from '@/app/(app)/admin/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import type { FlatRow } from '@/types'

const OCCUPANCY = [
  { value: 'vacant', label: 'Vacant — available to rent' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'reserved', label: 'Reserved — someone is moving in' },
  { value: 'not_rentable', label: 'Not rentable — staff quarters, storage' },
] as const

export function FlatForm({
  buildingId,
  flat,
  trigger,
}: {
  buildingId: string
  flat?: FlatRow
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})
  const formRef = React.useRef<HTMLFormElement>(null)

  const editing = Boolean(flat)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget))
    setPending(true)
    setError(null)
    setFields({})

    const result = editing
      ? await updateFlatAction(flat!.id, buildingId, data)
      : await createFlatAction({ ...data, buildingId })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    setOpen(false)
    formRef.current?.reset()
    toast({ tone: 'success', title: editing ? 'Flat updated' : `Flat added` })
    router.refresh()
  }

  return (
    <>
      {React.cloneElement(trigger, { onClick: () => setOpen(true) })}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit flat ${flat!.unit_number}` : 'Add a flat'}
        description={
          editing
            ? 'Changing the rent does not change dues already billed for this month.'
            : 'One unit. To fill a whole floor at once, use Generate units instead.'
        }
      >
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-5 pb-2">
          <FormError message={error} />

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Unit number"
              htmlFor="unitNumber"
              error={fields.unitNumber?.[0]}
              required
            >
              <Input
                id="unitNumber"
                name="unitNumber"
                defaultValue={flat?.unit_number}
                placeholder="5B"
                className="tabular font-mono"
                aria-invalid={Boolean(fields.unitNumber)}
              />
            </Field>

            <Field
              label="Floor"
              htmlFor="floor"
              error={fields.floor?.[0]}
              hint="0 is the ground floor, −1 a basement."
              required
            >
              <Input
                id="floor"
                name="floor"
                inputMode="numeric"
                defaultValue={flat?.floor ?? 1}
                aria-invalid={Boolean(fields.floor)}
              />
            </Field>

            <Field
              label="Monthly rent"
              htmlFor="monthlyRent"
              error={fields.monthlyRent?.[0]}
              required
            >
              <Input
                id="monthlyRent"
                name="monthlyRent"
                inputMode="numeric"
                defaultValue={flat?.monthly_rent ?? 0}
                className="tabular font-mono"
                aria-invalid={Boolean(fields.monthlyRent)}
              />
            </Field>

            <Field
              label="Rent day"
              htmlFor="rentDueDay"
              error={fields.rentDueDay?.[0]}
              hint="1–28, so every month has one."
            >
              <Input
                id="rentDueDay"
                name="rentDueDay"
                inputMode="numeric"
                defaultValue={flat?.rent_due_day ?? 5}
                className="tabular font-mono"
              />
            </Field>

            <Field
              label="Landlord rent"
              htmlFor="landlordRent"
              error={fields.landlordRent?.[0]}
              hint="What you pay the landlord, if you sublet. Residents never see this."
            >
              <Input
                id="landlordRent"
                name="landlordRent"
                inputMode="numeric"
                defaultValue={flat?.landlord_rent ?? 0}
                className="tabular font-mono"
              />
            </Field>

            <Field label="Size (sq ft)" htmlFor="sizeSqft" error={fields.sizeSqft?.[0]}>
              <Input
                id="sizeSqft"
                name="sizeSqft"
                inputMode="numeric"
                defaultValue={flat?.size_sqft ?? ''}
                className="tabular font-mono"
              />
            </Field>

            <Field label="Bedrooms" htmlFor="bedrooms" error={fields.bedrooms?.[0]}>
              <Input
                id="bedrooms"
                name="bedrooms"
                inputMode="numeric"
                defaultValue={flat?.bedrooms ?? ''}
                className="tabular font-mono"
              />
            </Field>

            <Field label="Status" htmlFor="occupancyStatus">
              <Select
                id="occupancyStatus"
                name="occupancyStatus"
                defaultValue={flat?.occupancy_status ?? 'vacant'}
              >
                {OCCUPANCY.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? 'Save changes' : 'Add flat'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
