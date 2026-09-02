-- 0007 — Row Level Security.
--
-- The permission rules from Phase 4 live here as well as in middleware. If the
-- API layer is ever bypassed, these policies are what stops a resident from
-- reading another flat's ledger.

-- ---------------------------------------------------------------------------
-- Helpers. security definer so they can read membership tables that the
-- calling user cannot select directly.
-- ---------------------------------------------------------------------------
create or replace function auth_is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and platform_role = 'super_admin'
  );
$$;

create or replace function auth_org_ids(required_role org_role default null)
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from org_members
  where user_id = auth.uid()
    and status = 'active'
    and (required_role is null or role = required_role);
$$;

create or replace function auth_flat_ids(required_role flat_role default null)
returns setof uuid language sql stable security definer set search_path = public as $$
  select flat_id from flat_members
  where user_id = auth.uid()
    and status = 'active'
    and (required_role is null or role = required_role);
$$;

-- Flats the current user can administer: their own flats as moderator, plus
-- every flat in an organization where they are an admin.
create or replace function auth_managed_flat_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from auth_flat_ids('moderator') as f(id)
  union
  select f.id from flats f
  join buildings b on b.id = f.building_id
  where b.org_id in (select auth_org_ids('admin'));
$$;

create or replace function auth_visible_flat_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from auth_flat_ids() as f(id)
  union
  select id from auth_managed_flat_ids() as m(id);
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. A table with RLS on and no policy denies everything,
-- which is the correct default.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table subscriptions enable row level security;
alter table invites enable row level security;
alter table buildings enable row level security;
alter table flats enable row level security;
alter table flat_members enable row level security;
alter table landlord_rent_records enable row level security;
alter table dues enable row level security;
alter table payments enable row level security;
alter table expenses enable row level security;
alter table expense_shares enable row level security;
alter table visitors enable row level security;
alter table maintenance_requests enable row level security;
alter table maintenance_events enable row level security;
alter table notifications enable row level security;
alter table notification_preferences enable row level security;
alter table audit_logs enable row level security;
alter table moderator_transfers enable row level security;
alter table email_deliveries enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_read_self on profiles
  for select using (id = auth.uid() or auth_is_super_admin());

-- Anyone sharing a flat or an organization can see each other's basic profile.
create policy profiles_read_neighbours on profiles
  for select using (
    exists (
      select 1 from flat_members m
      where m.user_id = profiles.id
        and m.status = 'active'
        and m.flat_id in (select auth_visible_flat_ids())
    )
  );

create policy profiles_update_self on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- organizations and membership
-- ---------------------------------------------------------------------------
create policy organizations_read on organizations
  for select using (id in (select auth_org_ids()) or owner_id = auth.uid() or auth_is_super_admin());

create policy organizations_owner_write on organizations
  for all using (owner_id = auth.uid() or auth_is_super_admin())
  with check (owner_id = auth.uid() or auth_is_super_admin());

create policy org_members_read on org_members
  for select using (org_id in (select auth_org_ids()) or user_id = auth.uid());

create policy org_members_admin_write on org_members
  for all using (org_id in (select auth_org_ids('admin')))
  with check (org_id in (select auth_org_ids('admin')));

create policy subscriptions_read on subscriptions
  for select using (org_id in (select auth_org_ids()) or auth_is_super_admin());

-- Subscription writes go through the service role only (webhooks, admin tools).

create policy invites_read on invites
  for select using (
    org_id in (select auth_org_ids('admin'))
    or flat_id in (select auth_managed_flat_ids())
    or email = (select email from profiles where id = auth.uid())
  );

create policy invites_write on invites
  for all using (
    org_id in (select auth_org_ids('admin')) or flat_id in (select auth_managed_flat_ids())
  )
  with check (
    org_id in (select auth_org_ids('admin')) or flat_id in (select auth_managed_flat_ids())
  );

-- ---------------------------------------------------------------------------
-- property
-- ---------------------------------------------------------------------------
create policy buildings_read on buildings
  for select using (
    org_id in (select auth_org_ids())
    or id in (select building_id from flats where id in (select auth_visible_flat_ids()))
  );

create policy buildings_admin_write on buildings
  for all using (org_id in (select auth_org_ids('admin')))
  with check (org_id in (select auth_org_ids('admin')));

create policy flats_read on flats
  for select using (
    id in (select auth_visible_flat_ids())
    or building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids()))
  );

create policy flats_admin_write on flats
  for all using (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids('admin')))
  )
  with check (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids('admin')))
  );

create policy flat_members_read on flat_members
  for select using (user_id = auth.uid() or flat_id in (select auth_visible_flat_ids()));

create policy flat_members_manage on flat_members
  for all using (flat_id in (select auth_managed_flat_ids()))
  with check (flat_id in (select auth_managed_flat_ids()));

create policy landlord_rent_admin_only on landlord_rent_records
  for all using (
    flat_id in (
      select f.id from flats f join buildings b on b.id = f.building_id
      where b.org_id in (select auth_org_ids('admin'))
    )
  )
  with check (
    flat_id in (
      select f.id from flats f join buildings b on b.id = f.building_id
      where b.org_id in (select auth_org_ids('admin'))
    )
  );

-- ---------------------------------------------------------------------------
-- money. A resident sees their own dues and payments and nobody else's.
-- ---------------------------------------------------------------------------
create policy dues_read on dues
  for select using (user_id = auth.uid() or flat_id in (select auth_managed_flat_ids()));

create policy dues_manage on dues
  for all using (flat_id in (select auth_managed_flat_ids()))
  with check (flat_id in (select auth_managed_flat_ids()));

create policy payments_read on payments
  for select using (paid_by = auth.uid() or flat_id in (select auth_managed_flat_ids()));

-- A resident may submit a payment for themselves; only a manager may review it.
create policy payments_insert_own on payments
  for insert with check (
    paid_by = auth.uid()
    and status = 'pending'
    and flat_id in (select auth_flat_ids())
  );

create policy payments_manage on payments
  for all using (flat_id in (select auth_managed_flat_ids()))
  with check (flat_id in (select auth_managed_flat_ids()));

create policy expenses_read on expenses
  for select using (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids()))
    or flat_id in (select auth_visible_flat_ids())
    or id in (select expense_id from expense_shares where flat_id in (select auth_visible_flat_ids()))
  );

create policy expenses_manage on expenses
  for all using (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids('admin')))
    or flat_id in (select auth_managed_flat_ids())
  )
  with check (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids('admin')))
    or flat_id in (select auth_managed_flat_ids())
  );

create policy expense_shares_read on expense_shares
  for select using (flat_id in (select auth_visible_flat_ids()));

create policy expense_shares_manage on expense_shares
  for all using (flat_id in (select auth_managed_flat_ids()))
  with check (flat_id in (select auth_managed_flat_ids()));

-- ---------------------------------------------------------------------------
-- operations
-- ---------------------------------------------------------------------------
create policy visitors_read on visitors
  for select using (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids()))
    or flat_id in (select auth_visible_flat_ids())
  );

create policy visitors_write on visitors
  for all using (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids()))
    or flat_id in (select auth_visible_flat_ids())
  )
  with check (
    building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids()))
    or flat_id in (select auth_visible_flat_ids())
  );

create policy maintenance_read on maintenance_requests
  for select using (
    reported_by = auth.uid()
    or assigned_to = auth.uid()
    or flat_id in (select auth_visible_flat_ids())
    or building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids()))
  );

create policy maintenance_insert on maintenance_requests
  for insert with check (
    reported_by = auth.uid() and (flat_id in (select auth_flat_ids()) or flat_id is null)
  );

create policy maintenance_manage on maintenance_requests
  for update using (
    flat_id in (select auth_managed_flat_ids())
    or building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids('admin')))
  );

create policy maintenance_events_read on maintenance_events
  for select using (
    request_id in (select id from maintenance_requests)
  );

create policy notifications_own on notifications
  for select using (user_id = auth.uid());

create policy notifications_mark_read on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy notification_prefs_own on notification_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Audit logs are readable by org admins, and written only by the service role.
create policy audit_logs_read on audit_logs
  for select using (org_id in (select auth_org_ids('admin')) or auth_is_super_admin());

create policy transfers_read on moderator_transfers
  for select using (
    from_user_id = auth.uid()
    or to_user_id = auth.uid()
    or flat_id in (select auth_managed_flat_ids())
  );

create policy transfers_write on moderator_transfers
  for all using (from_user_id = auth.uid() or to_user_id = auth.uid())
  with check (from_user_id = auth.uid());

-- email_deliveries has no policy on purpose: service role only.
