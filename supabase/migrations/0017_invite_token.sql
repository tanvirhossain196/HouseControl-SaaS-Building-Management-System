-- 0017 — persist invite tokens for reusable member-specific links

-- Existing invite rows may already exist, so add the column as nullable first.
alter table invites
  add column if not exists token text;

-- Backfill is intentionally not possible for old invites because only their
-- SHA-256 hashes were stored. Old links must be recreated if they are needed.

create unique index if not exists invites_token_unique
  on invites (token);

comment on column invites.token is
  'Raw invite token used to reconstruct the member-specific invite URL.';
