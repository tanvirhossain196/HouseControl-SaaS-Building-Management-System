-- 0001 — extensions, enums and shared helpers
-- Every later migration depends on this file. Run migrations in filename order.

create extension if not exists "pgcrypto";      -- gen_random_uuid(), digest()
create extension if not exists "pg_trgm";       -- trigram indexes for search (Phase 13)
create extension if not exists "citext";        -- case-insensitive email

-- ---------------------------------------------------------------------------
-- Enums. Postgres enums keep bad values out of the database entirely, which is
-- worth the small cost of a migration when a value is added.
-- ---------------------------------------------------------------------------

-- Platform-wide capability. Org-level and flat-level roles are separate.
create type app_role as enum ('super_admin', 'admin', 'moderator', 'member', 'guard');

create type org_role as enum ('admin', 'guard');
create type flat_role as enum ('moderator', 'resident');

create type membership_status as enum ('invited', 'active', 'suspended', 'left');
create type occupancy_status as enum ('occupied', 'vacant', 'reserved', 'not_rentable');

create type due_source as enum ('rent', 'utility', 'expense', 'penalty', 'other');
create type due_status as enum ('open', 'partially_paid', 'paid', 'waived');

create type payment_method as enum ('cash', 'bkash', 'nagad', 'bank_transfer', 'card', 'other');
create type payment_status as enum ('pending', 'confirmed', 'rejected', 'failed', 'refunded');

create type expense_scope as enum ('building', 'flat');
create type expense_category as enum (
  'electricity', 'gas', 'water', 'internet', 'cleaning', 'security', 'lift', 'repair', 'other'
);
create type split_method as enum ('equal', 'custom', 'by_unit_size', 'by_usage');

create type visitor_state as enum ('pre_approved', 'inside', 'exited', 'denied');
create type maintenance_status as enum ('open', 'in_progress', 'resolved', 'cancelled');
create type maintenance_priority as enum ('low', 'normal', 'high', 'urgent');

create type notification_channel as enum ('in_app', 'email', 'sms', 'push');
create type transfer_status as enum ('pending', 'accepted', 'rejected', 'expired', 'rolled_back');

create type plan_tier as enum ('free', 'pro');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled');

-- ---------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------

-- Keeps updated_at honest. Attached to every mutable table below.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- First day of the month an amount belongs to. Dues are keyed by period, not
-- by the day they happened to be created.
create or replace function period_start(ts timestamptz default now())
returns date
language sql
immutable
as $$
  select date_trunc('month', ts)::date;
$$;
