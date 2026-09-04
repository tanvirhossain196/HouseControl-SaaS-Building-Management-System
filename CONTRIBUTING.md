# Working on HouseControl

## Getting it running

```bash
npm install
cp .env.example .env.local     # the marketing pages run without any of it
npm run dev
```

For anything behind sign-in you need a Supabase project — the six steps in
`docs/AUTH.md`. Then:

```bash
npm run db:migrate
npm run db:seed
```

## The commands

|                                        |                                                                   |
| -------------------------------------- | ----------------------------------------------------------------- |
| `npm test`                             | every TypeScript suite, one process, ~3s                          |
| `npm run test:db`                      | builds the schema from empty and asserts every database invariant |
| `npm run test:all`                     | both                                                              |
| `npm run test:otp` etc.                | one suite, while you are changing that thing                      |
| `npm run typecheck` / `lint` / `build` | what CI runs                                                      |

`test:db` needs a Postgres to talk to. With a local one on a socket it finds it; otherwise
set `DATABASE_URL`.

## Where things go

Data access lives in `src/services`. Components never query Supabase, and services never
parse a request — that boundary is why the same function serves a page, a server action and
a route handler. `docs/ARCHITECTURE.md` has the whole picture.

Rules that can be expressed without a database go in `src/lib` as pure functions, and get
tested. Rent splitting, billing dates, entry codes, notification channels, CSV escaping and
the permission matrix all live there. This is not a style preference: it is why 200-odd
assertions run in three seconds with no fixtures.

## Adding a rule

Ask where it belongs, in this order:

1. **Can the database enforce it?** Then it should. A constraint cannot be bypassed by a
   new code path, a background job, or a `supabase` call written in a hurry. Rent shares,
   receipt uniqueness, one moderator per flat, notification dedupe — all constraints.
2. **Is it a decision, not a shape?** Then it is a pure function in `src/lib` with tests.
3. **Does it need data from several tables?** Then it is a service, and it should still
   lean on the constraints underneath rather than re-checking them.

The UI is the last layer and the least trusted. Hiding a button is courtesy; it secures
nothing.

## Adding a migration

Sequential filename, additive, never edited once it has run anywhere. Then:

```bash
npm run test:db
```

which rebuilds from nothing and runs the SQL suites. If the change has an invariant worth
keeping, add an assertion to `supabase/tests` in the same commit — `expect_failure` for a
write that must be refused, `expect_equal` for a value a trigger should have produced.

A test that cannot fail is worth nothing. When you add one, break the constraint locally
once and watch it go red.

## Conventions

Database is `snake_case`, TypeScript is `camelCase`, and the mapping happens in the service
layer — the wire format should not change because a column was renamed.

Comments explain _why_. The code already says what it does; the comment is for the decision
that is not visible from the code, especially where the obvious approach is wrong. There
are examples throughout: why shares are written decreases-first, why a cancelled complaint
cannot be reopened, why the reminder is weekly rather than daily.

## Before opening a pull request

```bash
npm run typecheck && npm run lint && npm run test:all && npm run build
```

CI runs the same four. `npm run test:boundaries` is part of `npm test` and is the one that
catches the mistakes typecheck cannot: a server-only import in a client component, a secret
name in browser code, `zod` sneaking back into a public page's bundle.
