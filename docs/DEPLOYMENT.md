# Deploying HouseControl

Next.js on Vercel, Postgres on Supabase. Nothing here assumes Vercel specifically except
the cron entry — any scheduler that can `curl` a URL works.

## Before the first deploy

1. **Create the Supabase project.** Pick the Singapore region: it is the closest to Dhaka
   with a Supabase presence, and every millisecond shows up on a mid-range Android at the
   gate.

2. **Apply the migrations, in order.**

   ```bash
   for f in supabase/migrations/*.sql; do
     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
   done
   ```

   `ON_ERROR_STOP=1` matters. Without it psql carries on after a failure and leaves a
   half-built schema that looks like it worked.

3. **Do not load the seed.** `supabase/seed.sql` creates rows in `auth.users` directly,
   which is fine for a test database and wrong for a real one. Create the first owner by
   signing up through the app.

4. **Configure Auth** — the six steps in `AUTH.md`. The one people miss is turning on
   "Confirm email"; without it the whole verified-only design is decoration.

5. **Set the environment variables** (below), then deploy.

6. **Check it.**

   ```bash
   curl https://yourdomain.com/api/health          # process is up
   curl https://yourdomain.com/api/health?deep=1   # database answers too
   ```

## Environment

| Variable                        | Required | What breaks without it                                 |
| ------------------------------- | :------: | ------------------------------------------------------ |
| `NEXT_PUBLIC_SITE_URL`          |    ●     | callback URLs, emails, receipts point at localhost     |
| `NEXT_PUBLIC_SUPABASE_URL`      |    ●     | nothing behind sign-in loads                           |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` |    ●     | as above                                               |
| `SUPABASE_SERVICE_ROLE_KEY`     |    ●     | webhooks, reminders and audit writes fail              |
| `ALLOWED_ORIGINS`               |    ●     | cross-origin API calls are refused, including your own |
| `CRON_SECRET`                   |    ●     | the reminder job returns 500                           |
| `OTP_SECRET`                    |          | falls back to the service role key; set it separately  |
| `RESEND_API_KEY`                |          | email is logged, not sent                              |
| `SMS_PROVIDER_KEY`              |          | SMS is logged, not sent                                |
| `SSLCOMMERZ_*`                  |          | the online payment button does not render              |
| `SENTRY_DSN`                    |          | errors only reach the platform log                     |

A deployment without the optional keys is a working deployment: manual payments, in-app
notifications and the whole ledger run without a single provider contract. That was
deliberate from Phase 7 onwards.

**The service role key bypasses RLS.** It belongs in the server environment only. The
boundary test asserts it never appears in client code; nothing asserts you did not paste it
into `NEXT_PUBLIC_` by hand.

## Scheduled work

One job, daily:

```
0 3 * * *   # 03:00 UTC — 09:00 Dhaka, after quiet hours end
```

`vercel.json` declares it. Elsewhere:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/reminders
```

Running it twice sends nothing twice — every message carries a dedupe key, and the unique
index enforces that rather than the job.

## Webhooks

In the SSLCommerz merchant panel, set the IPN URL to
`https://yourdomain.com/api/payments/webhook/sslcommerz` and enable IPN. Test a full
payment in sandbox before switching `SSLCOMMERZ_SANDBOX` to `false`; the sandbox exercises
the same signature path as production.

## Migrations after launch

The rules that keep a deploy from taking the site down:

- **Additive first.** Add a column, deploy the code that writes it, backfill, then make it
  `not null`. A migration and the code that needs it never land in the same instant —
  the old version is still serving requests while the new one boots.
- **Never drop a column in the same release that stops using it.** Leave one release
  between, so a rollback has somewhere to land.
- **Test on a copy first.** `./scripts/db-test.sh` builds the schema from empty and runs
  every invariant; that is what catches a migration which only worked because of what was
  already in a developer's database.

## Rolling back

Vercel's instant rollback covers the application. It does not cover the database, which is
why migrations are additive: the previous release must still run against the newer schema.

If a migration itself is wrong, write a new migration that corrects it. Editing a migration
that has already run means two environments with the same version number and different
schemas, which is worse than the original bug.

## Backups

Supabase takes daily backups on paid plans; point-in-time recovery is an add-on and worth
it here, because the data is money. Test a restore before you need one — an untested backup
is a belief, not a backup.

`audit_logs`, `webhook_events` and `message_deliveries` are append-only and grow forever.
Nothing prunes them yet; watch them, and archive rather than delete when the time comes.

## What to watch

| Signal                                        | Where         | Means                                             |
| --------------------------------------------- | ------------- | ------------------------------------------------- |
| `webhook_events` with `outcome = 'invalid'`   | database      | forged or misconfigured callbacks                 |
| `message_deliveries` with `status = 'failed'` | database      | the provider is down or the key expired           |
| The reminder job's response                   | scheduler     | it returns counts; zero every day is suspicious   |
| `/api/health?deep=1`                          | monitor       | the database is reachable                         |
| 429s on `/api/*`                              | platform logs | the in-memory limiter is per instance — see below |

**The rate limiter is in-memory.** It counts per instance, so on more than one instance the
effective limit is multiplied. Before scaling past one, move the store to Upstash Redis;
`src/lib/rate-limit.ts` keeps its interface.

## Domain and email

Point the domain at Vercel, then set `NEXT_PUBLIC_SITE_URL` and `ALLOWED_ORIGINS` to it and
add `https://yourdomain.com/auth/callback` to Supabase's redirect allow list. Verify the
sending domain with Resend before launch or the first invite lands in spam, and an invite in
spam looks to a resident exactly like an app that does not work.
