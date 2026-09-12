'use client'

import React, { useState } from 'react'
import { Copy, Check, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/providers/toast-provider'
import { revoke } from './actions'
import type { InviteSummary } from '@/services/invites.service'

export function InviteList({
  invites,
  orgId,
  siteUrl,
}: {
  invites: InviteSummary[]
  orgId: string
  siteUrl: string
}) {
  const { toast } = useToast()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ১-ক্লিকে database-backed member-specific link কপি ফাংশন
  const handleCopyLink = (link: string, id: string) => {
    navigator.clipboard.writeText(link)
    setCopiedId(id)
    toast({
      tone: 'success',
      title: 'Link Copied!',
      body: 'Invite link copied to clipboard.',
    })
    setTimeout(() => setCopiedId(null), 2000)
  }

  // ইনভাইট রিমুভ / বাতিল করার ফাংশন
  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to remove this invite?')) return

    setDeletingId(id)
    const res = await revoke(id, orgId)
    setDeletingId(null)

    if (!res.ok) {
      toast({
        tone: 'error',
        title: 'Failed',
        body: res.error || 'Could not delete invite.',
      })
      return
    }

    toast({
      tone: 'success',
      title: 'Invite Removed',
      body: 'Invite has been cancelled and rent share released.',
    })
  }

  if (!invites || invites.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted rounded-panel border border-line bg-surface">
        No invites sent yet.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-panel border border-line bg-surface">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line bg-surface-subtle text-xs uppercase text-muted">
          <tr>
            <th className="px-4 py-3">Invited Member</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Rent Share</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">1-Click Invite Link</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {invites.map((invite) => {
            const isPending = invite.status === 'pending'
            return (
              <tr key={invite.id} className="hover:bg-surface-subtle/40">
                <td className="px-4 py-3 font-medium text-ink">{invite.email}</td>
                <td className="px-4 py-3">
                  <span className="capitalize text-xs font-semibold bg-surface-subtle px-2 py-1 rounded">
                    {invite.role}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-emerald-500">
                  ৳{(invite.rentShare ?? 0).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      isPending
                        ? 'bg-amber-500/10 text-amber-500'
                        : invite.status === 'accepted'
                        ? 'bg-emerald-500/10 text-emerald-500'
                        : 'bg-rose-500/10 text-rose-500'
                    }`}
                  >
                    • {invite.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {isPending && invite.link ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs text-ink"
                      onClick={() => handleCopyLink(invite.link!, invite.id)}
                    >
                      {copiedId === invite.id ? (
                        <>
                          <Check className="size-3.5 text-emerald-500" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="size-3.5" /> Copy Invite Link
                        </>
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {isPending && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-rose-500 hover:bg-rose-500/10"
                      disabled={deletingId === invite.id}
                      onClick={() => handleRevoke(invite.id)}
                    >
                      {deletingId === invite.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                      <span className="ml-1 text-xs">Remove</span>
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
