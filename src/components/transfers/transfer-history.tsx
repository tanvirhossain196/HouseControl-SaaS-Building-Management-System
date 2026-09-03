'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Undo2 } from 'lucide-react'
import { rollbackTransferAction } from '@/app/(app)/flats/transfer-actions'
import { withinRollbackWindow } from '@/lib/handover-windows'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, Textarea } from '@/components/ui/input'
import { useToast } from '@/components/providers/toast-provider'
import type { TransferView } from '@/services/transfers.service'

const tone = {
  pending: 'due',
  accepted: 'paid',
  rejected: 'neutral',
  expired: 'neutral',
  rolled_back: 'overdue',
} as const

/** Who ran this flat, when it changed, and the owner's undo while it lasts. */
export function TransferHistory({
  transfers,
  flatId,
  canRollback,
}: {
  transfers: TransferView[]
  flatId: string
  canRollback: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [undoing, setUndoing] = React.useState<TransferView | null>(null)
  const [reason, setReason] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (transfers.length === 0) {
    return (
      <p className="text-sm text-muted">
        The role has not changed hands yet. When it does, every step is recorded here.
      </p>
    )
  }

  async function rollback() {
    if (!undoing) return
    setPending(true)
    setError(null)

    const result = await rollbackTransferAction({
      transferId: undoing.id,
      flatId,
      reason,
    })
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    toast({
      tone: 'success',
      title: 'Handover undone',
      body: 'The previous moderator is back.',
    })
    setUndoing(null)
    setReason('')
    router.refresh()
  }

  return (
    <>
      <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
        {transfers.map((transfer) => {
          const undoable =
            canRollback &&
            transfer.status === 'accepted' &&
            withinRollbackWindow(transfer.rollback_deadline)

          return (
            <li
              key={transfer.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  {transfer.fromName ?? 'Someone'} → {transfer.toName ?? 'someone'}
                </p>
                <p className="tabular mt-1 font-mono text-xs text-muted">
                  {(transfer.responded_at ?? transfer.created_at).slice(0, 10)}
                  {transfer.rolled_back_at &&
                    ` · undone ${transfer.rolled_back_at.slice(0, 10)}`}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Badge tone={tone[transfer.status] ?? 'neutral'} dot>
                  {transfer.status.replace('_', ' ')}
                </Badge>
                {undoable && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUndoing(transfer)}
                  >
                    <Undo2 /> Undo
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <Modal
        open={Boolean(undoing)}
        onClose={() => setUndoing(null)}
        title="Undo this handover?"
        description={`${undoing?.toName ?? 'The new moderator'} loses the role and ${undoing?.fromName ?? 'the previous one'} gets it back. Both are told, and the reason goes on the audit log.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setUndoing(null)}>
              Leave it
            </Button>
            <Button variant="danger" loading={pending} onClick={rollback}>
              Undo handover
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <p className="text-sm text-overdue">{error}</p>}
          <Field label="Reason" htmlFor="rollbackReason" required>
            <Textarea
              id="rollbackReason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="The handover was made under pressure; reverting at the residents' request."
            />
          </Field>
        </div>
      </Modal>
    </>
  )
}
