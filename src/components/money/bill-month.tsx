'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { billMonthAction } from '@/app/(app)/payments/actions'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Field, Select } from '@/components/ui/input'
import { FormError } from '@/components/auth/form-error'
import { useToast } from '@/components/providers/toast-provider'
import { periodLabel, periodOf, previousPeriod } from '@/lib/billing'

/**
 * Billing a month is idempotent, so the dangerous-looking button is not
 * actually dangerous — running it twice creates nothing the second time. The
 * copy says so, because otherwise nobody presses it.
 */
export function BillMonth({
  scope,
  id,
  label,
}: {
  scope: 'flat' | 'building'
  id: string
  label: string
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [skipped, setSkipped] = React.useState<string[]>([])

  const current = periodOf()
  const periods = [current, previousPeriod(current)]
  const [period, setPeriod] = React.useState(current)

  async function bill() {
    setPending(true)
    setError(null)
    setSkipped([])

    const result = await billMonthAction({ scope, id, period })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    if (result.data.skipped.length > 0) setSkipped(result.data.skipped)

    toast({
      tone: result.data.created > 0 ? 'success' : 'info',
      title:
        result.data.created > 0
          ? `${result.data.created} charge${result.data.created === 1 ? '' : 's'} raised`
          : 'Already billed',
      body:
        result.data.created > 0
          ? `${periodLabel(period)} is on the ledger.`
          : `${periodLabel(period)} was billed earlier. Nothing was duplicated.`,
    })

    if (result.data.skipped.length === 0) setOpen(false)
    router.refresh()
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Receipt /> Bill a month
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Bill rent for ${label}`}
        description="Raises one charge per resident, sized by their share of the rent. Running it again on the same month changes nothing."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={pending} onClick={bill}>
              Bill {periodLabel(period)}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormError message={error} />

          <Field label="Month" htmlFor="billPeriod">
            <Select
              id="billPeriod"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
            >
              {periods.map((option) => (
                <option key={option} value={option}>
                  {periodLabel(option)}
                </option>
              ))}
            </Select>
          </Field>

          {skipped.length > 0 && (
            <div className="rounded-control border border-due/30 bg-due-soft p-3">
              <p className="text-sm font-medium text-ink">Some flats were not billed</p>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {skipped.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
