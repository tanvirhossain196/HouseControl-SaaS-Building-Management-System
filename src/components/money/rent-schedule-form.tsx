'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CalendarCog } from 'lucide-react'

import { updateRentScheduleAction } from '@/app/(app)/payments/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Select } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import { periodLabel, periodOf } from '@/lib/billing'

/**
 * The moderator decides when rent falls due for a flat they run.
 *
 * Capped at the 28th so every month has the day. A rent day of the 30th would
 * silently become the 28th each February, and a resident who thought they had
 * two more days would be marked late through no fault of their own.
 *
 * Changing the day always applies to future months. Whether it also moves this
 * month's unpaid charges is asked rather than assumed — mid-month it is usually
 * yes, and just after billing it is usually no.
 */
export function RentScheduleForm({
  flatId,
  currentDay,
  unitNumber,
}: {
  flatId: string
  currentDay: number
  unitNumber: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [day, setDay] = React.useState(String(currentDay))
  const [applyNow, setApplyNow] = React.useState(true)

  const period = periodOf()

  async function save() {
    if (pending) return

    setPending(true)
    setError(null)

    const result = await updateRentScheduleAction({
      flatId,
      rentDueDay: day,
      applyToOpenDues: applyNow,
      period,
    })

    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      tone: 'success',
      title: `Rent day set to the ${result.data.dueDay}`,
      body:
        result.data.duesMoved > 0
          ? `${result.data.duesMoved} unpaid charge${
              result.data.duesMoved === 1 ? '' : 's'
            } for ${periodLabel(period)} moved too.`
          : 'It applies from the next month you bill.',
    })

    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <CalendarCog /> Rent day
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Rent day for flat ${unitNumber}`}
        description="Which day of the month rent falls due. Paid charges are never moved."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button loading={pending} onClick={save}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />

          <Field
            label="Due on the"
            htmlFor="rentDueDay"
            hint="The 28th is the latest, so the day exists in February too."
          >
            <Select
              id="rentDueDay"
              value={day}
              onChange={(event) => setDay(event.target.value)}
            >
              {Array.from({ length: 28 }, (_, index) => index + 1).map((value) => (
                <option key={value} value={String(value)}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>

          <label className="flex items-start gap-3 rounded-control border border-line bg-raised/50 p-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={applyNow}
              onChange={(event) => setApplyNow(event.target.checked)}
              className="mt-0.5 size-4 rounded-tile border-line accent-primary"
            />

            <span>
              Move {periodLabel(period)} too
              <span className="mt-0.5 block text-xs text-muted">
                Only charges nobody has paid against yet. Anything already paid
                or part-paid keeps its original date.
              </span>
            </span>
          </label>
        </div>
      </Modal>
    </>
  )
}