'use client'

import React, { useState } from 'react'
import { DynamicRentSummary } from '@/services/flats.service'

interface Props {
  initialSummary: DynamicRentSummary
  onInviteCreate: (email: string, rentShare: number) => Promise<void>
  onInviteRevoke: (inviteId: string) => Promise<void>
  onMemberDeactivate: (memberId: string) => Promise<void>
  onRentShareUpdate: (memberId: string, share: number) => Promise<void>
}

export default function FlatManagementView({
  initialSummary,
  onInviteCreate,
  onInviteRevoke,
  onMemberDeactivate,
}: Props) {
  const [summary] = useState<DynamicRentSummary>(initialSummary)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRent, setInviteRent] = useState<number>(0)
  const [loading, setLoading] = useState(false)

  const handleCopyLink = async (token?: string) => {
    if (!token) return

    const link = `${window.location.origin}/invite/${token}`

    await navigator.clipboard.writeText(link)
    setCopiedToken(token)

    window.setTimeout(() => {
      setCopiedToken(null)
    }, 2500)
  }

  const handleSendInvite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!inviteEmail || inviteRent <= 0) {
      return
    }

    if (inviteRent > summary.remainingRent) {
      alert(
        `Rent share cannot exceed remaining unallocated rent: ৳${summary.remainingRent.toLocaleString()}`,
      )
      return
    }

    setLoading(true)

    try {
      await onInviteCreate(inviteEmail, inviteRent)

      setInviteEmail('')
      setInviteRent(0)

      window.location.reload()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to send invite'

      alert(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen space-y-8 bg-slate-950 p-6 text-white">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Total Flat Rent</p>
          <p className="text-3xl font-bold text-emerald-400">
            ৳{summary.totalRent.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Moderator Share</p>
          <p className="text-3xl font-bold text-blue-400">
            ৳{summary.moderatorShare.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Total Allocated Rent</p>
          <p className="text-3xl font-bold text-purple-400">
            ৳{summary.allocatedRent.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Remaining Unallocated</p>
          <p className="text-3xl font-bold text-amber-400">
            ৳{summary.remainingRent.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h3 className="mb-4 text-lg font-semibold">
          Invite New Resident & Split Rent
        </h3>

        <form
          onSubmit={handleSendInvite}
          className="flex flex-col gap-4 md:flex-row"
        >
          <input
            type="email"
            placeholder="Member Email"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-white outline-none focus:border-blue-500"
            required
          />

          <input
            type="number"
            min="1"
            placeholder="Assigned Rent Share (৳)"
            value={inviteRent || ''}
            onChange={(event) => setInviteRent(Number(event.target.value))}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-white outline-none focus:border-blue-500 md:w-48"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Invite'}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h3 className="mb-4 text-lg font-semibold">
          Flat Members & Pending Invitations
        </h3>

        <div className="divide-y divide-slate-800">
          {summary.members.map((member, index) => {
            const memberId = member.id

            return (
              <div
                key={memberId ?? `${member.email ?? 'member'}-${index}`}
                className="flex flex-col items-center justify-between gap-4 py-4 md:flex-row"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">
                      {member.name}
                    </span>

                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        member.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}
                    >
                      {member.status === 'active'
                        ? member.role
                        : 'Pending Invite'}
                    </span>
                  </div>

                  <p className="text-sm text-slate-400">
                    {member.email || 'No email profile'}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xl font-bold text-emerald-400">
                    ৳{member.share.toLocaleString()}
                  </span>

                  {member.status === 'pending' && member.token && (
                    <button
                      type="button"
                      onClick={() => handleCopyLink(member.token)}
                      className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs transition hover:bg-slate-700"
                    >
                      {copiedToken === member.token
                        ? '✓ Copied!'
                        : '📋 Copy Invite Link'}
                    </button>
                  )}

                  {member.status === 'pending' ? (
                    <button
                      type="button"
                      disabled={!memberId}
                      onClick={async () => {
                        if (!memberId) return

                        await onInviteRevoke(memberId)
                        window.location.reload()
                      }}
                      className="rounded-md bg-rose-500/10 px-3 py-1.5 text-xs text-rose-400 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  ) : member.role !== 'moderator' ? (
                    <button
                      type="button"
                      disabled={!memberId}
                      onClick={async () => {
                        if (!memberId) return

                        await onMemberDeactivate(memberId)
                        window.location.reload()
                      }}
                      className="rounded-md bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Inactivate
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}