# Architecture

## The one rule

Data flows in one direction, and every layer has exactly one job:

```
component  →  server action / route handler  →  service  →  Supabase  →  Postgres + RLS
   UI            auth + validation            business      typed client    last lock
```

A component never queries Supabase directly, and a service never parses a request.
If a rule matters (rent shares must add up, only one moderator per flat), it is
enforced in the database as well as in the form, because forms can be bypassed.

## Layers

**`src/app`** — routes. Pages are Server Components by default; `'use client'` only
where there is state or an event handler. Route handlers under `src/app/api` are thin:
they call `route()` and hand off to a service.

**`src/lib/api`** — `route()` wraps every handler with an auth check, Zod validation of
body and query, and a single `catch` that converts anything thrown into the standard
error envelope. `response.ts` holds `ok`, `created`, `paged`, `fail` so response shapes
never drift between endpoints.

**`src/lib/validation`** — Zod schemas per domain, shared by the client form and the
server. One schema, validated twice: once for a good error message, once because the
client cannot be trusted.

**`src/services`** — all database access, one file per domain. Services take a `userId`
and plain input, and return domain objects. This is also where quota checks, audit
writes and cross-table work live.

**`src/lib/supabase`** — three clients, and the difference matters:

| Client | Used in | Runs as | RLS |
| --- | --- | --- | --- |
| `client.ts` | client components | the signed-in user | enforced |
| `server.ts` | server components, actions, route handlers | the signed-in user | enforced |
| `admin.ts` | webhooks, cron jobs, audit writes | service role | **bypassed** |

`admin.ts` imports `server-only`, so importing it from a client component fails the
build rather than leaking the service key.

**`src/types`** — `database.ts` mirrors the SQL schema and is the source of truth for
every enum in the app. Regenerate it with `npm run db:types` once a Supabase project
exists; don't hand-edit both.

## Request path

```
request
  → middleware.ts         CORS check, rate limit, security headers
  → route()               requireUser(), Zod parse of body + query
  → service               permission + quota checks, audit log
  → Supabase (anon key)   RLS filters every row by role
  → response.ts           { ok: true, data } or { ok: false, error }
```

Errors are never thrown at the client. `toAppError()` maps Postgres codes
(`23505` unique violation, `42501` RLS denial, `23514` check violation) onto messages a
person can act on, and anything unrecognised becomes a generic 500 with the detail
logged server-side.

## Response envelope

Success:

```json
{ "ok": true, "data": { "id": "…", "name": "Nasreen Tower" } }
```

Failure:

```json
{
  "ok": false,
  "error": {
    "code": "validation_failed",
    "message": "Some fields need fixing.",
    "fields": { "monthlyRent": ["Enter an amount."] }
  }
}
```

`code` is for the client to branch on; `message` is for a person to read; `fields` maps
one-to-one onto form field names.

## Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Database tables and columns | `snake_case`, plural tables | `flat_members.rent_share` |
| TypeScript | `camelCase`, `PascalCase` for types | `monthlyRent`, `FlatRow` |
| Files | `kebab-case`, `*.service.ts` for services | `buildings.service.ts` |
| Zod schemas | `<verb><Noun>Schema` | `createFlatSchema` |
| Audit actions | `entity.verb`, past tense | `payment.confirmed` |

The API speaks `camelCase`; services do the mapping to `snake_case` columns. That
boundary is deliberate — the wire format should not change because a column was renamed.

## Security posture in this phase

- CORS is an allowlist read from `ALLOWED_ORIGINS`; unlisted origins get a 403.
- Rate limiting is per IP and per route prefix, with stricter limits on auth, payments
  and uploads. The in-memory store is per instance — replace with Upstash Redis before
  running more than one instance.
- Security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`) are set in `next.config.mjs`.
- Environment variables are validated by Zod at first use, so a missing key fails with
  the key's name instead of a runtime `undefined`.
- RLS is on for every table. A table with RLS enabled and no matching policy denies
  everything, which is the safe default.

## What Phase 3 changes here

Middleware gains a Supabase session refresh and redirects unauthenticated users away
from `/dashboard`. `route()` gains a `roles` option that checks org and flat membership
before the handler runs. Nothing else in this structure moves.
