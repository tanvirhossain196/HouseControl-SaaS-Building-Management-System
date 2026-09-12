create table if not exists subscription_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  plan plan_tier not null,
  months integer not null check (months in (1, 3, 6, 12)),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'BDT',
  provider text not null default 'sslcommerz',
  transaction_id text not null unique,
  provider_reference text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'failed', 'cancelled')),
  gateway_status text,
  gateway_payload jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_payments_org_idx
  on subscription_payments (org_id, created_at desc);

create index if not exists subscription_payments_transaction_idx
  on subscription_payments (transaction_id);

alter table subscription_payments enable row level security;

create policy subscription_payments_select
  on subscription_payments
  for select
  using (
    exists (
      select 1
      from org_members om
      where om.org_id = subscription_payments.org_id
        and om.user_id = auth.uid()
        and om.role = 'admin'
        and om.status = 'active'
    )
  );

create trigger subscription_payments_updated_at
  before update on subscription_payments
  for each row execute function set_updated_at();