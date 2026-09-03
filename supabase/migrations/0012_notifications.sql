-- 0012 — notifications: deduplication, quiet-hours holding, delivery records
--
-- Phase 2 gave `notifications` its shape and a placeholder `email_deliveries`
-- table. Sending for real needs three things the database has to own, because
-- two jobs running at once cannot check each other:
--
--   1. A guarantee that a reminder job which fires twice produces one message.
--   2. A place to park an SMS that arrived at 3am until morning.
--   3. One delivery record per channel per attempt, so "did she actually get
--      the overdue notice" has an answer.

alter table notifications
  add column if not exists dedupe_key text,
  add column if not exists subject_id text,
  add column if not exists send_after timestamptz;

comment on column notifications.dedupe_key is
  'event:user:subject:day. A repeat run hits the unique index below and does nothing.';
comment on column notifications.send_after is
  'Set when the noisy channels were held for quiet hours. Cleared by the cron job.';

-- The whole idempotency guarantee, in one line.
create unique index if not exists notifications_dedupe
  on notifications (dedupe_key)
  where dedupe_key is not null;

create index if not exists notifications_held_idx
  on notifications (send_after)
  where send_after is not null;

create index if not exists notifications_subject_idx
  on notifications (subject_id, created_at desc)
  where subject_id is not null;

-- ---------------------------------------------------------------------------
-- message_deliveries replaces the email-only placeholder from 0005. One row
-- per attempt on one channel: an email and an SMS about the same event are
-- two rows, because they fail independently and are chased independently.
-- ---------------------------------------------------------------------------
drop table if exists email_deliveries;

create table message_deliveries (
  id              uuid primary key default gen_random_uuid(),
  channel         notification_channel not null,
  user_id         uuid references profiles (id) on delete set null,
  notification_id uuid references notifications (id) on delete set null,
  to_email        citext,
  to_phone        text,
  template        text not null,
  provider_id     text,
  status          text not null default 'queued',
  error           text,
  payload         jsonb not null default '{}'::jsonb,
  attempts        smallint not null default 0,
  last_attempt_at timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  constraint delivery_status_known check (status in ('queued', 'sent', 'failed', 'skipped')),
  constraint delivery_has_destination check (
    channel <> 'email' or to_email is not null
  ),
  constraint delivery_sent_has_timestamp check (status <> 'sent' or sent_at is not null)
);

comment on table message_deliveries is
  'Append-only log of what was actually sent, and what failed. Service role writes it.';

create index message_deliveries_user_idx on message_deliveries (user_id, created_at desc);
create index message_deliveries_failed_idx on message_deliveries (created_at desc)
  where status = 'failed';
create index message_deliveries_notification_idx on message_deliveries (notification_id);

alter table message_deliveries enable row level security;

-- A person may see what was sent to them; nobody may write these but the
-- service role, or a delivery record could be forged.
create policy message_deliveries_read_own on message_deliveries
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Preferences: one row per person per event, missing rows meaning "defaults".
-- The policy from 0007 already scopes them to their owner; this adds the
-- constraint that stops an unknown channel combination being stored.
-- ---------------------------------------------------------------------------
create index if not exists notification_preferences_user_idx
  on notification_preferences (user_id);
