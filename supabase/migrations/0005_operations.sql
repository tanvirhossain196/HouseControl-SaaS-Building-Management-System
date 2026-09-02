-- 0005 — gate, repairs, notifications, audit trail, role handover

-- ---------------------------------------------------------------------------
-- visitors: the gate register (Phase 9).
-- ---------------------------------------------------------------------------
create table visitors (
  id              uuid primary key default gen_random_uuid(),
  building_id     uuid not null references buildings (id) on delete cascade,
  flat_id         uuid references flats (id) on delete set null,
  full_name       text not null check (length(btrim(full_name)) between 2 and 120),
  phone           text check (phone ~ '^(\+?88)?01[3-9][0-9]{8}$'),
  purpose         text,
  photo_url       text,
  state           visitor_state not null default 'inside',
  entry_code      text,
  expected_at     timestamptz,
  entered_at      timestamptz,
  exited_at       timestamptz,
  pre_approved_by uuid references profiles (id) on delete set null,
  logged_by       uuid references profiles (id) on delete set null,
  is_blocked      boolean not null default false,
  block_reason    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint visitor_exit_after_entry check (
    exited_at is null or entered_at is null or exited_at >= entered_at
  ),
  constraint visitor_block_has_reason check (
    not is_blocked or length(btrim(coalesce(block_reason, ''))) > 0
  )
);

-- Entry codes only need to be unique among codes that can still be used.
create unique index visitors_active_entry_code
  on visitors (building_id, entry_code)
  where entry_code is not null and state = 'pre_approved';

create trigger visitors_set_updated_at
  before update on visitors
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- maintenance_requests + their status history (Phase 10).
-- ---------------------------------------------------------------------------
create table maintenance_requests (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references buildings (id) on delete cascade,
  flat_id       uuid references flats (id) on delete cascade,
  reference     text not null,
  title         text not null check (length(btrim(title)) between 3 and 160),
  description   text not null check (length(btrim(description)) >= 10),
  category      expense_category not null default 'repair',
  priority      maintenance_priority not null default 'normal',
  status        maintenance_status not null default 'open',
  photo_urls    text[] not null default '{}',
  reported_by   uuid not null references profiles (id) on delete cascade,
  assigned_to   uuid references profiles (id) on delete set null,
  resolved_at   timestamptz,
  resolution    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (building_id, reference),
  constraint maintenance_resolved_has_timestamp check (
    status <> 'resolved' or resolved_at is not null
  ),
  constraint maintenance_photo_limit check (array_length(photo_urls, 1) is null or array_length(photo_urls, 1) <= 6)
);

create trigger maintenance_set_updated_at
  before update on maintenance_requests
  for each row execute function set_updated_at();

create table maintenance_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references maintenance_requests (id) on delete cascade,
  from_status maintenance_status,
  to_status   maintenance_status not null,
  note        text,
  actor_id    uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notifications and per-user channel preferences (Phase 11).
-- ---------------------------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  org_id      uuid references organizations (id) on delete cascade,
  event       text not null,
  title       text not null,
  body        text,
  link        text,
  channel     notification_channel not null default 'in_app',
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table notification_preferences (
  user_id     uuid not null references profiles (id) on delete cascade,
  event       text not null,
  in_app      boolean not null default true,
  email       boolean not null default true,
  sms         boolean not null default false,
  push        boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (user_id, event)
);

create table email_deliveries (
  id            uuid primary key default gen_random_uuid(),
  to_email      citext not null,
  template      text not null,
  provider_id   text,
  status        text not null default 'queued',
  error         text,
  payload       jsonb not null default '{}'::jsonb,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- audit_logs: append-only. Every role change, payment confirmation and
-- deletion writes one row. No update or delete policy is ever granted.
-- ---------------------------------------------------------------------------
create table audit_logs (
  id            bigint generated always as identity primary key,
  org_id        uuid references organizations (id) on delete set null,
  actor_id      uuid references profiles (id) on delete set null,
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  before_data   jsonb,
  after_data    jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- moderator_transfers: consent-based handover with a cooldown (Phase 8).
-- ---------------------------------------------------------------------------
create table moderator_transfers (
  id              uuid primary key default gen_random_uuid(),
  flat_id         uuid not null references flats (id) on delete cascade,
  from_user_id    uuid not null references profiles (id) on delete cascade,
  to_user_id      uuid not null references profiles (id) on delete cascade,
  status          transfer_status not null default 'pending',
  otp_verified_at timestamptz,
  responded_at    timestamptz,
  expires_at      timestamptz not null,
  rolled_back_at  timestamptz,
  rolled_back_by  uuid references profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint transfer_distinct_parties check (from_user_id <> to_user_id),
  constraint transfer_accept_needs_otp check (status <> 'accepted' or otp_verified_at is not null)
);

-- One open handover per flat.
create unique index moderator_transfers_one_pending
  on moderator_transfers (flat_id)
  where status = 'pending';
