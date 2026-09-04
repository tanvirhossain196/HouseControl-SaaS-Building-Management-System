'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { setUpBuildingAction } from './actions'
import { planUnits } from '@/lib/units'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'

/**
 * The first screen an owner sees.
 *
 * One form, not a wizard: an owner setting up a six-storey walk-up knows all
 * of this already, and three screens with a progress bar would only make them
 * wait between fields they can see at once. The unit preview updates as they
 * type, so the building appears before they commit to it.
 */
export function SetupForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})

  const [floors, setFloors] = React.useState(6)
  const [perFloor, setPerFloor] = React.useState(2)
  const [generate, setGenerate] = React.useState(true)

  const preview = React.useMemo(() => {
    if (!generate) return []
    return planUnits({
      fromFloor: 0,
      toFloor: Math.max(0, floors - 1),
      unitsPerFloor: perFloor,
      floorStyle: 'ground_g',
      unitStyle: 'floor_letter',
    })
  }, [floors, perFloor, generate])

  const overFreeLimit = preview.length > 12

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>
    setPending(true)
    setError(null)
    setFields({})

    const result = await setUpBuildingAction({ ...data, generateUnits: generate })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      setFields(result.fieldErrors ?? {})
      return
    }

    toast({
      tone: 'success',
      title: 'Your building is set up',
      body: result.data.unitsCreated
        ? `${result.data.unitsCreated} units created. Set the rents next.`
        : 'Add its units next.',
    })

    router.push(`/admin/buildings/${result.data.buildingId}`)
    router.refresh()
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-8">
      <FormError message={error} />

      <section className="space-y-5">
        <h2 className="text-title text-ink">You</h2>

        <Field
          label="What should we call your organization?"
          htmlFor="organisationName"
          hint="Your own name is fine if you own one building. It appears on receipts."
          error={fields.organisationName?.[0]}
          required
        >
          <Input
            id="organisationName"
            name="organisationName"
            placeholder="Karim Properties"
            aria-invalid={Boolean(fields.organisationName)}
          />
        </Field>
      </section>

      <section className="space-y-5 border-t border-line pt-8">
        <h2 className="text-title text-ink">The building</h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Building name"
            htmlFor="buildingName"
            error={fields.buildingName?.[0]}
            required
          >
            <Input id="buildingName" name="buildingName" placeholder="Nasreen Tower" />
          </Field>

          <Field
            label="Floors above ground"
            htmlFor="floorsCount"
            error={fields.floorsCount?.[0]}
            required
          >
            <Input
              id="floorsCount"
              name="floorsCount"
              inputMode="numeric"
              value={floors}
              onChange={(event) => setFloors(Number(event.target.value) || 0)}
              className="tabular font-mono"
            />
          </Field>

          <Field
            label="Street address"
            htmlFor="addressLine"
            className="sm:col-span-2"
            error={fields.addressLine?.[0]}
            required
          >
            <Input id="addressLine" name="addressLine" placeholder="Road 7, House 22" />
          </Field>

          <Field label="Area" htmlFor="area" error={fields.area?.[0]}>
            <Input id="area" name="area" placeholder="Mirpur DOHS" />
          </Field>

          <Field label="City" htmlFor="city" error={fields.city?.[0]}>
            <Input id="city" name="city" defaultValue="Dhaka" />
          </Field>
        </div>
      </section>

      <section className="space-y-5 border-t border-line pt-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-title text-ink">The units</h2>
            <p className="mt-1 max-w-[52ch] text-sm text-muted">
              Generate them now from a pattern, or add them one at a time later.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={generate}
              onChange={(event) => setGenerate(event.target.checked)}
              className="size-4 rounded-tile border-line accent-primary"
            />
            Generate now
          </label>
        </div>

        {generate && (
          <>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Units per floor" htmlFor="unitsPerFloor">
                <Input
                  id="unitsPerFloor"
                  name="unitsPerFloor"
                  inputMode="numeric"
                  value={perFloor}
                  onChange={(event) => setPerFloor(Number(event.target.value) || 0)}
                  className="tabular font-mono"
                />
              </Field>

              <Field label="Rent for each" htmlFor="monthlyRent" hint="Edit individually later.">
                <Input
                  id="monthlyRent"
                  name="monthlyRent"
                  inputMode="numeric"
                  defaultValue={0}
                  className="tabular font-mono"
                />
              </Field>

              <Field label="Rent day" htmlFor="rentDueDay" hint="1–28.">
                <Select id="rentDueDay" name="rentDueDay" defaultValue="5">
                  {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div>
              <p className="text-sm font-medium text-ink">
                {preview.length} unit{preview.length === 1 ? '' : 's'}: G to{' '}
                {Math.max(0, floors - 1)}
              </p>
              <div className="mt-2 max-h-32 overflow-y-auto rounded-control border border-line bg-raised/50 p-3">
                <div className="flex flex-wrap gap-1.5">
                  {preview.slice(0, 12).map((unit) => (
                    <span
                      key={unit.unitNumber}
                      className="tabular rounded-tile border border-line bg-surface px-2 py-1 font-mono text-xs text-ink"
                    >
                      {unit.unitNumber}
                    </span>
                  ))}
                  {overFreeLimit && (
                    <span className="rounded-tile bg-due-soft px-2 py-1 text-xs text-due">
                      +{preview.length - 12} beyond the Free plan
                    </span>
                  )}
                </div>
              </div>

              {overFreeLimit && (
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  The Free plan covers 12 units, so the first 12 are created now. Upgrade to Pro
                  and generate the rest from the building page — nothing is lost.
                </p>
              )}
            </div>
          </>
        )}
      </section>

      <div className="border-t border-line pt-6">
        <Button type="submit" size="lg" loading={pending}>
          {!pending && <Building2 />} Create my building
        </Button>
        <p className="mt-3 text-xs text-muted">
          You can change all of this afterwards. Nothing here is permanent.
        </p>
      </div>
    </form>
  )
}
