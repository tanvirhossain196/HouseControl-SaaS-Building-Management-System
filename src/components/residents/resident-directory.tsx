'use client'

import * as React from 'react'
import Link from 'next/link'
import { formatTaka } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input, Select } from '@/components/ui/input'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { EmptyState } from '@/components/layout/page-header'
import type { DirectoryEntry } from '@/services/residents.service'

export function ResidentDirectory({ residents }: { residents: DirectoryEntry[] }) {
  const [search, setSearch] = React.useState('')
  const [role, setRole] = React.useState<'all' | 'moderator' | 'resident'>('all')
  const query = useDebouncedValue(search, 200).trim().toLowerCase()

  const rows = residents.filter((resident) => {
    if (role !== 'all' && resident.role !== role) return false
    if (!query) return true
    return [resident.fullName, resident.email, resident.unitNumber, resident.buildingName]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, unit…"
          aria-label="Search residents"
          className="max-w-xs"
        />
        <Select
          value={role}
          onChange={(event) => setRole(event.target.value as typeof role)}
          aria-label="Filter by role"
          className="max-w-[11rem]"
        >
          <option value="all">All roles</option>
          <option value="moderator">Moderators</option>
          <option value="resident">Residents</option>
        </Select>
        <p className="tabular self-center font-mono text-xs text-muted">
          {rows.length} of {residents.length}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nobody matches"
          body="Clear the search to see everyone again."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Person</TH>
              <TH>Flat</TH>
              <TH>Role</TH>
              <TH>Rent share</TH>
              <TH>Outstanding</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((resident) => (
              <TR key={resident.id}>
                <TD>
                  <span className="flex items-center gap-3">
                    <Avatar name={resident.fullName} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">
                        {resident.fullName}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {resident.email}
                      </span>
                    </span>
                  </span>
                </TD>
                <TD>
                  <Link
                    href={`/flats/${resident.flatId}`}
                    className="tabular font-mono text-xs text-primary hover:underline"
                  >
                    {resident.unitNumber}
                  </Link>
                  <span className="block text-xs text-muted">
                    {resident.buildingName}
                  </span>
                </TD>
                <TD>
                  <Badge tone={resident.role === 'moderator' ? 'primary' : 'neutral'}>
                    {resident.role}
                  </Badge>
                </TD>
                <TD className="tabular font-mono">{formatTaka(resident.rentShare)}</TD>
                <TD
                  className={
                    resident.outstanding > 0
                      ? 'tabular font-mono text-overdue'
                      : 'tabular font-mono text-muted'
                  }
                >
                  {resident.outstanding > 0 ? formatTaka(resident.outstanding) : '—'}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  )
}
