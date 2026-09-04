-- Supabase provides `auth.users` and `auth.uid()`. A plain Postgres instance
-- does not, so the test harness supplies the smallest stand-in the migrations
-- need. Never run this against a real project.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
