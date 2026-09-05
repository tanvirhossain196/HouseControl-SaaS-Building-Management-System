-- Row Level Security, exercised as a real signed-in user rather than as the
-- table owner.
--
-- Every other suite runs as the owner, who bypasses RLS — which is exactly
-- how a recursive policy shipped unnoticed: the seed worked, the tests
-- passed, and the first owner to open their own buildings page got an empty
-- list and a generic error on every write.

\set ON_ERROR_STOP on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;

grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on auth.users to authenticated;
grant execute on all functions in schema public to authenticated;

-- Runs a query as one user and reports what it returns.
create or replace function as_user(user_id uuid, query text)
returns bigint language plpgsql as $$
declare
  result bigint;
begin
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  execute query into result;
  return result;
end;
$$;

create or replace function fails_as_user(what text, user_id uuid, statement text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', user_id::text, true);
  begin
    execute statement;
  exception when others then
    raise notice 'ok  %', what;
    return;
  end;
  raise exception 'FAILED: % was allowed when it should have been refused', what;
end;
$$;

begin;
set local role authenticated;

-- The owner of Karim Properties.
select expect_equal(
  'an owner sees their own building',
  as_user('11111111-1111-4111-8111-111111111111', 'select count(*) from buildings'),
  1::bigint
);

select expect_equal(
  'an owner sees every flat in it',
  as_user('11111111-1111-4111-8111-111111111111', 'select count(*) from flats'),
  4::bigint
);

-- Shirin moderates 5B and lives in it. She should see her flat and the
-- building it is in — and no other flat.
select expect_equal(
  'a moderator sees the building their flat is in',
  as_user('22222222-2222-4222-8222-222222222222', 'select count(*) from buildings'),
  1::bigint
);

select expect_equal(
  'a moderator sees only their own flat',
  as_user('22222222-2222-4222-8222-222222222222', 'select count(*) from flats'),
  1::bigint
);

select expect_equal(
  'a resident sees only their own dues',
  as_user('44444444-4444-4444-8444-444444444444',
          'select count(*) from dues where user_id <> ''44444444-4444-4444-8444-444444444444'''),
  0::bigint
);

select expect_equal(
  'a resident cannot read the landlord rent the owner pays',
  as_user('44444444-4444-4444-8444-444444444444',
          'select count(*) from landlord_rent_records'),
  0::bigint
);

rollback;

-- Writes, as the people who should and should not be allowed to make them.
begin;
set local role authenticated;

select fails_as_user(
  'a resident cannot create a building',
  '44444444-4444-4444-8444-444444444444',
  $$insert into buildings (org_id, name, address_line, created_by)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'Not mine', 'Road 1',
            '44444444-4444-4444-8444-444444444444')$$
);

select fails_as_user(
  'a resident cannot add a flat',
  '44444444-4444-4444-8444-444444444444',
  $$insert into flats (building_id, unit_number, floor)
    values ('bbbbbbbb-0000-4000-8000-000000000001', '9Z', 9)$$
);

rollback;

-- And the case the recursion broke: the owner doing ordinary work.
-- The case the recursion broke: an owner doing ordinary work. `set_config`
-- rather than `perform`, which is plpgsql and not valid at the top level.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

insert into buildings (org_id, name, address_line, created_by)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'Second Tower', 'Road 9',
        '11111111-1111-4111-8111-111111111111');

select expect_equal(
  'an owner can add a second building',
  (select count(*) from buildings),
  2::bigint
);

select expect_equal(
  'and can read it back straight away',
  (select count(*) from buildings where name = 'Second Tower'),
  1::bigint
);

rollback;
