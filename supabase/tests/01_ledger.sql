-- The ledger's invariants.
--
-- Each block asserts that a bad write is refused. `expect_failure` runs the
-- statement, catches the error, and fails loudly if there was no error —
-- a test that silently passes because the constraint was dropped is worse
-- than no test.

\set ON_ERROR_STOP on

create or replace function expect_failure(what text, statement text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    raise notice 'ok  %', what;
    return;
  end;
  raise exception 'FAILED: % was allowed when it should have been refused', what;
end;
$$;

create or replace function expect_equal(what text, actual anyelement, expected anyelement)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAILED: % — expected %, got %', what, expected, actual;
  end if;
  raise notice 'ok  %', what;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rent shares
-- ---------------------------------------------------------------------------
select expect_failure(
  'rent shares cannot exceed the flat rent',
  $$insert into flat_members (flat_id, user_id, role, rent_share)
    values ('cccccccc-0000-4000-8000-000000000051',
            '44444444-4444-4444-8444-444444444444', 'resident', 5000)$$
);

select expect_failure(
  'a flat cannot have two moderators',
  $$insert into flat_members (flat_id, user_id, role, rent_share)
    values ('cccccccc-0000-4000-8000-000000000031',
            '22222222-2222-4222-8222-222222222222', 'moderator', 0)$$
);

-- ---------------------------------------------------------------------------
-- Dues and payments
-- ---------------------------------------------------------------------------
select expect_failure(
  'a due cannot be paid more than its amount',
  $$update dues set amount_paid = amount + 1
    where id = 'dddddddd-0000-4000-8000-000000000001'$$
);

select expect_failure(
  'a rejected payment must carry a reason',
  $$update payments set status = 'rejected', reviewed_at = now()
    where receipt_no = 'HC-2609-0001'$$
);

select expect_failure(
  'two payments cannot share a receipt number',
  $$insert into payments (flat_id, amount, method, status, receipt_no, reviewed_at, reviewed_by)
    values ('cccccccc-0000-4000-8000-000000000031', 100, 'cash', 'confirmed', 'HC-2609-0001',
            now(), '11111111-1111-4111-8111-111111111111')$$
);

-- The trigger, not the application, owns the balance.
select expect_equal(
  'a confirmed payment closes its due',
  (select status::text from dues where id = 'dddddddd-0000-4000-8000-000000000001'),
  'paid'
);

select expect_equal(
  'a part payment leaves the due partially paid',
  (select status::text from dues where id = 'dddddddd-0000-4000-8000-000000000002'),
  'partially_paid'
);

select expect_equal(
  'a pending payment moves nothing',
  (select amount_paid from dues where id = 'dddddddd-0000-4000-8000-000000000003'),
  0::numeric
);

-- Reversing puts the balance back.
update payments set status = 'rejected', rejection_reason = 'Reversed: cheque bounced'
where receipt_no = 'HC-2609-0002';

select expect_equal(
  'reversing a confirmed payment restores the balance',
  (select amount_paid from dues where id = 'dddddddd-0000-4000-8000-000000000002'),
  0::numeric
);

-- Put it back so later files see the seeded state.
update payments set status = 'confirmed', rejection_reason = null
where receipt_no = 'HC-2609-0002';

-- ---------------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------------
select expect_failure(
  'expense shares cannot exceed the expense',
  $$insert into expense_shares (expense_id, flat_id, amount)
    values ('eeeeeeee-0000-4000-8000-000000000001',
            'cccccccc-0000-4000-8000-000000000061', 900)$$
);
