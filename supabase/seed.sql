-- Seed: one organization, one six-storey building, twelve flats, real residents
-- and a September ledger with a paid, a due and an overdue flat.
--
-- Run after the migrations:
--   psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Users are inserted into auth.users directly. On a real Supabase project,
-- create them through the Auth API instead and keep only the rows below it.

begin;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-4111-8111-111111111111', 'owner@housecontrol.test',   '{"full_name":"Shahnaz Karim"}'),
  ('22222222-2222-4222-8222-222222222222', 'shirin@housecontrol.test',  '{"full_name":"Shirin Akter"}'),
  ('33333333-3333-4333-8333-333333333333', 'kamrul@housecontrol.test',  '{"full_name":"Kamrul Hasan"}'),
  ('44444444-4444-4444-8444-444444444444', 'sabbir@housecontrol.test',  '{"full_name":"Sabbir Rahman"}'),
  ('55555555-5555-4555-8555-555555555555', 'guard@housecontrol.test',   '{"full_name":"Jalal Mia"}')
on conflict (id) do nothing;

-- The trigger from 0002 creates profiles automatically; fill in the extras.
update profiles set phone = '01711000001', phone_verified_at = now(), platform_role = 'admin'
  where id = '11111111-1111-4111-8111-111111111111';
update profiles set phone = '01711000002' where id = '22222222-2222-4222-8222-222222222222';
update profiles set phone = '01711000003' where id = '33333333-3333-4333-8333-333333333333';
update profiles set phone = '01711000004' where id = '44444444-4444-4444-8444-444444444444';
update profiles set phone = '01711000005' where id = '55555555-5555-4555-8555-555555555555';

-- ---------------------------------------------------------------------------
-- Organization, plan and staff
-- ---------------------------------------------------------------------------
insert into organizations (id, name, slug, owner_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Karim Properties', 'karim-properties',
   '11111111-1111-4111-8111-111111111111');

insert into subscriptions (org_id, plan, unit_limit, building_limit) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'pro', 1000, 50);

insert into org_members (org_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'admin'),
  ('aaaaaaaa-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555', 'guard');

-- ---------------------------------------------------------------------------
-- Building and flats
-- ---------------------------------------------------------------------------
insert into buildings (id, org_id, name, address_line, area, floors_count, amenities, created_by)
values (
  'bbbbbbbb-0000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000001',
  'Nasreen Tower',
  'Road 7, House 22',
  'Mirpur DOHS',
  6,
  array['lift', 'generator', 'parking', 'security'],
  '11111111-1111-4111-8111-111111111111'
);

insert into flats (id, building_id, unit_number, floor, monthly_rent, rent_due_day, occupancy_status)
values
  ('cccccccc-0000-4000-8000-000000000051', 'bbbbbbbb-0000-4000-8000-000000000001', '5B', 5, 24500, 5, 'occupied'),
  ('cccccccc-0000-4000-8000-000000000041', 'bbbbbbbb-0000-4000-8000-000000000001', '4A', 4, 23000, 5, 'occupied'),
  ('cccccccc-0000-4000-8000-000000000031', 'bbbbbbbb-0000-4000-8000-000000000001', '3A', 3, 22000, 5, 'occupied'),
  ('cccccccc-0000-4000-8000-000000000061', 'bbbbbbbb-0000-4000-8000-000000000001', '6B', 6, 26000, 5, 'vacant');

-- 5B is a shared flat: the moderator and one resident split the rent.
insert into flat_members (flat_id, user_id, role, rent_share) values
  ('cccccccc-0000-4000-8000-000000000051', '22222222-2222-4222-8222-222222222222', 'moderator', 14500),
  ('cccccccc-0000-4000-8000-000000000051', '33333333-3333-4333-8333-333333333333', 'resident', 10000),
  ('cccccccc-0000-4000-8000-000000000041', '33333333-3333-4333-8333-333333333333', 'moderator', 23000),
  ('cccccccc-0000-4000-8000-000000000031', '44444444-4444-4444-8444-444444444444', 'moderator', 22000);

-- ---------------------------------------------------------------------------
-- September ledger: one paid, one part-paid, one untouched
-- ---------------------------------------------------------------------------
insert into dues (id, flat_id, user_id, source, period, amount, due_date, created_by) values
  ('dddddddd-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000031',
   '44444444-4444-4444-8444-444444444444', 'rent', date_trunc('month', now())::date, 22000,
   (date_trunc('month', now()) + interval '4 days')::date, '11111111-1111-4111-8111-111111111111'),
  ('dddddddd-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000041',
   '33333333-3333-4333-8333-333333333333', 'rent', date_trunc('month', now())::date, 23000,
   (date_trunc('month', now()) + interval '4 days')::date, '11111111-1111-4111-8111-111111111111'),
  ('dddddddd-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000051',
   '22222222-2222-4222-8222-222222222222', 'rent', date_trunc('month', now())::date, 14500,
   (date_trunc('month', now()) + interval '4 days')::date, '11111111-1111-4111-8111-111111111111');

-- Confirmed payments update dues.amount_paid and dues.status via the trigger
-- in 0006 — no manual status writing anywhere.
insert into payments (flat_id, due_id, paid_by, amount, method, status, reviewed_by, reviewed_at, receipt_no)
values
  ('cccccccc-0000-4000-8000-000000000031', 'dddddddd-0000-4000-8000-000000000001',
   '44444444-4444-4444-8444-444444444444', 22000, 'bkash', 'confirmed',
   '11111111-1111-4111-8111-111111111111', now(), 'HC-2609-0001'),
  ('cccccccc-0000-4000-8000-000000000041', 'dddddddd-0000-4000-8000-000000000002',
   '33333333-3333-4333-8333-333333333333', 14000, 'bkash', 'confirmed',
   '11111111-1111-4111-8111-111111111111', now(), 'HC-2609-0002');

-- A pending payment waiting on the moderator.
insert into payments (flat_id, due_id, paid_by, amount, method, status, reference)
values ('cccccccc-0000-4000-8000-000000000051', 'dddddddd-0000-4000-8000-000000000003',
        '22222222-2222-4222-8222-222222222222', 14500, 'bank_transfer', 'pending', 'DBBL-99120');

-- ---------------------------------------------------------------------------
-- A gas bill split across the three occupied flats
-- ---------------------------------------------------------------------------
insert into expenses (id, building_id, category, title, amount, period, split_method, created_by)
values ('eeeeeeee-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001',
        'gas', 'Titas gas — September', 3600, date_trunc('month', now())::date, 'equal',
        '11111111-1111-4111-8111-111111111111');

insert into expense_shares (expense_id, flat_id, amount) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000051', 1200),
  ('eeeeeeee-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000041', 1200),
  ('eeeeeeee-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000031', 1200);

-- ---------------------------------------------------------------------------
-- Gate and repairs
-- ---------------------------------------------------------------------------
insert into visitors (building_id, flat_id, full_name, phone, purpose, state, entered_at, logged_by)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000051',
   'Daraz courier', '01711000009', 'Parcel delivery', 'inside', now() - interval '2 hours',
   '55555555-5555-4555-8555-555555555555'),
  ('bbbbbbbb-0000-4000-8000-000000000001', null,
   'Titas meter reader', '01711000010', 'Monthly reading', 'exited', now() - interval '5 hours',
   '55555555-5555-4555-8555-555555555555');

insert into maintenance_requests
  (building_id, flat_id, reference, title, description, category, priority, reported_by)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000041', 'MR-0001',
   'Lift stops between floors 3 and 4',
   'The lift jerks and stops for about ten seconds between the third and fourth floor.',
   'lift', 'high', '33333333-3333-4333-8333-333333333333'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000031', 'MR-0002',
   'Kitchen tap leaking',
   'Water drips continuously from the kitchen tap even when closed fully.',
   'repair', 'normal', '44444444-4444-4444-8444-444444444444');

commit;
