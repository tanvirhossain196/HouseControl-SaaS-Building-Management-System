-- ---------------------------------------------------------------------------
-- Remittances: what a moderator owes the owner.
--
-- Rent is collected in two hops. A resident pays their moderator, and the
-- moderator pays the owner. `dues` and `payments` already record the first hop.
-- These two tables record the second, in the same shape, so the same habits
-- apply: a charge that exists before any money moves, a submission that waits
-- for review, and a trigger that is the only thing allowed to move a balance.
--
-- The moderator carries the risk. A remittance is the full rent of the flats
-- they cover, whether or not the residents actually paid — so a resident's
-- arrears become the moderator's loss to chase, not the owner's. That was a
-- deliberate choice, and it is why `amount` is copied from the rent roll at
-- billing time rather than summed from confirmed payments.
--
-- Keyed by (building, moderator, period): one moderator covering two buildings
-- owes two separate amounts on two separate dates, and two moderators in one
-- building each owe their own share.
-- ---------------------------------------------------------------------------

create table remittances (
  id            uuid primary key default gen_random_uuid(),
  building_id   uuid not null references buildings (id) on delete cascade,
  moderator_id  uuid not null references profiles (id) on delete restrict,
  period        date not null,
  amount        numeric(12, 2) not null check (amount > 0),
  -- Maintained by the trigger below. Never write it by hand.
  amount_paid   numeric(12, 2) not null default 0 check (amount_paid >= 0),
  due_date      date not null,
  status        due_status not null default 'open',
  flat_count    integer not null default 0 check (flat_count >= 0),
  note          text,
  created_by    uuid references profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint remittance_not_overpaid check (amount_paid <= amount)
);

-- Billing a month twice must not raise the same charge twice.
create unique index remittances_one_per_period
  on remittances (building_id, moderator_id, period);

create index remittances_moderator_idx on remittances (moderator_id, period desc);
create index remittances_building_idx on remittances (building_id, period desc);
create index remittances_open_idx on remittances (due_date) where status <> 'paid';

create trigger remittances_set_updated_at
  before update on remittances
  for each row execute function set_updated_at();


create table remittance_payments (
  id                uuid primary key default gen_random_uuid(),
  remittance_id     uuid not null references remittances (id) on delete cascade,
  paid_by           uuid references profiles (id) on delete set null,
  amount            numeric(12, 2) not null check (amount > 0),
  method            payment_method not null default 'cash',
  status            payment_status not null default 'pending',
  paid_at           date not null default current_date,
  reference         text,
  note              text,
  reviewed_by       uuid references profiles (id) on delete set null,
  reviewed_at       timestamptz,
  rejection_reason  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint remittance_payment_review_recorded check (
    status not in ('confirmed', 'rejected') or reviewed_at is not null
  ),
  constraint remittance_payment_rejection_has_reason check (
    status <> 'rejected' or rejection_reason is not null
  )
);

create index remittance_payments_remittance_idx
  on remittance_payments (remittance_id, created_at desc);

create index remittance_payments_pending_idx
  on remittance_payments (status) where status = 'pending';

create trigger remittance_payments_set_updated_at
  before update on remittance_payments
  for each row execute function set_updated_at();


-- ---------------------------------------------------------------------------
-- The balance follows confirmed payments and nothing else.
--
-- Same design as sync_due_from_payments: recomputed from the whole set rather
-- than incremented, so a rejection, a reversal or a corrected amount all land
-- on the right number without anyone having to remember to undo something.
-- ---------------------------------------------------------------------------
create or replace function sync_remittance_from_payments()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target uuid;
  paid   numeric(12, 2);
  owed   numeric(12, 2);
begin
  target := coalesce(new.remittance_id, old.remittance_id);

  if target is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(amount), 0)
    into paid
    from remittance_payments
   where remittance_id = target
     and status = 'confirmed';

  select amount into owed from remittances where id = target;

  if owed is null then
    return coalesce(new, old);
  end if;

  update remittances
     set amount_paid = least(paid, owed),
         status = case
           when paid >= owed then 'paid'::due_status
           when paid > 0 then 'partially_paid'::due_status
           else 'open'::due_status
         end
   where id = target
     and status <> 'waived';

  return coalesce(new, old);
end;
$$;

drop trigger if exists remittance_payments_sync on remittance_payments;

create trigger remittance_payments_sync
after insert or update of status, amount, remittance_id or delete
on remittance_payments
for each row
execute function sync_remittance_from_payments();


-- ---------------------------------------------------------------------------
-- Access.
--
-- A moderator sees and pays their own remittances. An organization admin sees
-- every remittance in their buildings and is the only one who may create them
-- or review a submission. Nobody else sees anything, which is the default when
-- RLS is on and no policy matches.
-- ---------------------------------------------------------------------------

create or replace function auth_admin_building_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from buildings where org_id in (select auth_org_ids('admin'));
$$;

alter table remittances enable row level security;
alter table remittance_payments enable row level security;

create policy remittances_read on remittances
  for select using (
    moderator_id = auth.uid()
    or building_id in (select auth_admin_building_ids())
  );

create policy remittances_manage on remittances
  for all using (building_id in (select auth_admin_building_ids()))
  with check (building_id in (select auth_admin_building_ids()));

create policy remittance_payments_read on remittance_payments
  for select using (
    paid_by = auth.uid()
    or remittance_id in (
      select id from remittances
       where moderator_id = auth.uid()
          or building_id in (select auth_admin_building_ids())
    )
  );

-- A moderator may submit against their own remittance, and only as pending.
-- Confirming your own payment would make the review meaningless.
create policy remittance_payments_insert_own on remittance_payments
  for insert with check (
    paid_by = auth.uid()
    and status = 'pending'
    and remittance_id in (select id from remittances where moderator_id = auth.uid())
  );

create policy remittance_payments_manage on remittance_payments
  for all using (
    remittance_id in (
      select id from remittances
       where building_id in (select auth_admin_building_ids())
    )
  )
  with check (
    remittance_id in (
      select id from remittances
       where building_id in (select auth_admin_building_ids())
    )
  );