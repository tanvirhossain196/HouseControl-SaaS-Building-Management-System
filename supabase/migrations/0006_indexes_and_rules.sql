-- 0006 — indexes for the queries the app actually runs, plus invariants that
-- must not depend on application code remembering them.

-- ---------------------------------------------------------------------------
-- Indexes. Every foreign key the app filters on, every list screen's sort key.
-- ---------------------------------------------------------------------------
create index org_members_user_idx on org_members (user_id) where status = 'active';
create index org_members_org_idx on org_members (org_id, role) where status = 'active';

create index buildings_org_idx on buildings (org_id) where archived_at is null;
create index buildings_name_trgm on buildings using gin (name gin_trgm_ops);

create index flats_building_idx on flats (building_id) where archived_at is null;
create index flats_occupancy_idx on flats (building_id, occupancy_status);
create index flats_unit_number_trgm on flats using gin (unit_number gin_trgm_ops);

create index flat_members_user_idx on flat_members (user_id) where status = 'active';
create index flat_members_flat_idx on flat_members (flat_id, role) where status = 'active';

-- The dues board: "what is outstanding in this flat" and "what do I owe".
create index dues_flat_period_idx on dues (flat_id, period desc);
create index dues_user_open_idx on dues (user_id, due_date) where status in ('open', 'partially_paid');
create index dues_overdue_idx on dues (due_date) where status in ('open', 'partially_paid');

create index payments_flat_idx on payments (flat_id, paid_at desc);
create index payments_pending_idx on payments (flat_id) where status = 'pending';
create index payments_due_idx on payments (due_id);
create index payments_user_idx on payments (paid_by, paid_at desc);

create index expenses_building_period_idx on expenses (building_id, period desc);
create index expense_shares_flat_idx on expense_shares (flat_id);

create index visitors_building_time_idx on visitors (building_id, entered_at desc);
create index visitors_flat_idx on visitors (flat_id, entered_at desc);
create index visitors_inside_idx on visitors (building_id) where state = 'inside';
create index visitors_name_trgm on visitors using gin (full_name gin_trgm_ops);

create index maintenance_building_status_idx on maintenance_requests (building_id, status, created_at desc);
create index maintenance_flat_idx on maintenance_requests (flat_id, created_at desc);
create index maintenance_assignee_idx on maintenance_requests (assigned_to) where status <> 'resolved';
create index maintenance_events_request_idx on maintenance_events (request_id, created_at);

create index notifications_unread_idx on notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_idx on notifications (user_id, created_at desc);

create index audit_logs_org_idx on audit_logs (org_id, created_at desc);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id, created_at desc);

create index invites_email_idx on invites (email) where accepted_at is null and revoked_at is null;
create index landlord_rent_period_idx on landlord_rent_records (period desc);

-- ---------------------------------------------------------------------------
-- Invariant: rent shares in a flat may not exceed the flat's monthly rent.
-- The UI validates this too; this is the copy that cannot be bypassed.
-- ---------------------------------------------------------------------------
create or replace function check_rent_shares()
returns trigger
language plpgsql
as $$
declare
  flat_rent numeric(12, 2);
  share_total numeric(12, 2);
begin
  select monthly_rent into flat_rent from flats where id = new.flat_id;

  select coalesce(sum(rent_share), 0) into share_total
  from flat_members
  where flat_id = new.flat_id
    and status = 'active'
    and id <> new.id;

  if share_total + new.rent_share > flat_rent then
    raise exception
      'Rent shares (%) exceed the flat rent (%) for flat %',
      share_total + new.rent_share, flat_rent, new.flat_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger flat_members_check_shares
  before insert or update of rent_share, status on flat_members
  for each row when (new.status = 'active')
  execute function check_rent_shares();

-- ---------------------------------------------------------------------------
-- Invariant: expense shares must add up to the expense.
-- ---------------------------------------------------------------------------
create or replace function check_expense_shares()
returns trigger
language plpgsql
as $$
declare
  total numeric(12, 2);
  expense_amount numeric(12, 2);
begin
  select amount into expense_amount from expenses where id = new.expense_id;

  select coalesce(sum(amount), 0) into total
  from expense_shares
  where expense_id = new.expense_id
    and id <> new.id;

  if total + new.amount > expense_amount + 0.01 then
    raise exception 'Expense shares (%) exceed the expense total (%)', total + new.amount, expense_amount
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger expense_shares_check_total
  before insert or update of amount on expense_shares
  for each row execute function check_expense_shares();

-- ---------------------------------------------------------------------------
-- Confirmed payments drive dues.amount_paid and dues.status. Application code
-- never writes those two columns.
-- ---------------------------------------------------------------------------
create or replace function sync_due_from_payments()
returns trigger
language plpgsql
as $$
declare
  target_due uuid := coalesce(new.due_id, old.due_id);
  paid numeric(12, 2);
  owed numeric(12, 2);
begin
  if target_due is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(amount), 0) into paid
  from payments
  where due_id = target_due and status = 'confirmed';

  select amount into owed from dues where id = target_due;

  update dues
  set amount_paid = least(paid, owed),
      status = case
        when paid >= owed then 'paid'::due_status
        when paid > 0 then 'partially_paid'::due_status
        else 'open'::due_status
      end
  where id = target_due
    and status <> 'waived';

  return coalesce(new, old);
end;
$$;

create trigger payments_sync_due
  after insert or update of status, amount, due_id or delete on payments
  for each row execute function sync_due_from_payments();

-- ---------------------------------------------------------------------------
-- Moderator handover cooldown: 24 hours between accepted transfers on a flat.
-- ---------------------------------------------------------------------------
create or replace function check_transfer_cooldown()
returns trigger
language plpgsql
as $$
declare
  last_accepted timestamptz;
begin
  select max(responded_at) into last_accepted
  from moderator_transfers
  where flat_id = new.flat_id and status = 'accepted';

  if last_accepted is not null and last_accepted > now() - interval '24 hours' then
    raise exception 'A moderator handover for this flat was completed less than 24 hours ago'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger moderator_transfers_cooldown
  before insert on moderator_transfers
  for each row execute function check_transfer_cooldown();

-- ---------------------------------------------------------------------------
-- Maintenance status changes always leave a trace.
-- ---------------------------------------------------------------------------
create or replace function log_maintenance_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into maintenance_events (request_id, from_status, to_status, actor_id)
    values (new.id, null, new.status, new.reported_by);
  elsif new.status is distinct from old.status then
    insert into maintenance_events (request_id, from_status, to_status, actor_id)
    values (new.id, old.status, new.status, new.assigned_to);
  end if;
  return new;
end;
$$;

create trigger maintenance_status_history
  after insert or update of status on maintenance_requests
  for each row execute function log_maintenance_status();
