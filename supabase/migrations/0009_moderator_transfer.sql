-- 0009 — moderator handover: OTP, attempts, rollback window
--
-- The handover is the one action where a person gives away authority over
-- other people's money. It needs more than a confirm dialog: proof that the
-- outgoing moderator is really the one asking, consent from the person
-- receiving it, and a window in which the owner can undo it.

alter table moderator_transfers
  add column if not exists otp_hash text,
  add column if not exists otp_sent_at timestamptz,
  add column if not exists otp_expires_at timestamptz,
  add column if not exists otp_attempts smallint not null default 0,
  add column if not exists rollback_deadline timestamptz,
  add column if not exists initiated_by uuid references profiles (id) on delete set null,
  add column if not exists note text;

comment on column moderator_transfers.otp_hash is
  'SHA-256 of the code and a server-side secret. The code itself is never stored.';
comment on column moderator_transfers.rollback_deadline is
  'Until when the owner may undo an accepted handover. Set on acceptance.';

-- Five wrong codes and the transfer is dead; a new one has to be started.
alter table moderator_transfers
  add constraint transfer_attempts_capped check (otp_attempts between 0 and 5);

-- A transfer cannot be accepted after it has expired.
alter table moderator_transfers
  add constraint transfer_accept_before_expiry check (
    status <> 'accepted' or responded_at is null or responded_at <= expires_at
  );

create index if not exists moderator_transfers_to_user_idx
  on moderator_transfers (to_user_id, status)
  where status = 'pending';

create index if not exists moderator_transfers_rollback_idx
  on moderator_transfers (rollback_deadline)
  where status = 'accepted';

-- The incoming person must be able to see the offer before accepting it, and
-- the owner must be able to see and undo one afterwards. The existing policy
-- covered the two parties and the flat's manager; this replaces it with one
-- that also covers the organization's admins explicitly.
drop policy if exists transfers_read on moderator_transfers;

create policy transfers_read on moderator_transfers
  for select using (
    from_user_id = auth.uid()
    or to_user_id = auth.uid()
    or flat_id in (select auth_managed_flat_ids())
  );

drop policy if exists transfers_write on moderator_transfers;

-- Writes go through the service role: the role swap and the transfer row have
-- to move together, and a resident must not be able to edit their own offer.
