'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { reportProblemAction } from '@/app/(app)/maintenance/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import { RESPONSE_HOURS, type MaintenancePriority } from '@/lib/maintenance'

const CATEGORIES = [
  { value: 'repair', label: 'Repair — tap, door, wall' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'water', label: 'Water' },
  { value: 'gas', label: 'Gas' },
  { value: 'lift', label: 'Lift' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'security', label: 'Security' },
  { value: 'internet', label: 'Internet' },
  { value: 'other', label: 'Something else' },
] as const

const PRIORITIES: { value: MaintenancePriority; label: string }[] = [
  { value: 'low', label: 'Low — whenever someone is passing' },
  { value: 'normal', label: 'Normal — this week' },
  { value: 'high', label: 'High — it is affecting daily life' },
  { value: 'urgent', label: 'Urgent — water, gas, or someone stuck' },
]

/**
 * Reporting a problem. The response target is shown as the priority changes,
 * because "urgent" means something the building has to answer in four hours,
 * not a way to feel heard.
 */
export function ReportProblem({
  flats,
  buildingId,
}: {
  flats: { id: string; label: string; buildingId: string }[]
  buildingId?: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<Record<string, string[]>>({})
  const [priority, setPriority] = React.useState<MaintenancePriority>('normal')
  const [flatId, setFlatId] = React.useState(flats[0]?.id ?? '')
  const formRef = React.useRef<HTMLFormElement>(null)

  const chosenBuilding =
    flats.find((flat) => flat.id === flatId)?.buildingId ??
    buildingId ??
    flats[0]?.buildingId

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const data = Object.fromEntries(new FormData(event.currentTarget)) as Record<
      string,
      string
    >
    setPending(true)
    setError(null)
    setFields({})

    const result = await reportProblemAction({
      ...data,
      buildingId: chosenBuilding,
      flatId: data.flatId || undefined,
    })
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
      title: `Reported as ${result.data.reference}`,
      body: 'Use that number when you talk to the caretaker.',
    })
    router.refresh()
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Report a problem
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Report a problem"
        description="It gets a reference number you can quote on the phone, and everyone involved can see what has been done."
      >
        <form ref={formRef} onSubmit={submit} noValidate className="space-y-5 pb-2">
          <FormError message={error} />

          <Field label="What is wrong" htmlFor="title" error={fields.title?.[0]} required>
            <Input id="title" name="title" placeholder="Lift stops between 3 and 4" />
          </Field>

          <Field
            label="Tell us more"
            htmlFor="description"
            error={fields.description?.[0]}
            hint="When it started, when it happens, anything you have already tried."
            required
          >
            <Textarea
              id="description"
              name="description"
              rows={4}
              placeholder="It jerks and stops for about ten seconds between the third and fourth floor, mostly in the evening."
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            {flats.length > 0 && (
              <Field
                label="Which flat"
                htmlFor="flatId"
                hint="Leave blank if it is the building."
              >
                <Select
                  id="flatId"
                  name="flatId"
                  value={flatId}
                  onChange={(event) => setFlatId(event.target.value)}
                >
                  {flats.map((flat) => (
                    <option key={flat.id} value={flat.id}>
                      {flat.label}
                    </option>
                  ))}
                  <option value="">The building, not one flat</option>
                </Select>
              </Field>
            )}

            <Field label="Kind" htmlFor="category">
              <Select id="category" name="category" defaultValue="repair">
                {CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label="How urgent"
            htmlFor="priority"
            hint={`The building aims to respond within ${RESPONSE_HOURS[priority]} hours.`}
          >
            <Select
              id="priority"
              name="priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as MaintenancePriority)}
            >
              {PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              Report it
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
