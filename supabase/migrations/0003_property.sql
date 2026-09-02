-- 0003 — buildings, flats/units, residents and landlord rent

create table buildings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  name          text not null check (length(btrim(name)) between 2 and 120),
  address_line  text not null,
  area          text,
  city          text not null default 'Dhaka',
  postcode      text,
  floors_count  smallint not null default 1 check (floors_count between 1 and 200),
  amenities     text[] not null default '{}',
  photo_url     text,
  notes         text,
  archived_at   timestamptz,
  created_by    uuid not null references profiles (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, name)
);

create trigger buildings_set_updated_at
  before update on buildings
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- flats: the unit of rent. rent_due_day is the day of month rent is expected,
-- capped at 28 so every month has one.
-- ---------------------------------------------------------------------------
create table flats (
  id                uuid primary key default gen_random_uuid(),
  building_id       uuid not null references buildings (id) on delete cascade,
  unit_number       text not null check (length(btrim(unit_number)) between 1 and 16),
  floor             smallint not null check (floor between -3 and 200),
  size_sqft         integer check (size_sqft is null or size_sqft between 50 and 20000),
  bedrooms          smallint check (bedrooms is null or bedrooms between 0 and 20),
  monthly_rent      numeric(12, 2) not null default 0 check (monthly_rent >= 0),
  landlord_rent     numeric(12, 2) not null default 0 check (landlord_rent >= 0),
  rent_due_day      smallint not null default 5 check (rent_due_day between 1 and 28),
  occupancy_status  occupancy_status not null default 'vacant',
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (building_id, unit_number)
);

comment on column flats.landlord_rent is
  'What the organization owes the landlord for this unit, when the org sublets.';

create trigger flats_set_updated_at
  before update on flats
  for each row execute function set_updated_at();

-- Deferred FK from 0002: an invite may target a specific flat.
alter table invites
  add constraint invites_flat_id_fkey
  foreign key (flat_id) references flats (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- flat_members: residents and the one moderator per flat, each with a share of
-- the rent. Shares are validated against flats.monthly_rent in 0005.
-- ---------------------------------------------------------------------------
create table flat_members (
  id            uuid primary key default gen_random_uuid(),
  flat_id       uuid not null references flats (id) on delete cascade,
  user_id       uuid not null references profiles (id) on delete cascade,
  role          flat_role not null default 'resident',
  rent_share    numeric(12, 2) not null default 0 check (rent_share >= 0),
  status        membership_status not null default 'active',
  joined_at     date not null default current_date,
  left_at       date,
  left_reason   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint flat_member_dates_ordered check (left_at is null or left_at >= joined_at),
  constraint flat_member_left_has_status check (left_at is null or status = 'left')
);

-- A person holds at most one live membership in a given flat.
create unique index flat_members_one_active_per_user
  on flat_members (flat_id, user_id)
  where status in ('invited', 'active', 'suspended');

-- Exactly one moderator per flat at a time.
create unique index flat_members_single_moderator
  on flat_members (flat_id)
  where role = 'moderator' and status = 'active';

create trigger flat_members_set_updated_at
  before update on flat_members
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- landlord_rent_records: what the org paid the landlord, per flat per month.
-- Separate from resident dues — different direction of money.
-- ---------------------------------------------------------------------------
create table landlord_rent_records (
  id          uuid primary key default gen_random_uuid(),
  flat_id     uuid not null references flats (id) on delete cascade,
  period      date not null,
  amount      numeric(12, 2) not null check (amount >= 0),
  paid_at     date,
  reference   text,
  recorded_by uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (flat_id, period),
  constraint landlord_period_is_month_start check (period = date_trunc('month', period)::date)
);

create trigger landlord_rent_set_updated_at
  before update on landlord_rent_records
  for each row execute function set_updated_at();
