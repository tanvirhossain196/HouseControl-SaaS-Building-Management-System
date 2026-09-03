# Moderator handover

Handing over a flat's moderator role is the one action where a person gives away authority
over other people's money. It takes four things rather than a confirm dialog.

| Step | Who | Why |
| --- | --- | --- |
| 1. Start and prove it is you | outgoing moderator | a code to the number they verified in Phase 3 |
| 2. Accept | incoming resident | nobody is made responsible for a ledger without agreeing |
| 3. Notification | the building's owners | they find out when it happens, not next month |
| 4. Undo, for seven days | owner | for the handover that should not have happened |

Neither party can complete it alone, and neither can edit their own offer — every write
runs with the service role so the role swap and the transfer row move together.

## The code

Six digits from `randomInt`, not `Math.random()`: a predictable generator is exactly the
weakness available to someone who already holds one flat in the building.

Stored as `sha256(transferId : code : serverSecret)`, never in plain text. Two properties
follow from that salt:

- The same code in a different handover hashes differently, so a code seen once cannot be
  replayed against another flat.
- A leaked database row is not enough to reconstruct a working code without `OTP_SECRET`.

Ten minutes to live, five attempts, one resend per minute. **Lockout and expiry are
decided before the code is compared**, so a locked transfer answers identically whether
the guess was right or wrong — otherwise the lockout itself becomes an oracle.

## Windows

| Thing | Length |
| --- | --- |
| Code validity | 10 minutes |
| Offer validity | 48 hours |
| Owner's undo | 7 days |
| Between accepted handovers on one flat | 24 hours |

The 24-hour cooldown is a database trigger, not application code. A flat cannot be passed
around in circles to shake off an audit trail.

## Rollback

Undoing swaps the roles back, notifies both people, and records the reason. It refuses
when the previous moderator has since left the flat — the role cannot be handed back to
somebody who is gone, and the owner is told to assign someone directly instead.

The transfer row is never deleted. `rolled_back` is a status, so the history shows that
the role moved and then moved back, which is the thing an owner needs to see.

## What the database enforces on its own

Verified against a live Postgres instance:

| Attempt | Result |
| --- | --- |
| A second handover while one is pending | rejected by `moderator_transfers_one_pending` |
| Handing the role to yourself | rejected by `transfer_distinct_parties` |
| Accepting without a verified code | rejected by `transfer_accept_needs_otp` |
| A second handover within 24 hours | rejected by the cooldown trigger |
| Recording a sixth wrong guess | rejected by `transfer_attempts_capped` |
| Two moderators on one flat | rejected by `flat_members_single_moderator` |

That last one is why acceptance steps the old moderator down before promoting the new one,
and puts them back if the promotion fails — a flat with no moderator is worse than a
handover that did not happen.

## Where the code lives

`src/lib/handover-windows.ts` holds the timing rules and is safe to import anywhere —
the rollback button needs `withinRollbackWindow` in the browser. `src/lib/otp.ts` holds
the crypto and is server-only; it re-exports the windows so server code has one import.
Bundling `node:crypto` into a client component fails the build, which is the right
failure: nothing that generates or hashes a code belongs in the browser.

## Configuration

```
OTP_SECRET=            # falls back to SUPABASE_SERVICE_ROLE_KEY if unset
```

Codes are delivered as notifications until Phase 11 wires SMS. In development the code is
also written to the server log; in production it never is.

## The owner's direct assignment

`assignModerator` in `residents.service.ts` still exists for the flat whose moderator has
gone quiet and cannot be reached. It skips consent by design, which is why it is logged as
`moderator.assigned_by_owner` rather than as a handover — the audit log distinguishes the
two, and it should.
