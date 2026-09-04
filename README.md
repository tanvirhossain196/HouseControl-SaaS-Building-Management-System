# HouseControl

> Complete control over your building, from rooftop to gate.

A building/apartment complex management platform: flats and residents, rent and dues,
shared bills, complaints, the gate register, and payments — one panel with a separate
view for the owner, each flat moderator, every resident, and the guard.

**This repository is at Phase 14 of 15.** Phases 1–6 delivered the design system, the
schema, authentication, role-based access, building and flat management, and rent
splitting. Phase 7 added the dues ledger, manual payments, the SSLCommerz gateway and PDF
receipts, Phase 8 the consent-based moderator handover, Phase 9 the gate register, Phase 10 complaints and repairs, Phase 11 notifications, email and SMS, Phase 12 reports and statements, Phase 13 search, Phase 14 performance and boundaries. Testing, docs and
deployment are next (Phase 15).

---

## Quick start

```bash
npm install
npm run dev                    # http://localhost:3000
```

The public site runs with no configuration at all: the landing page, the style guide at
`/styleguide` and the auth screens all render, and `npm test` passes. Copy
`.env.example` to `.env.local` when you have a Supabase project — the Supabase lines are
commented out there on purpose, so copying it does not half-configure anything.

The marketing pages run without any environment variables. Anything that touches the
database needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`.

Set up the database:

```bash
npm run db:migrate   # applies supabase/migrations in order
npm run db:seed      # one building, four flats, a September ledger
```

| Script                                  | What it does                                                               |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev` / `build` / `start`       | Next.js                                                                    |
| `npm run lint` / `format` / `typecheck` | ESLint, Prettier, `tsc --noEmit`                                           |
| `npm test`                              | 203 checks across thirteen suites, including architectural boundary checks |
| `npm run db:migrate` / `db:seed`        | apply migrations, load sample data                                         |
| `npm run db:types`                      | regenerate `src/types/database.ts` from the live schema                    |

Requires Node 18.18+ (Node 20 or 22 recommended).

## Routes

| Route                                                 | What it is                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `/`                                                   | Landing page — hero building panel, features, how it works, pricing, testimonials, FAQ |
| `/about`                                              | Who this is for and what we are careful about                                          |
| `/contact`                                            | Validated contact form (client-side only until Phase 2)                                |
| `/faq`                                                | Full FAQ with `FAQPage` structured data                                                |
| `/privacy`, `/terms`, `/cookies`                      | Legal pages — placeholder copy, have a lawyer review before launch                     |
| `/styleguide`                                         | Every component and token in one page. `noindex`, not linked from the site             |
| `/sign-in`, `/sign-up`                                | Google, email + password, or magic link                                                |
| `/forgot-password`, `/reset-password`, `/check-email` | Password recovery                                                                      |
| `/auth/callback`, `/auth/error`                       | Where every verification link lands                                                    |
| `/dashboard`                                          | One route, four screens — owner, moderator, resident, or an empty state                |
| `/admin`                                              | Owner-only: buildings, with unit and occupancy counts                                  |
| `/admin/buildings/[id]`                               | One building: unit grid, flats table, bulk unit generation                             |
| `/admin/flats`                                        | Every flat across the organization, searchable                                         |
| `/admin/residents`                                    | Every resident in the organization, searchable                                         |
| `/flats`                                              | The flats you live in or moderate                                                      |
| `/flats/[id]`                                         | One flat: residents, rent split, invites, moderator, ledger                            |
| `/dues`                                               | A resident's own charges, with a way to record each payment                            |
| `/payments`                                           | The review queue: confirm, reject or reverse                                           |
| `/payments/return`                                    | Where the gateway sends the resident back to                                           |
| `/api/payments/webhook/sslcommerz`                    | IPN endpoint — signature-verified, public by necessity                                 |
| `/api/receipts/[id]`                                  | PDF receipt for a confirmed payment                                                    |
| `/admin/team`, `/admin/audit`                         | Invites and the audit log                                                              |
| `/gate`                                               | Guard-only: log arrivals and exits, check codes, see the blocklist                     |
| `/visitors`                                           | A resident's own visitors, and pre-approval codes for guests                           |
| `/maintenance`                                        | Complaints and repairs, filtered by what the role can see                              |
| `/maintenance/[id]`                                   | One request: its timeline, notes, and the work done                                    |
| `/search`                                             | Everything the role can see, in one place                                              |
| `/api/search`                                         | Backs the header search box                                                            |
| `/reports`                                            | Collection, arrears ageing, expenses, who owes what                                    |
| `/api/reports/[kind]`                                 | Ledger, arrears and expense CSVs                                                       |
| `/api/statements/[flatId]`                            | A month's statement for one flat, as a PDF                                             |
| `/settings/notifications`                             | What each person gets, and on which channel                                            |
| `/api/cron/reminders`                                 | The daily reminder job, behind a shared secret                                         |
| `/platform`                                           | Platform staff only                                                                    |
| `/invite/[token]`                                     | Accept an invitation into a building                                                   |
| `/forbidden`                                          | Signed in, wrong role                                                                  |
| `/onboarding/phone`                                   | Mobile OTP, required before moderating a flat                                          |
| `/sitemap.xml`, `/robots.txt`                         | Generated from `src/lib/site.ts`                                                       |
| `/api/health`                                         | Liveness probe, no auth                                                                |
| `/api/buildings`                                      | Reference endpoint showing the validate → service → envelope pattern                   |
| 404 / error / loading                                 | `not-found.tsx`, `error.tsx`, `loading.tsx`                                            |

## Project structure

```
src/
  app/
    (marketing)/       public site — nav, footer, back-to-top
    (auth)/            sign-in, sign-up, recovery — no nav, one task per page
    (app)/             everything behind sign-in
    api/               route handlers
    auth/callback/     one-time code exchange
  components/
    ui/                button, badge, card, input/field, modal, tabs, table,
                       dropdown, tooltip, avatar, skeleton
    auth/              sign-in/up forms, password field, Google button, phone OTP
    dashboard/         the owner, moderator and resident dashboards
    property/          building and flat forms, bulk generator, unit grid, flats table
    residents/         resident list, rent-split editor, invites, directory
    money/             pay form, review queue, bill-a-month, ledger views
    transfers/         handover flow, incoming offers, history and undo
    gate/              guard console, pre-approval, visit log
    maintenance/       report form, request list, timeline and actions
    notifications/     the bell, and the preferences form
    reports/           twelve-month bars and the arrears ageing table
    search/            the ⌘K dialog
    layout/            header (with mobile menu), footer, logo, theme toggle, back-to-top
    marketing/         hero, building panel, features, steps, pricing, FAQ, testimonials, CTA
    providers/         theme (next-themes) and toast context
  content/             page copy and sample building data — edit here, not in components
  hooks/               shared client hooks
  lib/
    api/               route() wrapper and the response envelope
    auth/              server actions, session helpers, the permission matrix,
                       guards and the navigation tree
    supabase/          browser, server and service-role clients
    validation/        Zod schemas shared by forms and endpoints
    env.ts             environment variables, validated by Zod
    errors.ts          AppError and Postgres error mapping
    units.ts           unit numbering and floor labels (pure, tested)
    rent-split.ts      splitting rent between residents (pure, tested)
    billing.ts         periods, due dates, receipt numbers (pure, tested)
    receipt.ts         receipt model and PDF-safe text (pure, tested)
    otp.ts             handover codes and their timing rules (pure, tested)
    gate.ts            entry codes, phone matching, visit durations (pure, tested)
    maintenance.ts     references, response targets, status machine (pure, tested)
    notifications.ts   event catalogue, channels, quiet hours, dedupe (pure, tested)
    reports.ts         ageing, statements, CSV escaping (pure, tested)
    search.ts          query parsing, LIKE escaping, ranking, paging (pure, tested)
    messaging/         email and SMS providers, both no-ops without keys
    gateway/           SSLCommerz adapter and IPN signature verification
    rate-limit.ts      fixed-window limiter used by middleware
  services/            all database access, one file per domain
  types/               database types and domain aliases
  middleware.ts        CORS, rate limiting, CSRF origin check, route protection
supabase/
  migrations/          the schema, applied in filename order
  seed.sql             sample building and ledger
docs/                  ARCHITECTURE.md, DATABASE.md, AUTH.md, PERMISSIONS.md,
                       PAYMENTS.md, HANDOVER.md, GATE.md, MAINTENANCE.md,
                       NOTIFICATIONS.md, REPORTS.md, SEARCH.md, PERFORMANCE.md
tests/                 permission, unit-numbering and rent-split checks (no database)
```

Copy and sample data live in `src/content/`, so text changes never require touching a
component. Database access lives in `src/services/`, so no component ever queries
Supabase directly. The two documents in `docs/` explain why both boundaries exist.

## Design system

Tokens are CSS custom properties in `src/app/globals.css` and are exposed to Tailwind in
`tailwind.config.ts`. Both themes are defined; `class` strategy, system default.

| Token                                 | Light value                                   | Role                                     |
| ------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| `paper` / `surface` / `raised`        | `#F6F7FB` / `#FFFFFF` / `#F0F2F8`             | page, cards, wells                       |
| `ink` / `muted` / `line`              | `#131A2B` / `#59627A` / `#E0E4EE`             | text, secondary text, borders            |
| `primary`                             | `#2F4BD8`                                     | actions, authority                       |
| `accent`                              | `#D69108`                                     | alerts, upsell, the lit unit in the logo |
| `paid` / `due` / `overdue` / `vacant` | `#0F7A57` / `#B8710A` / `#C2352C` / `#969EB2` | rent status — data, not decoration       |

- **Type:** Inter for everything, JetBrains Mono for numerals — flat numbers, amounts, times.
  Tabular figures via the `.tabular` class so columns line up.
- **Spacing:** 8px grid; `py-18` / `py-26` are the section rhythms.
- **Radius encodes hierarchy:** `tile` 5px (unit tiles) → `control` 9px (buttons, inputs)
  → `panel` 14px (cards) → `sheet` 20px (dialogs, feature blocks).
- **Motion:** one orchestrated moment — the collection meter fills on load. Everything else
  responds to a user action. `prefers-reduced-motion` is respected globally.

Fonts load from Google Fonts via a `<link>` in `src/app/layout.tsx`. To self-host, swap in
`next/font/google` (it needs network access at build time).

## Accessibility and SEO baked in

Skip-to-content link, visible focus rings on every interactive element, focus trap and
`Escape` handling in the modal, arrow-key navigation in tabs and the dropdown, labelled
form fields with `aria-invalid` and error text tied by `aria-describedby`, live regions on
toasts. Per-page title/description/canonical/OG tags via `pageMetadata()`, plus
`SoftwareApplication` and `FAQPage` JSON-LD.

Security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`) are set in `next.config.mjs`.

## Data model in one paragraph

An **organization** owns **buildings**, which contain **flats**. Roles live in two places:
`org_members` (admin, guard) and `flat_members` (moderator, resident, with that person's
rent share). Every obligation is a **due** — one row per person, per source, per month —
and a **payment** only moves a balance once it is confirmed, through a database trigger
that owns `dues.amount_paid`. Everything else hangs off those: expenses split into
`expense_shares`, visitors and maintenance requests on the building, and an append-only
`audit_logs` table nobody can edit. See `docs/DATABASE.md` for the ERD and the rules the
database enforces on its own.

## Authentication

Google OAuth, email + password with a mandatory confirmation link, or a magic link.
An unverified account can see nothing. Sessions live in httpOnly, SameSite=Lax cookies —
never `localStorage`. Protected routes are guarded twice: once in middleware, once in the
`(app)` layout. See `docs/AUTH.md` for the Supabase dashboard settings you need and the
security decisions behind each flow.

## Roles

Five roles — platform admin, building owner, flat moderator, resident and guard — each
scoped to an organization or a single flat rather than stacked in a ladder. One permission
list drives the sidebar, the server guards and the API, and the RLS policies enforce the
same rules underneath. An owner who also rents a flat somewhere else holds both roles at
once and lands on the owner dashboard. See `docs/PERMISSIONS.md` for the matrix.

## Tests

```bash
npm test          # 203 assertions, no database, ~3s
npm run test:db   # schema built from nothing, 40 invariants, needs a Postgres
```

The TypeScript suites cover the rules that can be decided without data: the permission
matrix, rent splitting to the paisa, billing dates across leap years, gateway signature
forgeries, handover code lockouts, entry codes, notification channels and quiet hours, CSV
escaping, search escaping and paging. They are pure functions, so there are no fixtures and
no database to stand up.

`test:db` builds the schema from an empty database, loads the seed, and asserts what the
database refuses on its own: rent shares over the flat total, two moderators on one flat, a
due paid past its amount, a replayed webhook, a reminder sent twice in a day. Building from
empty every time is what catches a migration that only worked because of what was already
in somebody's local database.

`npm run test:boundaries`, part of `npm test`, walks the source tree for the mistakes that
pass typecheck and lint: a client component importing a server-only module, `zod` in a
public page's bundle, a secret name in browser code, an unguarded write handler.

## Known limitations

Honest list, because the next person needs it more than a feature tour.

- **Not production-tested.** No real building has run a month on this. The gateway has only
  been exercised in SSLCommerz sandbox.
- **Legal copy is placeholder text.** Privacy, terms and cookies need a lawyer before
  launch.
- **`src/types/database.ts` is hand-maintained.** Once a Supabase project exists, switch to
  `npm run db:types` and stop editing it alongside migrations.
- **Rate limiting is in-memory**, so it counts per instance. Move it to Upstash Redis before
  running more than one; `src/lib/rate-limit.ts` keeps its interface.
- **PDF receipts print Bangla names only** if a Bangla font is placed at
  `public/fonts/NotoSansBengali-Regular.ttf`. Without it a Bangla name becomes a marker
  rather than a broken glyph.
- **Photos are URLs, not uploads.** Complaints and visitors accept a URL; there is no
  storage bucket yet.
- **Push notifications are in the catalogue with no transport.** They resolve to nothing
  until a mobile app exists.
- **Invite links are copied from the screen** unless `RESEND_API_KEY` is set.
- **The landing page uses sample data** from `src/content/building.ts`, on purpose.

## What I would do next

1. **Run one real building for a month** before adding anything. Every remaining question —
   whether the reminder schedule is right, whether guards will use the gate screen, whether
   moderators confirm payments promptly — is answered by that and by nothing else.
2. **Storage for photos**, which complaints and the gate both want and neither has.
3. **Redis for rate limiting**, before the second instance rather than after.
4. **A second gateway.** bKash direct would remove a fee layer, and the adapter boundary in
   `src/lib/gateway` was drawn for it.
5. **Bengali throughout.** The schema carries `profiles.locale` and nothing reads it yet.
   Half the residents in the target market would rather use Bangla, and the product speaks
   to them entirely in English.

## Documentation

|                         |                                                 |
| ----------------------- | ----------------------------------------------- |
| `docs/ARCHITECTURE.md`  | layers, the request path, naming                |
| `docs/DATABASE.md`      | the schema, the ERD, what the database enforces |
| `docs/AUTH.md`          | the four sign-in paths and the Supabase setup   |
| `docs/PERMISSIONS.md`   | the role matrix and where it is checked         |
| `docs/PAYMENTS.md`      | manual and gateway flows, webhook trust model   |
| `docs/HANDOVER.md`      | consented moderator transfer                    |
| `docs/GATE.md`          | the visitor register and entry codes            |
| `docs/MAINTENANCE.md`   | complaints, the state machine, response targets |
| `docs/NOTIFICATIONS.md` | channels, quiet hours, deduplication            |
| `docs/REPORTS.md`       | statements, ageing, CSV and PDF exports         |
| `docs/SEARCH.md`        | parsing, escaping, ranking, paging              |
| `docs/PERFORMANCE.md`   | what was measured and what changed              |
| `docs/DEPLOYMENT.md`    | environment, migrations, rollback, monitoring   |
| `docs/RUNBOOK.md`       | what to do when something is wrong              |
| `CONTRIBUTING.md`       | how to work on it, and where a new rule belongs |
