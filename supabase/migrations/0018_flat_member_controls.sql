-- 0018 — flat member visibility and moderator controls
--
-- These settings are stored per flat. They control which member details are
-- visible to residents on the My Flat page. Moderator/admin users may manage
-- them; residents may only read the effective settings for their own flat.

create table if not exists flat_visibility_settings (
  flat_id                 uuid primary key references flats (id) on delete cascade,
  show_member_phone       boolean not null default true,
  show_member_rent        boolean not null default true,
  show_payment_status     boolean not null default true,
  show_due_date           boolean not null default true,
  show_member_list        boolean not null default true,
  show_moderator_phone    boolean not null default true,
  updated_by              uuid references profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger flat_visibility_settings_set_updated_at
  before update on flat_visibility_settings
  for each row execute function set_updated_at();

create index if not exists flat_visibility_settings_updated_idx
  on flat_visibility_settings (updated_at desc);

comment on table flat_visibility_settings is
  'Moderator-controlled visibility preferences for the resident My Flat page.';

comment on column flat_visibility_settings.show_member_phone is
  'Whether residents may see active members phone numbers.';

comment on column flat_visibility_settings.show_member_rent is
  'Whether residents may see other members rent shares.';

comment on column flat_visibility_settings.show_payment_status is
  'Whether residents may see member payment status.';

comment on column flat_visibility_settings.show_due_date is
  'Whether residents may see rent/due dates.';

comment on column flat_visibility_settings.show_member_list is
  'Whether residents may see the active resident list.';

comment on column flat_visibility_settings.show_moderator_phone is
  'Whether residents may see the moderator phone number.';

-- New flats use the secure defaults immediately. Existing flats also receive
-- a row so the service can always return one deterministic settings object.
insert into flat_visibility_settings (flat_id)
select id
from flats
on conflict (flat_id) do nothing;

alter table flat_visibility_settings enable row level security;

drop policy if exists flat_visibility_settings_select on flat_visibility_settings;
create policy flat_visibility_settings_select
  on flat_visibility_settings
  for select
  using (
    exists (
      select 1
      from flat_members fm
      where fm.flat_id = flat_visibility_settings.flat_id
        and fm.user_id = auth.uid()
        and fm.status = 'active'
    )
    or exists (
      select 1
      from flats f
      join buildings b on b.id = f.building_id
      join organizations o on o.id = b.org_id
      where f.id = flat_visibility_settings.flat_id
        and o.owner_id = auth.uid()
    )
  );

drop policy if exists flat_visibility_settings_insert on flat_visibility_settings;
create policy flat_visibility_settings_insert
  on flat_visibility_settings
  for insert
  with check (
    exists (
      select 1
      from flat_members fm
      where fm.flat_id = flat_visibility_settings.flat_id
        and fm.user_id = auth.uid()
        and fm.role = 'moderator'
        and fm.status = 'active'
    )
    or exists (
      select 1
      from flats f
      join buildings b on b.id = f.building_id
      join organizations o on o.id = b.org_id
      where f.id = flat_visibility_settings.flat_id
        and o.owner_id = auth.uid()
    )
  );

drop policy if exists flat_visibility_settings_update on flat_visibility_settings;
create policy flat_visibility_settings_update
  on flat_visibility_settings
  for update
  using (
    exists (
      select 1
      from flat_members fm
      where fm.flat_id = flat_visibility_settings.flat_id
        and fm.user_id = auth.uid()
        and fm.role = 'moderator'
        and fm.status = 'active'
    )
    or exists (
      select 1
      from flats f
      join buildings b on b.id = f.building_id
      join organizations o on o.id = b.org_id
      where f.id = flat_visibility_settings.flat_id
        and o.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from flat_members fm
      where fm.flat_id = flat_visibility_settings.flat_id
        and fm.user_id = auth.uid()
        and fm.role = 'moderator'
        and fm.status = 'active'
    )
    or exists (
      select 1
      from flats f
      join buildings b on b.id = f.building_id
      join organizations o on o.id = b.org_id
      where f.id = flat_visibility_settings.flat_id
        and o.owner_id = auth.uid()
    )
  );

-- Settings are never deleted directly by the UI. They follow the flat when
-- the flat itself is deleted.
drop policy if exists flat_visibility_settings_delete on flat_visibility_settings;
create policy flat_visibility_settings_delete
  on flat_visibility_settings
  for delete
  using (false);

