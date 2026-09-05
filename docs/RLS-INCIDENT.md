# The recursive policy

Worth writing down, because it is the kind of bug that passes every test and
then breaks the first real account.

## What happened

An owner created their organization, their building and twelve flats. The
database had all of it. The buildings page said "No buildings yet", and every
attempt to add another building failed with a generic error.

## The cause

Two policies, each written with a direct subquery on the other's table:

```sql
-- 0007
create policy buildings_read on buildings
  for select using (
    org_id in (select auth_org_ids())
    or id in (select building_id from flats where id in (select auth_visible_flat_ids()))
  );

create policy flats_read on flats
  for select using (
    id in (select auth_visible_flat_ids())
    or building_id in (select b.id from buildings b where b.org_id in (select auth_org_ids()))
  );
```

Postgres expands the first, meets the second, expands that, meets the first:

```
ERROR: infinite recursion detected in policy for relation "buildings"
```

## Why nothing caught it

Every SQL test ran as the table owner, and **the owner bypasses RLS**. The
seed data loaded, forty invariants passed, and none of it touched a policy.
The application tests are pure functions with no database at all.

So the whole suite was green while the product was unusable for its main
role. The gap was not in the number of tests; it was that none of them were a
signed-in user.

## The fix

`0015_fix_policy_recursion.sql`. Policies no longer reach across tables
directly — everything goes through a `security definer` helper, which runs as
the table owner and therefore does not re-enter policy evaluation.

Writing the fix surfaced a second bug, caught by the new test rather than by
a customer: the first version let building visibility grant flat visibility,
so a moderator could see every flat in their building instead of their own.
Seeing a building is an address; seeing its flats is everybody's rent. There
are now two helpers, and the distinction is in their names:

| Helper                      | Answers                                                |
| --------------------------- | ------------------------------------------------------ |
| `auth_building_ids()`       | buildings I can see at all — including via my own flat |
| `auth_org_building_ids()`   | buildings I reach through an organization              |
| `auth_admin_building_ids()` | buildings I administer                                 |
| `auth_visible_flat_ids()`   | flats I live in or manage                              |
| `auth_managed_flat_ids()`   | flats I can act on                                     |

## What stops it coming back

`supabase/tests/05_rls.sql` runs as the `authenticated` role with a real
`auth.uid()`, not as the owner:

- an owner sees their building and every flat in it
- a moderator sees the building their flat is in, and **only their own flat**
- a resident sees none of anyone else's dues, and no landlord rent at all
- a resident cannot create a building or add a flat
- an owner can add a second building and read it back immediately

That last one is the exact query that failed. It is a test now.

## The lesson worth keeping

A test suite that runs as the owner is testing the schema, not the security.
Any future policy needs a case in `05_rls.sql` — the constraints tests will
not cover it, because they never leave owner context.
