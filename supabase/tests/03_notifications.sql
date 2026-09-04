-- Notifications: the guarantee that a job running twice sends once.

\set ON_ERROR_STOP on

insert into notifications (user_id, event, title, dedupe_key, subject_id)
values ('22222222-2222-4222-8222-222222222222', 'due.reminder', 'Rent due today',
        'due.reminder:22222222-2222-4222-8222-222222222222:due-9:2026-09-05', 'due-9');

select expect_failure(
  'the same reminder cannot be sent twice on one day',
  $$insert into notifications (user_id, event, title, dedupe_key, subject_id)
    values ('22222222-2222-4222-8222-222222222222', 'due.reminder', 'Rent due today',
            'due.reminder:22222222-2222-4222-8222-222222222222:due-9:2026-09-05', 'due-9')$$
);

insert into notifications (user_id, event, title, dedupe_key, subject_id)
values ('22222222-2222-4222-8222-222222222222', 'due.reminder', 'Rent overdue',
        'due.reminder:22222222-2222-4222-8222-222222222222:due-9:2026-09-06', 'due-9');

select expect_equal(
  'the same charge reminds again tomorrow',
  (select count(*)::int from notifications where subject_id = 'due-9'),
  2
);

-- Notices with no key are never deduplicated: two visitors really did arrive.
insert into notifications (user_id, event, title) values
  ('22222222-2222-4222-8222-222222222222', 'visitor.arrived', 'Someone is at the gate'),
  ('22222222-2222-4222-8222-222222222222', 'visitor.arrived', 'Someone is at the gate');

select expect_equal(
  'unkeyed notices are never merged',
  (select count(*)::int from notifications where event = 'visitor.arrived'),
  2
);

select expect_failure(
  'a delivery marked sent must say when',
  $$insert into message_deliveries (channel, user_id, to_email, template, status)
    values ('email', '22222222-2222-4222-8222-222222222222', 'shirin@housecontrol.test',
            'due.reminder', 'sent')$$
);

select expect_failure(
  'an email delivery needs an address',
  $$insert into message_deliveries (channel, user_id, template, status)
    values ('email', '22222222-2222-4222-8222-222222222222', 'due.reminder', 'queued')$$
);

select expect_failure(
  'an unknown delivery status is refused',
  $$insert into message_deliveries (channel, user_id, to_phone, template, status)
    values ('sms', '22222222-2222-4222-8222-222222222222', '01711000002', 'due.reminder', 'maybe')$$
);
