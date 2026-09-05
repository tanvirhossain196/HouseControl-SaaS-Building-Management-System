-- 0015 — fix: buildings and flats policies referenced each other
--
-- The bug, in full, because it is worth not repeating:
--
--   buildings_read said "…or this building contains a flat you can see"
--   flats_read     said "…or this flat is in a building you can see"
--
-- Two policies, each expressed with a direct subquery on the other's table.
-- Postgres expands one policy, meets the other, expands that, meets the
-- first, and gives up:
--
--   ERROR: infinite recursion detected in policy for relation "buildings"
--
-- Nothing about it is visible in the migration that introduced it, and the
-- seed data never hit it because the service role bypasses RLS entirely. It
-- surfaced the first time a real owner opened their own buildings page: rows
-- present in the table, an empty list on screen, and every write failing with
-- a generic error.
--
-- The fix is to stop policies reaching across tables directly. Everything now
-- goes through a security-definer helper, which runs as the table owner and
-- therefore does not re-enter policy evaluation.

-- ---------------------------------------------------------------------------
-- One helper for "which buildings may this person see at all".
--
-- Two sources: organizations they belong to, and buildings that contain a
-- flat they live in or moderate. Both resolved inside the function, so the
-- policy that uses it is a single containment test with nothing to expand.
-- ---------------------------------------------------------------------------
create or replace function auth_building_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id
  from buildings b
  where b.org_id in (select org_id from org_members
                     where user_id = auth.uid() and status = 'active')
  union
  select f.building_id
  from flats f
  join flat_members m on m.flat_id = f.id
  where m.user_id = auth.uid() and m.status = 'active';
$$;

comment on function auth_building_ids is
  'Buildings visible to the caller. Security definer so policies never re-enter policy evaluation.';

-- Buildings the caller administers, as opposed to merely sees. Used by every
-- policy that guards a write.
create or replace function auth_admin_building_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id
  from buildings b
  where b.org_id in (select org_id from org_members
                     where user_id = auth.uid() and status = 'active' and role = 'admin');
$$;

-- Buildings reached through an organization, as opposed to through living in
-- one of their flats.
--
-- The distinction matters and the first version of this fix got it wrong: a
-- resident may see the building row their flat belongs to, but that must not
-- let them see every flat in it. Seeing the building is an address; seeing
-- its flats is everybody's rent.
create or replace function auth_org_building_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select b.id
  from buildings b
  where b.org_id in (select org_id from org_members
                     where user_id = auth.uid() and status = 'active');
$$;

-- The same treatment for the flat-level helpers: they queried `buildings`
-- directly, which is the other half of the cycle.
create or replace function auth_managed_flat_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select flat_id from flat_members
  where user_id = auth.uid() and status = 'active' and role = 'moderator'
  union
  select f.id
  from flats f
  where f.building_id in (
    select b.id from buildings b
    where b.org_id in (select org_id from org_members
                       where user_id = auth.uid() and status = 'active' and role = 'admin')
  );
$$;

create or replace function auth_visible_flat_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select flat_id from flat_members
  where user_id = auth.uid() and status = 'active'
  union
  select id from auth_managed_flat_ids() as managed(id);
$$;

-- ---------------------------------------------------------------------------
-- Rewrite the two policies that formed the cycle.
-- ---------------------------------------------------------------------------
drop policy if exists buildings_read on buildings;

create policy buildings_read on buildings
  for select using (id in (select auth_building_ids()));

drop policy if exists flats_read on flats;

create policy flats_read on flats
  for select using (
    id in (select auth_visible_flat_ids())
    -- Organization members only. A resident sees their own flat and no more,
    -- however many flats the building has.
    or building_id in (select auth_org_building_ids())
  );

-- The write policies had the same shape: a subquery on `buildings` from a
-- policy on `flats`. Same fix.
drop policy if exists flats_admin_write on flats;

create policy flats_admin_write on flats
  for all
  using (building_id in (select auth_admin_building_ids()))
  with check (building_id in (select auth_admin_building_ids()));

-- ---------------------------------------------------------------------------
-- The same cross-table subqueries appear in the operational policies. None of
-- them formed a cycle, because nothing on `buildings` points back at them —
-- but they are rewritten through the helper anyway, so the next policy added
-- to `buildings` cannot quietly create one.
-- ---------------------------------------------------------------------------
drop policy if exists expenses_read on expenses;

create policy expenses_read on expenses
  for select using (
    building_id in (select auth_org_building_ids())
    or flat_id in (select auth_visible_flat_ids())
    or id in (select expense_id from expense_shares
              where flat_id in (select auth_visible_flat_ids()))
  );

drop policy if exists expenses_manage on expenses;

create policy expenses_manage on expenses
  for all
  using (
    building_id in (select auth_admin_building_ids())
    or flat_id in (select auth_managed_flat_ids())
  )
  with check (
    building_id in (select auth_admin_building_ids())
    or flat_id in (select auth_managed_flat_ids())
  );

drop policy if exists visitors_read on visitors;

create policy visitors_read on visitors
  for select using (
    building_id in (select auth_org_building_ids())
    or flat_id in (select auth_visible_flat_ids())
  );

drop policy if exists visitors_gate_write on visitors;

create policy visitors_gate_write on visitors
  for all
  using (building_id in (select auth_org_building_ids()))
  with check (building_id in (select auth_org_building_ids()));

drop policy if exists maintenance_read on maintenance_requests;

create policy maintenance_read on maintenance_requests
  for select using (
    reported_by = auth.uid()
    or assigned_to = auth.uid()
    or flat_id in (select auth_visible_flat_ids())
    or building_id in (select auth_org_building_ids())
  );

drop policy if exists maintenance_manage on maintenance_requests;

create policy maintenance_manage on maintenance_requests
  for update
  using (
    flat_id in (select auth_managed_flat_ids())
    or building_id in (select auth_admin_building_ids())
  )
  with check (
    flat_id in (select auth_managed_flat_ids())
    or building_id in (select auth_admin_building_ids())
  );

drop policy if exists landlord_rent_admin_only on landlord_rent_records;

create policy landlord_rent_admin_only on landlord_rent_records
  for all
  using (flat_id in (select auth_managed_flat_ids()))
  with check (flat_id in (select auth_managed_flat_ids()));

drop policy if exists buildings_admin_write on buildings;

create policy buildings_admin_write on buildings
  for all
  using (
    org_id in (select org_id from org_members
               where user_id = auth.uid() and status = 'active' and role = 'admin')
  )
  with check (
    org_id in (select org_id from org_members
               where user_id = auth.uid() and status = 'active' and role = 'admin')
  );
