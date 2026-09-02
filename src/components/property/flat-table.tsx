'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, Archive } from 'lucide-react'
import { archiveFlatAction } from '@/app/(app)/admin/actions'
import { formatTaka } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Dropdown, DropdownItem } from '@/components/ui/dropdown'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/layout/page-header'
import { FlatForm } from './flat-form'
import { useToast } from '@/components/providers/toast-provider'
import type { FlatWithCounts } from '@/services/flats.service'
import type { OccupancyStatus } from '@/types'

const statusLabel: Record<OccupancyStatus, string> = {
  occupied: 'Occupied',
  vacant: 'Vacant',
  reserved: 'Reserved',
  not_rentable: 'Not rentable',
}

const statusTone: Record<OccupancyStatus, 'paid' | 'due' | 'neutral'> = {
  occupied: 'paid',
  vacant: 'neutral',
  reserved: 'due',
  not_rentable: 'neutral',
}

/**
 * Filtering happens in the browser: a building has tens of flats, not
 * thousands, so a round trip per keystroke would be slower and no more
 * correct. The org-wide screen paginates on the server when that changes.
 */
export function FlatTable({
  flats,
  buildingId,
  showBuilding = false,
}: {
  flats: (FlatWithCounts & { buildingName?: string })[]
  buildingId?: string
  showBuilding?: boolean
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<'all' | OccupancyStatus>('all')
  const [archiving, setArchiving] = React.useState<FlatWithCounts | null>(null)
  const [pending, setPending] = React.useState(false)

  const query = useDebouncedValue(search, 200).trim().toLowerCase()

  const rows = flats.filter((flat) => {
    if (status !== 'all' && flat.occupancy_status !== status) return false
    if (!query) return true
    return (
      flat.unit_number.toLowerCase().includes(query) ||
      (flat.moderatorName ?? '').toLowerCase().includes(query) ||
      (flat.buildingName ?? '').toLowerCase().includes(query)
    )
  })

  async function archive() {
    if (!archiving) return
    setPending(true)
    const result = await archiveFlatAction(
      archiving.id,
      buildingId ?? archiving.building_id,
    )
    setPending(false)

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not archive', body: result.error })
      return
    }

    toast({ tone: 'success', title: `Flat ${archiving.unit_number} archived` })
    setArchiving(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search unit, moderator…"
          aria-label="Search flats"
          className="max-w-xs"
        />
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
          aria-label="Filter by status"
          className="max-w-[12rem]"
        >
          <option value="all">All statuses</option>
          {(Object.keys(statusLabel) as OccupancyStatus[]).map((value) => (
            <option key={value} value={value}>
              {statusLabel[value]}
            </option>
          ))}
        </Select>
        <p className="tabular self-center font-mono text-xs text-muted">
          {rows.length} of {flats.length}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No flats match"
          body="Clear the search or pick a different status to see the rest."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Unit</TH>
              {showBuilding && <TH>Building</TH>}
              <TH>Floor</TH>
              <TH>Rent</TH>
              <TH>Residents</TH>
              <TH>Moderator</TH>
              <TH>Outstanding</TH>
              <TH>Status</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((flat) => (
              <TR key={flat.id}>
                <TD className="tabular font-mono text-xs font-medium">
                  {flat.unit_number}
                </TD>
                {showBuilding && (
                  <TD className="text-sm text-muted">{flat.buildingName}</TD>
                )}
                <TD className="tabular font-mono text-xs text-muted">{flat.floor}</TD>
                <TD className="tabular font-mono">
                  {formatTaka(Number(flat.monthly_rent))}
                </TD>
                <TD className="tabular font-mono text-xs">{flat.residents || '—'}</TD>
                <TD className="text-sm text-muted">{flat.moderatorName ?? '—'}</TD>
                <TD
                  className={
                    flat.outstanding > 0
                      ? 'tabular font-mono text-overdue'
                      : 'tabular font-mono text-muted'
                  }
                >
                  {flat.outstanding > 0 ? formatTaka(flat.outstanding) : '—'}
                </TD>
                <TD>
                  <Badge tone={statusTone[flat.occupancy_status]} dot>
                    {statusLabel[flat.occupancy_status]}
                  </Badge>
                </TD>
                <TD>
                  <Dropdown
                    trigger={
                      <Button
                        variant="quiet"
                        size="icon-sm"
                        aria-label={`Actions for ${flat.unit_number}`}
                      >
                        <MoreHorizontal />
                      </Button>
                    }
                  >
                    <FlatForm
                      buildingId={buildingId ?? flat.building_id}
                      flat={flat}
                      trigger={
                        <DropdownItem>
                          <Pencil className="size-4" /> Edit flat
                        </DropdownItem>
                      }
                    />
                    <DropdownItem
                      className="text-overdue"
                      onClick={() => setArchiving(flat)}
                    >
                      <Archive className="size-4" /> Archive
                    </DropdownItem>
                  </Dropdown>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Modal
        open={Boolean(archiving)}
        onClose={() => setArchiving(null)}
        title={`Archive flat ${archiving?.unit_number}?`}
        description="The flat disappears from lists, but its dues, payments and history stay. A flat with active residents cannot be archived."
        footer={
          <>
            <Button variant="ghost" onClick={() => setArchiving(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={pending} onClick={archive}>
              Archive flat
            </Button>
          </>
        }
      />
    </div>
  )
}
