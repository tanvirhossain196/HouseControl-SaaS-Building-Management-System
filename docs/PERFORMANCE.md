# Performance and boundaries

Phase 14 measured rather than guessed. Three things were actually wrong; the rest of what
looked slow was already fine, and saying so is part of the work.

## What changed

| | Before | After |
| --- | --- | --- |
| `/contact` first load | 112 kB | 98.5 kB |
| `/admin/flats` queries, 6 buildings | 19 | 4 |
| Screens with a loading state | root only | every screen behind sign-in |

**Zod was shipping to the browser.** The marketing contact form validated in the client,
which put 14 kB of schema library on a public page to check an email address. Validation
moved to a server action — the server has to check anyway, and `type="email"` catches the
common mistake for free. The page went from 17.4 kB to 4.4 kB of its own JavaScript.

**The all-flats screen was an N+1.** It called a three-query helper once per building, so
an owner with six buildings paid for nineteen round trips to draw one table.
`listOrgFlatsWithCounts` does it in four regardless of how many buildings there are, and
groups members with a `Map` rather than filtering the array per flat, which was quadratic.

**Loading states were missing.** Every screen behind sign-in reads from Postgres, so on a
weak signal at the gate people watched a blank frame. `(app)/loading.tsx` shows the shape
of the page — heading, four stats, a table — so nothing jumps when the data lands, and
`/reports` has its own because it aggregates across every flat.

An error boundary now sits in the `(app)` segment rather than only at the root, so a
failure keeps the header, the sidebar and the session: whatever broke, the person is still
signed in and can go somewhere else.

## Indexes: measured, not guessed

`EXPLAIN` on the eight hottest queries found six already served by the indexes from Phase 2
and Phase 6 — the dues board, the review queue, who is inside the building, the held
notifications the cron job releases. Two were not, and both are on the path an owner takes
every time they open the app:

```sql
create index dues_flat_open_idx on dues (flat_id)
  where status in ('open', 'partially_paid');

create index flat_members_flat_active_idx on flat_members (flat_id)
  where status = 'active';
```

Without the first, Postgres reached for `dues_overdue_idx` — ordered by due date — and
filtered every open charge in the organization by flat afterwards.

On seed data the planner ignores both, correctly: at three rows a sequential scan wins.
Loading 5,003 charges across 200 flats and running `ANALYZE` shows the new index being
chosen:

```
Bitmap Index Scan on dues_flat_open_idx
  Index Cond: (flat_id = flats.id)
```

The migration ends with `ANALYZE` on the five busiest tables, because a fresh deployment
has no statistics at all and the planner guesses badly until something collects them.

## Caching: deliberately none

Nothing authenticated is cached. Every screen behind sign-in is per-user by construction —
RLS returns different rows to an owner and a resident for the same query — and a cache
keyed on the route rather than the person is exactly how one flat's ledger ends up on
another's screen. The marketing pages are static and prerendered; that is where the caching
belongs.

## `npm run test:boundaries`

Twelve checks that walk the source tree. They catch the mistakes that pass typecheck, pass
lint, and then either break the build confusingly or ship something that should have stayed
on the server:

- No client component imports a server-only module, a `node:` builtin, or a service at
  runtime. This is the Phase 8 bug, where a rollback button imported a timing helper from
  a module that touches `node:crypto` and the build failed with a stack trace about a Node
  builtin rather than about the import.
- The service-role Supabase client is unreachable from client code.
- `zod` and `pdf-lib` do not appear in the browser bundle — the check that keeps the
  contact-form fix from silently regressing.
- Nothing touches `localStorage` or `sessionStorage`. Sessions live in httpOnly cookies; a
  token in local storage is readable by any XSS bug on the page.
- No secret name appears in client code, and every `process.env` read there is
  `NEXT_PUBLIC_` or `NODE_ENV`.
- `dangerouslySetInnerHTML` appears only in the two JSON-LD blocks it is allowed in.
- Every route handler that writes has a visible guard, or — for the gateway webhook, which
  has no session by definition — verifies a signature and says so.

`import type` is ignored throughout, since it is erased at build time and costs nothing.

## Still open

Images are `<img>` with explicit dimensions rather than `next/image`; there are no uploads
yet, so there is nothing to optimise until the storage work lands. Push notifications are
declared in the catalogue but have no transport. Neither is a performance problem today.
