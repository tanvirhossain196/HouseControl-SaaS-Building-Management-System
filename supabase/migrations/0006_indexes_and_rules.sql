-- 0006 — indexes and database-level invariants

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists org_members_user_idx
  on org_members (user_id)
  where status = 'active';

create index if not exists org_members_org_idx
  on org_members (org_id, role)
  where status = 'active';

create index if not exists buildings_org_idx
  on buildings (org_id)
  where archived_at is null;

create index if not exists buildings_name_trgm
  on buildings using gin (name gin_trgm_ops);

create index if not exists flats_building_idx
  on flats (building_id)
  where archived_at is null;

create index if not exists flats_occupancy_idx
  on flats (building_id, occupancy_status);

create index if not exists flats_unit_number_trgm
  on flats using gin (unit_number gin_trgm_ops);

create index if not exists flat_members_user_idx
  on flat_members (user_id)
  where status = 'active';

create index if not exists flat_members_flat_idx
  on flat_members (flat_id, role)
  where status = 'active';

create index if not exists dues_flat_period_idx
  on dues (flat_id, period desc);

create index if not exists dues_user_open_idx
  on dues (user_id, due_date)
  where status in ('open', 'partially_paid');

create index if not exists dues_overdue_idx
  on dues (due_date)
  where status in ('open', 'partially_paid');

create index if not exists payments_flat_idx
  on payments (flat_id, paid_at desc);

create index if not exists payments_pending_idx
  on payments (flat_id)
  where status = 'pending';

create index if not exists payments_due_idx
  on payments (due_id);

create index if not exists payments_user_idx
  on payments (paid_by, paid_at desc);

create index if not exists expenses_building_period_idx
  on expenses (building_id, period desc);

create index if not exists expense_shares_flat_idx
  on expense_shares (flat_id);

create index if not exists visitors_building_time_idx
  on visitors (building_id, entered_at desc);

create index if not exists visitors_flat_idx
  on visitors (flat_id, entered_at desc);

create index if not exists visitors_inside_idx
  on visitors (building_id)
  where state = 'inside';

create index if not exists visitors_name_trgm
  on visitors using gin (full_name gin_trgm_ops);

create index if not exists maintenance_building_status_idx
  on maintenance_requests (building_id, status, created_at desc);

create index if not exists maintenance_flat_idx
  on maintenance_requests (flat_id, created_at desc);

create index if not exists maintenance_assignee_idx
  on maintenance_requests (assigned_to)
  where status <> 'resolved';

create index if not exists maintenance_events_request_idx
  on maintenance_events (request_id, created_at);

create index if not exists notifications_unread_idx
  on notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists notifications_user_idx
  on notifications (user_id, created_at desc);

create index if not exists audit_logs_org_idx
  on audit_logs (org_id, created_at desc);

create index if not exists audit_logs_entity_idx
  on audit_logs (entity_type, entity_id, created_at desc);

create index if not exists invites_email_idx
  on invites (email)
  where accepted_at is null
    and revoked_at is null;

create index if not exists invites_flat_pending_idx
  on invites (flat_id, created_at desc)
  where accepted_at is null
    and revoked_at is null;

create index if not exists landlord_rent_period_idx
  on landlord_rent_records (period desc);


-- ---------------------------------------------------------------------------
-- Rent share invariant
--
-- Active member shares can never exceed the flat's total monthly rent.
-- Pending invites are not counted here because their share is validated when
-- the invite is created and again when the invite is accepted.
-- ---------------------------------------------------------------------------

create or replace function check_rent_shares()
returns trigger
language plpgsql
as $$
declare
  flat_rent numeric(12, 2);
  existing_share_total numeric(12, 2);
  new_total numeric(12, 2);
begin
  select monthly_rent
  into flat_rent
  from flats
  where id = new.flat_id
  for update;

  if flat_rent is null then
    raise exception
      'The selected flat does not exist.'
      using errcode = 'foreign_key_violation';
  end if;

  select coalesce(sum(rent_share), 0)
  into existing_share_total
  from flat_members
  where flat_id = new.flat_id
    and status = 'active'
    and id <> new.id;

  new_total := existing_share_total + coalesce(new.rent_share, 0);

  if new_total > flat_rent then
    raise exception
      'Active rent shares (%) cannot exceed total flat rent (%).',
      new_total,
      flat_rent
      using
        errcode = 'check_violation',
        detail = 'Reduce the moderator or existing member share before accepting this member.',
        hint = 'The total of all active member shares must be equal to or less than the flat rent.';
  end if;

  return new;
end;
$$;

drop trigger if exists flat_members_check_shares
on flat_members;

create trigger flat_members_check_shares
before insert or update of rent_share, status
on flat_members
for each row
when (new.status = 'active')
execute function check_rent_shares();


-- ---------------------------------------------------------------------------
-- Expense share invariant
-- ---------------------------------------------------------------------------

create or replace function check_expense_shares()
returns trigger
language plpgsql
as $$
declare
  total numeric(12, 2);
  expense_amount numeric(12, 2);
begin
  select amount
  into expense_amount
  from expenses
  where id = new.expense_id;

  if expense_amount is null then
    raise exception
      'The selected expense does not exist.'
      using errcode = 'foreign_key_violation';
  end if;

  select coalesce(sum(amount), 0)
  into total
  from expense_shares
  where expense_id = new.expense_id
    and id <> new.id;

  if total + coalesce(new.amount, 0) > expense_amount + 0.01 then
    raise exception
      'Expense shares (%) cannot exceed expense total (%).',
      total + coalesce(new.amount, 0),
      expense_amount
      using
        errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists expense_shares_check_total
on expense_shares;

create trigger expense_shares_check_total
before insert or update of amount
on expense_shares
for each row
execute function check_expense_shares();


-- ---------------------------------------------------------------------------
-- Payment-to-due synchronization
-- ---------------------------------------------------------------------------

create or replace function sync_due_from_payments()
returns trigger
language plpgsql
as $$
declare
  target_due uuid;
  paid numeric(12, 2);
  owed numeric(12, 2);
begin
  target_due := coalesce(new.due_id, old.due_id);

  if target_due is null then
    return coalesce(new, old);
  end if;

  select coalesce(sum(amount), 0)
  into paid
  from payments
  where due_id = target_due
    and status = 'confirmed';

  select amount
  into owed
  from dues
  where id = target_due;

  if owed is null then
    return coalesce(new, old);
  end if;

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

drop trigger if exists payments_sync_due
on payments;

create trigger payments_sync_due
after insert or update of status, amount, due_id or delete
on payments
for each row
execute function sync_due_from_payments();


-- ---------------------------------------------------------------------------
-- Moderator handover cooldown
-- ---------------------------------------------------------------------------

create or replace function check_transfer_cooldown()
returns trigger
language plpgsql
as $$
declare
  last_accepted timestamptz;
begin
  select max(responded_at)
  into last_accepted
  from moderator_transfers
  where flat_id = new.flat_id
    and status = 'accepted';

  if last_accepted is not null
     and last_accepted > now() - interval '24 hours' then
    raise exception
      'A moderator handover for this flat was completed less than 24 hours ago.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists moderator_transfers_cooldown
on moderator_transfers;

create trigger moderator_transfers_cooldown
before insert
on moderator_transfers
for each row
execute function check_transfer_cooldown();


-- ---------------------------------------------------------------------------
-- Maintenance status audit trail
-- ---------------------------------------------------------------------------

create or replace function log_maintenance_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into maintenance_events (
      request_id,
      from_status,
      to_status,
      actor_id
    )
    values (
      new.id,
      null,
      new.status,
      new.reported_by
    );

  elsif new.status is distinct from old.status then
    insert into maintenance_events (
      request_id,
      from_status,
      to_status,
      actor_id
    )
    values (
      new.id,
      old.status,
      new.status,
      new.assigned_to
    );
  end if;

  return new;
end;
$$;

drop trigger if exists maintenance_status_history
on maintenance_requests;

create trigger maintenance_status_history
after insert or update of status
on maintenance_requests
for each row
execute function log_maintenance_status();