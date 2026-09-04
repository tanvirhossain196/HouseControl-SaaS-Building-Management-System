# Runbook

What to do when something is wrong, in the order you will actually need it.

## "Nobody can sign in"

1. `curl https://yourdomain.com/api/health?deep=1` — if `database: down`, the problem is
   Supabase, not the app.
2. Check the Supabase project is not paused. Free projects pause after a week idle.
3. Check `NEXT_PUBLIC_SUPABASE_URL` and the anon key against the project — a rotated key
   fails exactly like a wrong one.
4. If Google sign-in alone fails, the OAuth client or the redirect allow list changed. The
   email path will still work; say so in the status message rather than letting people
   retry Google.

## "A resident says they paid and it still shows overdue"

That is the design, not a fault: nothing moves until a moderator confirms it. Check
`/payments` for a pending row.

If it was confirmed and the balance did not move, look at the due directly — `amount_paid`
is written by a trigger, so a stuck balance means the payment is not linked to a due
(`due_id` is null). Link it and re-confirm; do not edit `amount_paid` by hand, because the
trigger will overwrite it on the next payment against that due.

## "An online payment was taken but the app does not show it"

The callback is the only thing that confirms a gateway payment. Look in `webhook_events`
for the transaction:

| `outcome`     | What happened                                           | What to do                                                                 |
| ------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| no row at all | the callback never arrived                              | check the IPN URL in the merchant panel                                    |
| `invalid`     | the signature did not verify                            | check `SSLCOMMERZ_STORE_PASSWORD`                                          |
| `rejected`    | the gateway said it failed, or the amount did not match | read `error`; the money was not taken, or was taken for a different figure |
| `duplicate`   | already confirmed                                       | nothing; look again at `payments`                                          |
| `error`       | our validation call failed                              | retry from the merchant panel                                              |

Never confirm a gateway payment by hand to "fix" it. If the gateway did not confirm it,
the money may not exist, and a confirmed payment issues a receipt.

## "Reminders stopped"

The job returns counts. Call it by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/reminders
```

- `401` — the secret does not match the scheduler's.
- `500` — `CRON_SECRET` is unset in the environment.
- `{"upcoming":0,"dueToday":0,"overdue":0}` every day — probably correct if nothing was
  billed. Check that a month was actually billed before assuming the job is broken.

Running it repeatedly is safe.

## "Somebody has the wrong access"

Roles live in two tables: `org_members` for owners and guards, `flat_members` for
moderators and residents. `profiles.platform_role` only matters for `super_admin`.

Do not edit roles in the SQL editor if you can avoid it — the app's paths write audit rows
and the SQL editor does not, so the change becomes invisible six months later. Use
`/admin/team` and `/flats/[id]`.

If a moderator handover went wrong, the owner has seven days to undo it from the flat page.
After that, assign directly and the audit log records it as `moderator.assigned_by_owner`,
which is a different thing from a consented handover and should read that way.

## "Emails or texts are not arriving"

`message_deliveries` has a row per attempt.

- `status = 'skipped'`, error `quiet hours` — held until 8am Dhaka. Working as intended.
- `status = 'skipped'`, no provider key — the deployment has no contract for that channel.
- `status = 'failed'` — read `error`. An expired key and a bounced address look different.
- No row at all — the person's preferences have that channel off, or they have no verified
  phone. Check `notification_preferences`.

## "The site is slow"

1. Is it one screen or all of them? One screen means a query; all of them means the
   database or the platform.
2. `/api/health?deep=1` reports `databaseMs`. Over ~200ms from the same region means the
   database, not the app.
3. If a list screen is slow, it is nearly always a missing index on a new query. `EXPLAIN`
   it; `docs/PERFORMANCE.md` has the method and the two that were found that way.

## "We need to undo a deploy"

Roll back the application on the platform. Do **not** roll back the database: migrations
are additive precisely so the previous release runs against the newer schema.

If a migration is the problem, write a new one that corrects it. Editing one that has
already run leaves two environments with the same version and different schemas.

## Things that are safe to do twice

Billing a month, running the reminder job, replaying a gateway callback, calling the health
check. All of them are idempotent, and the guarantee is a database constraint rather than a
check in the code — so it holds even when two of them run at once.
