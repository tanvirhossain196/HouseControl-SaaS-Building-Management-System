-- 0008 — gateway webhook log
--
-- Payment providers retry. A network hiccup, a slow response, a manual replay
-- from their dashboard: the same event arrives two or three times, and each
-- time it must produce the same result rather than a second confirmation.
--
-- This table is the record of what arrived and what we decided. It is also
-- the idempotency key: one row per (provider, transaction, validation id).

create table webhook_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null,
  transaction_id  text not null,
  validation_id   text,
  event_type      text not null default 'ipn',
  signature_ok    boolean not null,
  gateway_status  text,
  amount          numeric(12, 2),
  payload         jsonb not null default '{}'::jsonb,
  payment_id      uuid references payments (id) on delete set null,
  outcome         text not null default 'received',
  error           text,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  constraint webhook_outcome_known check (
    outcome in ('received', 'confirmed', 'rejected', 'duplicate', 'invalid', 'error')
  )
);

comment on table webhook_events is
  'Append-only log of gateway callbacks. Service role only — no user policy exists.';

-- One decision per validation of one transaction. A retry of the same event
-- hits this and is answered from the existing row.
create unique index webhook_events_unique_event
  on webhook_events (provider, transaction_id, coalesce(validation_id, 'none'));

create index webhook_events_transaction_idx on webhook_events (transaction_id, received_at desc);
create index webhook_events_unprocessed_idx on webhook_events (received_at)
  where processed_at is null;

alter table webhook_events enable row level security;
-- Deliberately no policy: only the service role reads or writes this table.

-- Gateway payments need a home for the provider's own reference and the state
-- it reported, kept separate from our own status.
alter table payments
  add column if not exists gateway_status text,
  add column if not exists bank_transaction_id text;

create index if not exists payments_gateway_idx on payments (gateway, transaction_id);
