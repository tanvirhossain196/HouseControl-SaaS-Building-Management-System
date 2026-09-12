-- 0002 — people, organizations, billing and invitations

-- ---------------------------------------------------------------------------
-- profiles: one row per authenticated user, mirroring auth.users.
-- Auth data stays in auth.users; everything the app displays lives here.
-- ---------------------------------------------------------------------------
create table profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           citext not null unique,
  full_name       text not null check (length(btrim(full_name)) between 2 and 120),
  phone           text unique check (phone ~ '^(\+?88)?01[3-9][0-9]{8}$'),
  phone_verified_at timestamptz,
  avatar_url      text,
  locale          text not null default 'en' check (locale in ('en', 'bn')),
  platform_role   app_role not null default 'member',
  last_seen_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column profiles.platform_role is
  'Only super_admin is meaningful here. Real authority comes from org_members and flat_members.';

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Create the profile row as soon as Supabase Auth creates the user.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- organizations: the billing and ownership boundary. One owner may hold
-- several buildings under a single organization.
-- ---------------------------------------------------------------------------
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 2 and 120),
  slug        citext not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$'),
  owner_id    uuid not null references profiles (id) on delete restrict,
  country     text not null default 'BD',
  timezone    text not null default 'Asia/Dhaka',
  currency    char(3) not null default 'BDT',
  suspended_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

-- org_members: who may act on the organization. Flat-level access is separate.
create table org_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  user_id     uuid not null references profiles (id) on delete cascade,
  role        org_role not null,
  status      membership_status not null default 'active',
  invited_by  uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

create trigger org_members_set_updated_at
  before update on org_members
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- subscriptions: one active row per organization (Phase 15 wires the gateway).
-- ---------------------------------------------------------------------------
create table subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations (id) on delete cascade,
  plan                  plan_tier not null default 'free',
  status                subscription_status not null default 'active',
  unit_limit            integer not null default 12 check (unit_limit > 0),
  building_limit        integer not null default 1 check (building_limit > 0),
  current_period_start  date not null default period_start(),
  current_period_end    date,
  provider              text,
  provider_reference    text,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint subscription_period_order check (
    current_period_end is null or current_period_end > current_period_start
  )
);

-- At most one non-cancelled subscription per organization.
create unique index subscriptions_one_active_per_org
  on subscriptions (org_id)
  where status <> 'cancelled';

create trigger subscriptions_set_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- invites: the only way a person joins a building. The hash is used for secure
-- lookup, while the raw token is retained so the inviter can copy the link
-- again from the resident/invite list.
-- ---------------------------------------------------------------------------
create table invites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  flat_id      uuid,  -- FK added in 0003 once flats exists
  email        citext not null,
  role         app_role not null check (role in ('admin', 'moderator', 'member', 'guard')),
  rent_share   numeric(12, 2) check (rent_share is null or rent_share >= 0),
  token        text not null unique,
  token_hash   text not null unique,
  invited_by   uuid not null references profiles (id) on delete cascade,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references profiles (id) on delete set null,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint invite_expiry_in_future check (expires_at > created_at),
  constraint invite_flat_role_needs_flat check (
    role not in ('moderator', 'member') or flat_id is not null
  )
);

-- One live invite per email per flat (or per org for org-level roles).
create unique index invites_one_pending_per_target
  on invites (org_id, coalesce(flat_id, '00000000-0000-0000-0000-000000000000'::uuid), email)
  where accepted_at is null and revoked_at is null;
