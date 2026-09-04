-- Handover, the gate, and repairs.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Moderator handover
-- ---------------------------------------------------------------------------
insert into moderator_transfers (flat_id, from_user_id, to_user_id, expires_at)
values ('cccccccc-0000-4000-8000-000000000051',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        now() + interval '48 hours');

select expect_failure(
  'only one handover can be in flight per flat',
  $$insert into moderator_transfers (flat_id, from_user_id, to_user_id, expires_at)
    values ('cccccccc-0000-4000-8000-000000000051',
            '22222222-2222-4222-8222-222222222222',
            '33333333-3333-4333-8333-333333333333', now() + interval '48 hours')$$
);

select expect_failure(
  'a role cannot be handed to yourself',
  $$insert into moderator_transfers (flat_id, from_user_id, to_user_id, expires_at)
    values ('cccccccc-0000-4000-8000-000000000031',
            '44444444-4444-4444-8444-444444444444',
            '44444444-4444-4444-8444-444444444444', now() + interval '48 hours')$$
);

select expect_failure(
  'a handover cannot be accepted before the code is verified',
  $$update moderator_transfers set status = 'accepted', responded_at = now()
    where flat_id = 'cccccccc-0000-4000-8000-000000000051' and status = 'pending'$$
);

select expect_failure(
  'a sixth wrong code cannot be recorded',
  $$update moderator_transfers set otp_attempts = 6
    where flat_id = 'cccccccc-0000-4000-8000-000000000051'$$
);

-- With the code verified it goes through, and the cooldown then applies.
update moderator_transfers set otp_verified_at = now()
where flat_id = 'cccccccc-0000-4000-8000-000000000051' and status = 'pending';

update moderator_transfers
set status = 'accepted', responded_at = now(), rollback_deadline = now() + interval '7 days'
where flat_id = 'cccccccc-0000-4000-8000-000000000051' and status = 'pending';

select expect_equal(
  'an accepted handover has a rollback window',
  (select rollback_deadline is not null
   from moderator_transfers
   where flat_id = 'cccccccc-0000-4000-8000-000000000051' and status = 'accepted'),
  true
);

select expect_failure(
  'a second handover within 24 hours is refused',
  $$insert into moderator_transfers (flat_id, from_user_id, to_user_id, expires_at)
    values ('cccccccc-0000-4000-8000-000000000051',
            '33333333-3333-4333-8333-333333333333',
            '22222222-2222-4222-8222-222222222222', now() + interval '48 hours')$$
);

-- ---------------------------------------------------------------------------
-- The gate
-- ---------------------------------------------------------------------------
insert into visitors (building_id, flat_id, full_name, state, entry_code, code_expires_at, pre_approved_by)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000051',
        'Rumana', 'pre_approved', 'KF72M9', now() + interval '12 hours',
        '22222222-2222-4222-8222-222222222222');

select expect_failure(
  'two live pre-approvals cannot share a code',
  $$insert into visitors (building_id, flat_id, full_name, state, entry_code, code_expires_at, pre_approved_by)
    values ('bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000041',
            'Someone else', 'pre_approved', 'KF72M9', now() + interval '12 hours',
            '33333333-3333-4333-8333-333333333333')$$
);

-- Once used, the code frees its value.
update visitors set state = 'inside', entered_at = now(), entry_code = null
where entry_code = 'KF72M9';

insert into visitors (building_id, flat_id, full_name, state, entry_code, code_expires_at, pre_approved_by)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000041',
        'Someone else', 'pre_approved', 'KF72M9', now() + interval '12 hours',
        '33333333-3333-4333-8333-333333333333');

select expect_equal(
  'a spent code can be issued again',
  (select count(*)::int from visitors where entry_code = 'KF72M9'),
  1
);

select expect_failure(
  'an exit cannot precede the entry',
  $$update visitors set exited_at = entered_at - interval '1 hour' where full_name = 'Rumana'$$
);

select expect_failure(
  'a block needs a real reason',
  $$insert into blocked_visitors (building_id, full_name, phone, reason, blocked_by)
    values ('bbbbbbbb-0000-4000-8000-000000000001', 'Nuisance', '01799999999', 'bad',
            '11111111-1111-4111-8111-111111111111')$$
);

insert into blocked_visitors (building_id, full_name, phone, reason, blocked_by)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'Nuisance caller', '01799999999',
        'Refused to say which flat, abusive to the guard',
        '11111111-1111-4111-8111-111111111111');

select expect_failure(
  'one live block per number per building',
  $$insert into blocked_visitors (building_id, full_name, phone, reason, blocked_by)
    values ('bbbbbbbb-0000-4000-8000-000000000001', 'Same person', '01799999999',
            'Tried again the next evening', '11111111-1111-4111-8111-111111111111')$$
);

-- ---------------------------------------------------------------------------
-- Repairs
-- ---------------------------------------------------------------------------
select expect_failure(
  'resolving without a timestamp is refused',
  $$update maintenance_requests set status = 'resolved', resolved_at = null
    where reference = 'MR-0001'$$
);

select expect_failure(
  'a reference cannot repeat within a building',
  $$insert into maintenance_requests (building_id, reference, title, description, reported_by)
    values ('bbbbbbbb-0000-4000-8000-000000000001', 'MR-0001', 'Duplicate',
            'Trying to reuse a reference number', '33333333-3333-4333-8333-333333333333')$$
);

select expect_failure(
  'a note with no text is refused',
  $$insert into maintenance_events (request_id, to_status, kind, note, actor_id)
    select id, 'open', 'note', '   ', '33333333-3333-4333-8333-333333333333'
    from maintenance_requests where reference = 'MR-0001'$$
);

-- The status trigger writes history without the application asking.
select expect_equal(
  'a status change writes a timeline row',
  (select count(*)::int from maintenance_events
   where request_id = (select id from maintenance_requests where reference = 'MR-0002')),
  1
);

update maintenance_requests set status = 'in_progress' where reference = 'MR-0002';

select expect_equal(
  'the timeline grew by exactly one',
  (select count(*)::int from maintenance_events
   where request_id = (select id from maintenance_requests where reference = 'MR-0002')),
  2
);
