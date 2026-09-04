-- 0014 — indexes for the two screens that read across many flats at once
--
-- Found with EXPLAIN rather than by guessing. Most of the hot queries were
-- already covered by the indexes from 0006; these two were not, and both are
-- on the path an owner takes every time they open the app.

-- "What is outstanding across these twenty flats" — the all-flats table and
-- the owner dashboard. Without this, Postgres reaches for `dues_overdue_idx`,
-- which is ordered by due date, and filters every open charge in the whole
-- organization by flat afterwards.
create index if not exists dues_flat_open_idx
  on dues (flat_id)
  where status in ('open', 'partially_paid');

-- "Who lives in these twenty flats" — the same screens. The existing index is
-- keyed by user, so a query keyed by flat scanned it and filtered.
create index if not exists flat_members_flat_active_idx
  on flat_members (flat_id)
  where status = 'active';

-- The bell polls this on every page load. The partial index from 0006 covers
-- it, but only if the planner knows the table's shape; a fresh deployment has
-- no statistics at all until something runs ANALYZE.
analyze dues;
analyze flat_members;
analyze payments;
analyze notifications;
analyze maintenance_requests;
