-- 0011 — complaints and repairs
--
-- Phase 2 gave `maintenance_requests` its shape and a trigger that logs every
-- status change. Running the feature needs three more things: a way for
-- people to talk on the request rather than on WhatsApp, a link from a repair
-- to what it cost, and policies that let a resident say something on their
-- own complaint without being able to close it.

alter table maintenance_requests
  add column if not exists scheduled_for date,
  add column if not exists resolved_by uuid references profiles (id) on delete set null,
  add column if not exists cost numeric(12, 2) check (cost is null or cost >= 0),
  add column if not exists expense_id uuid references expenses (id) on delete set null,
  add column if not exists reopened_count smallint not null default 0;

comment on column maintenance_requests.expense_id is
  'Set when resolving with a cost creates a building expense, so the repair and the money stay linked.';
comment on column maintenance_requests.reopened_count is
  'How many times this came back. A tap fixed three times is a different conversation.';

-- ---------------------------------------------------------------------------
-- The thread. `maintenance_events` already records status changes; a note is
-- the same kind of thing with no status attached, so it lives in the same
-- table and the timeline stays in one order.
-- ---------------------------------------------------------------------------
alter table maintenance_events
  add column if not exists kind text not null default 'status',
  add column if not exists photo_urls text[] not null default '{}';

alter table maintenance_events
  add constraint maintenance_event_kind_known check (kind in ('status', 'note'));

-- A note carries text; a status change does not have to.
alter table maintenance_events
  add constraint maintenance_note_has_text check (
    kind <> 'note' or length(btrim(coalesce(note, ''))) > 0
  );

create index if not exists maintenance_events_kind_idx
  on maintenance_events (request_id, kind, created_at desc);

create index if not exists maintenance_scheduled_idx
  on maintenance_requests (scheduled_for)
  where status in ('open', 'in_progress');

-- ---------------------------------------------------------------------------
-- Policies
--
-- The person who reported a problem must be able to add to it and withdraw
-- it. They must not be able to mark it resolved — that is the judgement of
-- whoever did the work, and a complaint closed by the complainant is a
-- complaint nobody can audit.
-- ---------------------------------------------------------------------------
drop policy if exists maintenance_manage on maintenance_requests;

create policy maintenance_manage on maintenance_requests
  for update
  using (
    flat_id in (select auth_managed_flat_ids())
    or building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids('admin')))
  )
  with check (
    flat_id in (select auth_managed_flat_ids())
    or building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids('admin')))
  );

-- The reporter may cancel their own, and nothing else about it.
create policy maintenance_cancel_own on maintenance_requests
  for update
  using (reported_by = auth.uid() and status in ('open', 'in_progress'))
  with check (reported_by = auth.uid() and status = 'cancelled');

-- Anyone who can see the request can add a note to it. Status rows are
-- written by the trigger, under the service role.
create policy maintenance_events_write on maintenance_events
  for insert
  with check (
    kind = 'note'
    and actor_id = auth.uid()
    and request_id in (select id from maintenance_requests)
  );
