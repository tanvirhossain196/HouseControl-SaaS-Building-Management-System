'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { bulkCreateFlatsAction } from '@/app/(app)/admin/actions'
import { planUnits, type BulkPlan } from '@/lib/units'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'

/**
 * Fills a building in one go. The preview is computed by the same pure
 * function the server uses, so what the owner sees is exactly what is created.
 */
export function BulkFlatsForm({
  buildingId,
  floorsCount,
  trigger,
}: {
  buildingId: string
  floorsCount: number
  trigger: React.ReactElement
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [plan, setPlan] = React.useState<BulkPlan>({
    fromFloor: 0,
    toFloor: Math.max(1, floorsCount - 1),
    unitsPerFloor: 2,
    floorStyle: 'ground_g',
    unitStyle: 'floor_letter',
  })
  const [monthlyRent, setMonthlyRent] = React.useState('0')
  const [rentDueDay, setRentDueDay] = React.useState('5')

  const preview = React.useMemo(() => {
    if (plan.toFloor < plan.fromFloor) return []
    return planUnits(plan)
  }, [plan])

  const set = <K extends keyof BulkPlan>(key: K, value: BulkPlan[K]) =>
    setPlan((current) => ({ ...current, [key]: value }))

  async function submit() {
    if (pending) return
    setPending(true)
    setError(null)

    const result = await bulkCreateFlatsAction({
      buildingId,
      ...plan,
      skipFloors: [],
      monthlyRent,
      rentDueDay,
    })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    setOpen(false)
    toast({
      tone: 'success',
      title: `${result.data.created} units created`,
      body: result.data.skipped.length
        ? `${result.data.skipped.length} already existed and were left alone.`
        : undefined,
    })
    router.refresh()
  }

  return (
    <>
      {React.cloneElement(trigger, { onClick: () => setOpen(true) })}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Generate units"
        description="Set the pattern once. Units that already exist are skipped, not overwritten."
        className="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={pending} disabled={preview.length === 0}>
              Create {preview.length} unit{preview.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <div className="space-y-5 pb-2">
          <FormError message={error} />

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="From floor" htmlFor="fromFloor" hint="−1 for a basement">
              <Input
                id="fromFloor"
                inputMode="numeric"
                value={plan.fromFloor}
                onChange={(e) => set('fromFloor', Number(e.target.value))}
                className="tabular font-mono"
              />
            </Field>
            <Field label="To floor" htmlFor="toFloor">
              <Input
                id="toFloor"
                inputMode="numeric"
                value={plan.toFloor}
                onChange={(e) => set('toFloor', Number(e.target.value))}
                className="tabular font-mono"
              />
            </Field>
            <Field label="Units per floor" htmlFor="unitsPerFloor">
              <Input
                id="unitsPerFloor"
                inputMode="numeric"
                value={plan.unitsPerFloor}
                onChange={(e) => set('unitsPerFloor', Number(e.target.value))}
                className="tabular font-mono"
              />
            </Field>

            <Field label="Ground floor is" htmlFor="floorStyle">
              <Select
                id="floorStyle"
                value={plan.floorStyle}
                onChange={(e) =>
                  set('floorStyle', e.target.value as BulkPlan['floorStyle'])
                }
              >
                <option value="ground_g">G, then 1, 2, 3</option>
                <option value="ground_zero">0, then 1, 2, 3</option>
                <option value="ground_one">1, then 2, 3, 4</option>
              </Select>
            </Field>

            <Field label="Unit numbers" htmlFor="unitStyle">
              <Select
                id="unitStyle"
                value={plan.unitStyle}
                onChange={(e) =>
                  set('unitStyle', e.target.value as BulkPlan['unitStyle'])
                }
              >
                <option value="floor_letter">3A, 3B</option>
                <option value="floor_index">301, 302</option>
                <option value="letter_only">A, B</option>
              </Select>
            </Field>

            <Field
              label="Rent for each"
              htmlFor="bulkRent"
              hint="Edit individual flats after."
            >
              <Input
                id="bulkRent"
                inputMode="numeric"
                value={monthlyRent}
                onChange={(e) => setMonthlyRent(e.target.value)}
                className="tabular font-mono"
              />
            </Field>
          </div>

          <Field label="Rent day" htmlFor="bulkDueDay" hint="1–28">
            <Input
              id="bulkDueDay"
              inputMode="numeric"
              value={rentDueDay}
              onChange={(e) => setRentDueDay(e.target.value)}
              className="tabular w-24 font-mono"
            />
          </Field>

          <div>
            <p className="text-sm font-medium text-ink">
              Preview — {preview.length} unit{preview.length === 1 ? '' : 's'}
            </p>
            <div className="mt-2 max-h-40 overflow-y-auto rounded-control border border-line bg-raised/50 p-3">
              {preview.length === 0 ? (
                <p className="text-sm text-muted">
                  The top floor is below the bottom floor, so nothing would be created.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {preview.map((unit) => (
                    <span
                      key={unit.unitNumber}
                      className="tabular rounded-tile border border-line bg-surface px-2 py-1 font-mono text-xs text-ink"
                    >
                      {unit.unitNumber}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
}
