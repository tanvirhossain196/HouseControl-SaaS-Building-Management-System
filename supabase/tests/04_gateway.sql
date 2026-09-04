-- Gateway callbacks: the same event arriving more than once.

\set ON_ERROR_STOP on

insert into webhook_events (provider, transaction_id, validation_id, signature_ok, outcome)
values ('sslcommerz', 'HC1A2B3C4D', '2609031200000001', true, 'confirmed');

select expect_failure(
  'a replayed callback is refused',
  $$insert into webhook_events (provider, transaction_id, validation_id, signature_ok, outcome)
    values ('sslcommerz', 'HC1A2B3C4D', '2609031200000001', true, 'confirmed')$$
);

insert into webhook_events (provider, transaction_id, validation_id, signature_ok, outcome)
values ('sslcommerz', 'HC1A2B3C4D', '2609031200000002', true, 'duplicate');

select expect_equal(
  'a genuine retry with a new validation id is allowed',
  (select count(*)::int from webhook_events where transaction_id = 'HC1A2B3C4D'),
  2
);

select expect_failure(
  'an unknown outcome is refused',
  $$insert into webhook_events (provider, transaction_id, signature_ok, outcome)
    values ('sslcommerz', 'HCZZZZ', true, 'whatever')$$
);

insert into payments (flat_id, amount, method, status, gateway, transaction_id)
values ('cccccccc-0000-4000-8000-000000000051', 14500, 'card', 'pending', 'sslcommerz', 'HCUNIQUE1');

select expect_failure(
  'two payments cannot claim one gateway transaction',
  $$insert into payments (flat_id, amount, method, status, gateway, transaction_id)
    values ('cccccccc-0000-4000-8000-000000000041', 23000, 'card', 'pending', 'sslcommerz',
            'HCUNIQUE1')$$
);

select expect_equal(
  'refused callbacks stay on the record',
  (select count(*)::int > 0 from webhook_events),
  true
);
