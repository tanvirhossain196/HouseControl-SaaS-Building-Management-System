-- ---------------------------------------------------------------------------
-- Subscription cancellation and expiry.
--
-- Two ways to cancel, and the difference is only when it takes effect:
--
--   immediate      the row is moved to the free plan right away
--   at period end  cancel_at_period_end is set and the row is left alone until
--                  the cron job at /api/cron/subscriptions reaches its end date
--
-- Cancelling never deletes the row and never sets status to 'cancelled'.
-- assertBuildingQuotaAvailable() refuses to work when an organization has no
-- non-cancelled subscription, so a cancelled row would lock the owner out of
-- their own buildings. Dropping to free keeps one live row, which is what the
-- rest of the app expects.
-- ---------------------------------------------------------------------------

alter table subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

-- The cron job scans by end date, so give it an index.
create index if not exists subscriptions_period_end_idx
  on subscriptions (current_period_end)
  where status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- The Plus tier.
--
-- src/lib/pricing.ts has sold Plus since it was written, but plan_tier was
-- created with only 'free' and 'pro'. The value exists in the running database
-- already; this states it in migration form so a fresh database matches.
-- ---------------------------------------------------------------------------

alter type plan_tier add value if not exists 'plus';