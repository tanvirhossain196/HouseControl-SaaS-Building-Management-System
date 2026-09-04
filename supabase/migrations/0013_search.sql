-- 0013 — search
--
-- Phase 2 put trigram indexes on the three columns that were obviously going
-- to be searched: building names, unit numbers, visitor names. Building the
-- search screen turned up the rest — people look for a resident by name, a
-- repair by its title, and a payment by the reference they wrote on the
-- bKash message.
--
-- Trigram rather than full text: these are names and short codes, and people
-- type fragments of them. `%shir%` finds Shirin; a tsvector would not.

create index if not exists profiles_name_trgm
  on profiles using gin (full_name gin_trgm_ops);

create index if not exists profiles_phone_idx
  on profiles (phone)
  where phone is not null;

create index if not exists maintenance_title_trgm
  on maintenance_requests using gin (title gin_trgm_ops);

create index if not exists maintenance_reference_idx
  on maintenance_requests (reference);

-- The two strings someone actually has in front of them when they come
-- looking for a payment: what the gateway or the bank called it, and what we
-- called it on the receipt.
create index if not exists payments_reference_trgm
  on payments using gin (reference gin_trgm_ops);

create index if not exists payments_receipt_idx
  on payments (receipt_no)
  where receipt_no is not null;

-- Sorting a long list by the columns the screens actually offer. Without
-- these, "newest first" over a year of payments is a sort of the whole table.
create index if not exists payments_created_idx on payments (created_at desc);
create index if not exists dues_created_idx on dues (created_at desc);
create index if not exists maintenance_created_idx on maintenance_requests (created_at desc);

-- Postgres will not use a trigram index for a pattern shorter than three
-- characters, so a one- or two-character query falls back to a scan. The
-- application refuses those before they reach the database instead; see
-- `isSearchable` in src/lib/search.ts.
