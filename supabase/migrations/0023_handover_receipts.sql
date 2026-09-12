-- ---------------------------------------------------------------------------
-- Receipts for handovers.
--
-- A moderator who hands over the month's rent has nothing to show for it
-- afterwards beyond a row that says "Settled". The first hop already issues a
-- receipt number when a resident's payment is confirmed; this gives the second
-- hop the same, so both ends of the chain hold a document.
--
-- The series is separate from the rent one: HR- rather than HC-. Two ledgers
-- sharing a numbering sequence would make it impossible to tell, from a number
-- alone, whether it refers to a tenant's rent or a moderator's handover.
-- ---------------------------------------------------------------------------

alter table remittance_payments
  add column if not exists receipt_no text unique;

-- A confirmed handover must carry a receipt; anything else must not.
alter table remittance_payments
  drop constraint if exists remittance_payment_receipt_on_confirm;

alter table remittance_payments
  add constraint remittance_payment_receipt_on_confirm check (
    (status = 'confirmed') = (receipt_no is not null)
  );

create index if not exists remittance_payments_receipt_idx
  on remittance_payments (receipt_no) where receipt_no is not null;