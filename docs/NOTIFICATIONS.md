# Notifications

Three things decide whether people keep notifications turned on: how often they arrive,
when they arrive, and whether the same thing arrives twice. All three are decided by pure
functions in `src/lib/notifications.ts`, and all three are tested.

## Channels

| Channel | Cost | Wakes anyone | Used for |
| --- | --- | --- | --- |
| In-app | none | no | everything, always |
| Email | negligible | no | most things |
| SMS | per message | yes | overdue rent, rejected payments, handover codes |
| Push | none | yes | reserved for the mobile app |

**Every notice leaves an in-app row, even when the person has switched everything off.**
Otherwise "I was never told" has no answer in either direction.

**SMS is only ever selected for an event with a short version written for it.** A missing
160-character template would otherwise send a truncated body and bill for two messages.
The test asserts this across the whole catalogue rather than trusting the person adding
the next event to remember.

## Quiet hours

No SMS or push between 10pm and 8am, Dhaka time — the server's clock is irrelevant and the
code says so. Email and in-app go out regardless: neither makes a phone ring.

Urgent events pass through anyway. A visitor at the gate at 3am is exactly when you want to
know, and a handover code held until morning is useless.

A held message is not dropped. Its noisy channels are parked with `send_after` set to 8am
the next morning, and the daily job releases them.

## Deduplication

The key is `event:user:subject:day`.

A reminder job that runs hourly, a webhook the provider retries, a page someone refreshes —
all of them ask to notify again. The unique index on `notifications.dedupe_key` makes the
second attempt a no-op at the database level, which matters because two jobs running at
once cannot check each other.

The day is part of the key so that next month's rent reminder is still a new notice.

Verified against a live Postgres instance:

| Attempt | Result |
| --- | --- |
| The same reminder twice on one day | rejected by `notifications_dedupe` |
| The same charge, next day | allowed — a new notice |
| Two notices with no dedupe key | both stored |
| A delivery marked sent with no timestamp | rejected |
| An email delivery with no address | rejected |
| An unknown delivery status | rejected |

## Reminder schedule

Three days before, on the day, then **weekly** once overdue.

Weekly rather than daily on purpose. A daily nag about the same unpaid rent is read once
and muted forever, and the people who genuinely need chasing are chased by a person
anyway. A muted app is worse than a quiet one.

## Delivery records

`message_deliveries` holds one row per attempt per channel: an email and an SMS about the
same event are two rows, because they fail independently and get chased independently.
A person can read their own; only the service role writes them, or a delivery record could
be forged.

**A failed send never propagates.** A payment that was confirmed stays confirmed when the
SMS provider is down. The in-app row is already there and the delivery log records what
happened.

## The daily job

```
GET /api/cron/reminders
Authorization: Bearer $CRON_SECRET
```

Authenticated by a shared secret compared in constant time, because no person is involved
and there is no session to check. Safe to call more than once — every message it sends
carries a dedupe key.

Set it to run once a morning, after 8am Dhaka:

```
0 3 * * *   # 03:00 UTC = 09:00 Dhaka
```

Vercel Cron, GitHub Actions and a crontab with `curl` all work; nothing about the endpoint
assumes which.

## Configuration

```
RESEND_API_KEY=          # unset: emails are logged, not sent
EMAIL_FROM="HouseControl <no-reply@yourdomain.com>"
SMS_PROVIDER_KEY=        # unset: SMS is logged, not sent
CRON_SECRET=             # required for the reminder job
```

With no provider keys the app still works end to end: every message is written to the
delivery log with `status = 'skipped'` and printed to the server log in development. That
is deliberate — a deployment without an SMS contract should not be a broken deployment.
