'use client'

import React from 'react'
import type { FlatRentSummary } from '@/services/flats.service'

export function RentSummaryCard({ summary }: { summary: FlatRentSummary }) {
  const isOverLimit = summary.allocatedRent > summary.totalRent

  return (
    <div className="rounded-panel border border-line bg-surface p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between border-b border-line pb-3 gap-2">
        <div>
          <h3 className="text-title text-ink">Rent Allocation & Split</h3>
          <p className="text-xs text-muted">Flat Total Rent vs Member Distribution</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-muted block">Total Flat Rent</span>
          <span className="text-xl font-bold text-ink">৳{summary.totalRent.toLocaleString()}</span>
        </div>
      </div>

      {/* Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {/* Active Members Shares */}
        {summary.membersShares.map((m, idx) => (
          <div key={`m-${idx}`} className="p-3 rounded-lg bg-surface-subtle border border-line/60">
            <div className="text-xs font-semibold text-ink truncate">{m.name}</div>
            <div className="text-xs text-muted capitalize">{m.role} Share</div>
            <div className="text-base font-bold text-emerald-600 mt-1">
              ৳{m.share.toLocaleString()}
            </div>
          </div>
        ))}

        {/* Pending Invites Shares */}
        {summary.pendingShares.map((p, idx) => (
          <div key={`p-${idx}`} className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="text-xs font-semibold text-ink truncate">{p.email}</div>
            <div className="text-xs text-amber-600 font-medium">Pending Invite</div>
            <div className="text-base font-bold text-amber-600 mt-1">
              ৳{p.share.toLocaleString()}
            </div>
          </div>
        ))}

        {/* Remaining Unallocated Rent */}
        <div
          className={`p-3 rounded-lg border ${
            isOverLimit
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-600'
              : 'bg-primary/10 border-primary/20 text-primary'
          }`}
        >
          <div className="text-xs font-semibold">Remaining Unallocated</div>
          <div className="text-xs opacity-80">Available for new members</div>
          <div className="text-lg font-bold mt-1">
            ৳{summary.remainingRent.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  )
}