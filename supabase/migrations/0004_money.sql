-- 0004 — the ledger: dues, payments, expenses

-- ---------------------------------------------------------------------------
-- dues: one row per person per obligation per month. Rent, a share of the gas
-- bill and a penalty are three dues, not one blended balance.
-- amount_paid is maintained by a trigger in 0005 — never write it by hand.
-- ---------------------------------------------------------------------------
create table dues (
  id              uuid primary key default gen_random_uuid(),
  flat_id         uuid not null references flats (id) on delete cascade,
  user_id         uuid references profiles (id) on delete set null,
  source          due_source not null,
  source_id       uuid,
  period          date not null,
  amount          numeric(12, 2) not null check (amount > 0),
  amount_paid     numeric(12, 2) not null default 0 check (amount_paid >= 0),
  due_date        date not null,
  status          due_status not null default 'open',
  carried_from    uuid references dues (id) on delete set null,
  description     text,
  created_by      uuid references profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint due_period_is_month_start check (period = date_trunc('month', period)::date),
  constraint due_not_overpaid check (amount_paid <= amount)
);

comment on column dues.user_id is
  'Null means the due sits on the flat rather than one resident (e.g. a vacant unit).';
comment on column dues.source_id is
  'Points at the row that generated this due — an expense_share, a utility bill, a lease.';

-- One rent due per resident per flat per month; the same guard for other sources.
create unique index dues_unique_per_source_period
  on dues (flat_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), source,
           coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid), period);

create trigger dues_set_updated_at
  before update on dues
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- payments: money a resident says they sent. Nothing counts until a moderator
-- confirms it, or a gateway webhook does (Phase 7).
-- ---------------------------------------------------------------------------
create table payments (
  id                uuid primary key default gen_random_uuid(),
  flat_id           uuid not null references flats (id) on delete cascade,
  due_id            uuid references dues (id) on delete set null,
  paid_by           uuid references profiles (id) on delete set null,
  amount            numeric(12, 2) not null check (amount > 0),
  method            payment_method not null default 'bkash',
  status            payment_status not null default 'pending',
  paid_at           date not null default current_date,
  reference         text,
  transaction_id    text unique,
  proof_url         text,
  gateway           text,
  gateway_payload   jsonb,
  note              text,
  reviewed_by       uuid references profiles (id) on delete set null,
  reviewed_at       timestamptz,
  rejection_reason  text,
  receipt_no        text unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint payment_review_recorded check (
    status not in ('confirmed', 'rejected') or reviewed_at is not null
  ),
  constraint payment_rejection_has_reason check (
    status <> 'rejected' or length(btrim(coalesce(rejection_reason, ''))) > 0
  )
);

create trigger payments_set_updated_at
  before update on payments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- expenses: what the building spends. A building-scoped expense is split into
-- expense_shares, and each share becomes a due (Phase 10).
-- ---------------------------------------------------------------------------
create table expenses (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references buildings (id) on delete cascade,
  flat_id       uuid references flats (id) on delete cascade,
  scope         expense_scope not null default 'building',
  category      expense_category not null,
  title         text not null check (length(btrim(title)) between 2 and 160),
  amount        numeric(12, 2) not null check (amount > 0),
  period        date not null,
  split_method  split_method not null default 'equal',
  billed_on     date,
  bill_url      text,
  meter_reading numeric(12, 2),
  created_by    uuid not null references profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint expense_period_is_month_start check (period = date_trunc('month', period)::date),
  constraint expense_scope_matches_flat check (
    (scope = 'flat' and flat_id is not null) or (scope = 'building' and flat_id is null)
  )
);

create trigger expenses_set_updated_at
  before update on expenses
  for each row execute function set_updated_at();

-- How one expense lands on each flat. Shares are validated against the parent
-- expense amount in 0005.
create table expense_shares (
  id          uuid primary key default gen_random_uuid(),
  expense_id  uuid not null references expenses (id) on delete cascade,
  flat_id     uuid not null references flats (id) on delete cascade,
  amount      numeric(12, 2) not null check (amount >= 0),
  due_id      uuid references dues (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (expense_id, flat_id)
);
