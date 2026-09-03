-- 0010 — the gate register
--
-- Phase 5's `visitors` table covered a visit. Running a real gate needs three
-- more things: what kind of visit it is (a courier is not a guest), when a
-- pre-approval code stops working, and a list of people the building has
-- decided not to let in again.

create type visitor_kind as enum ('guest', 'courier', 'service', 'staff', 'other');

alter table visitors
  add column if not exists kind visitor_kind not null default 'guest',
  add column if not exists code_expires_at timestamptz,
  add column if not exists notified_at timestamptz,
  add column if not exists vehicle text,
  add column if not exists id_note text,
  add column if not exists exit_logged_by uuid references profiles (id) on delete set null;

comment on column visitors.code_expires_at is
  'A pre-approval code stops working at this moment, whether or not it was used.';
comment on column visitors.id_note is
  'What the guard checked — "NID seen", "office card". Never the number itself.';

-- A code that has expired cannot be used, so it should not hold its slot in
-- the uniqueness index either.
drop index if exists visitors_active_entry_code;

create unique index visitors_active_entry_code
  on visitors (building_id, entry_code)
  where entry_code is not null and state = 'pre_approved';

create index if not exists visitors_code_lookup_idx
  on visitors (entry_code)
  where entry_code is not null and state = 'pre_approved';

-- ---------------------------------------------------------------------------
-- blocked_visitors: the people this building will not let in again.
--
-- Kept apart from `visitors` because it is about a person, not a visit. The
-- guard's screen checks it by phone number before logging anyone in.
-- ---------------------------------------------------------------------------
create table blocked_visitors (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references buildings (id) on delete cascade,
  full_name    text not null check (length(btrim(full_name)) between 2 and 120),
  phone        text check (phone ~ '^(\+?88)?01[3-9][0-9]{8}$'),
  reason       text not null check (length(btrim(reason)) >= 5),
  blocked_by   uuid not null references profiles (id) on delete restrict,
  lifted_at    timestamptz,
  lifted_by    uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table blocked_visitors is
  'A block is a decision with a reason and an author. Lifting one keeps the row.';

-- One live block per person per building. Lifting it frees the slot.
create unique index blocked_visitors_one_active
  on blocked_visitors (building_id, phone)
  where lifted_at is null and phone is not null;

create index blocked_visitors_building_idx on blocked_visitors (building_id)
  where lifted_at is null;

create trigger blocked_visitors_set_updated_at
  before update on blocked_visitors
  for each row execute function set_updated_at();

alter table blocked_visitors enable row level security;

-- Anyone who works the building can see the list — a guard who cannot read it
-- cannot enforce it. Only owners and moderators may add to it.
create policy blocked_visitors_read on blocked_visitors
  for select using (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids()))
    or building_id in (
      select f.building_id from flats f where f.id in (select auth_visible_flat_ids())
    )
  );

create policy blocked_visitors_write on blocked_visitors
  for all using (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids('admin')))
    or building_id in (
      select f.building_id from flats f where f.id in (select auth_managed_flat_ids())
    )
  )
  with check (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids('admin')))
    or building_id in (
      select f.building_id from flats f where f.id in (select auth_managed_flat_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- Who may write what at the gate
--
-- Phase 2's policy let any flat member update any visitor row in their
-- building — including setting `state = 'inside'`. Running the gate is the
-- guard's job. Residents pre-approve a guest and can cancel that; they do not
-- declare people present.
-- ---------------------------------------------------------------------------
drop policy if exists visitors_write on visitors;

create policy visitors_preapprove on visitors
  for insert
  with check (
    state = 'pre_approved'
    and flat_id in (select auth_flat_ids())
    and pre_approved_by = auth.uid()
  );

-- A resident may withdraw their own pre-approval while it is still pending.
create policy visitors_cancel_own_preapproval on visitors
  for update
  using (state = 'pre_approved' and pre_approved_by = auth.uid())
  with check (state in ('pre_approved', 'denied'));

-- Guards and owners run the gate.
create policy visitors_gate_write on visitors
  for all
  using (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids()))
  )
  with check (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids()))
  );
