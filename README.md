# HouseControl

> Complete control over your building, from rooftop to gate.

A building/apartment complex management platform: flats and residents, rent and dues,
shared bills, complaints, the gate register, and payments — one panel with a separate
view for the owner, each flat moderator, every resident, and the guard.

**This repository is at Phase 2 of 15.** Phase 1 delivered the design system and public
pages; Phase 2 adds the project architecture, the PostgreSQL schema, and the API layer.
Auth is next (Phase 3), then role-based dashboards (Phase 4).

---

## Quick start

```bash
npm install
cp .env.example .env.local     # add your Supabase URL and keys
npm run dev                    # http://localhost:3000
```

The marketing pages run without any environment variables. Anything that touches the
database needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`.

Set up the database:

```bash
npm run db:migrate   # applies supabase/migrations in order
npm run db:seed      # one building, four flats, a September ledger
```

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `format` / `typecheck` | ESLint, Prettier, `tsc --noEmit` |
| `npm run db:migrate` / `db:seed` | apply migrations, load sample data |
| `npm run db:types` | regenerate `src/types/database.ts` from the live schema |

Requires Node 18.18+ (Node 20 or 22 recommended).

## Routes in this phase

| Route | What it is |
| --- | --- |
| `/` | Landing page — hero building panel, features, how it works, pricing, testimonials, FAQ |
| `/about` | Who this is for and what we are careful about |
| `/contact` | Validated contact form (client-side only until Phase 2) |
| `/faq` | Full FAQ with `FAQPage` structured data |
| `/privacy`, `/terms`, `/cookies` | Legal pages — placeholder copy, have a lawyer review before launch |
| `/styleguide` | Every component and token in one page. `noindex`, not linked from the site |
| `/sitemap.xml`, `/robots.txt` | Generated from `src/lib/site.ts` |
| `/api/health` | Liveness probe, no auth |
| `/api/buildings` | Reference endpoint showing the validate → service → envelope pattern |
| 404 / error / loading | `not-found.tsx`, `error.tsx`, `loading.tsx` |

## Project structure

```
src/
  app/                 routes, API handlers, metadata, sitemap, error + loading states
  components/
    ui/                button, badge, card, input/field, modal, tabs, table,
                       dropdown, tooltip, avatar, skeleton
    layout/            header (with mobile menu), footer, logo, theme toggle, back-to-top
    marketing/         hero, building panel, features, steps, pricing, FAQ, testimonials, CTA
    providers/         theme (next-themes) and toast context
  content/             page copy and sample building data — edit here, not in components
  hooks/               shared client hooks
  lib/
    api/               route() wrapper and the response envelope
    supabase/          browser, server and service-role clients
    validation/        Zod schemas shared by forms and endpoints
    env.ts             environment variables, validated by Zod
    errors.ts          AppError and Postgres error mapping
    rate-limit.ts      fixed-window limiter used by middleware
  services/            all database access, one file per domain
  types/               database types and domain aliases
  middleware.ts        CORS, rate limiting
supabase/
  migrations/          the schema, applied in filename order
  seed.sql             sample building and ledger
docs/                  ARCHITECTURE.md and DATABASE.md
```

Copy and sample data live in `src/content/`, so text changes never require touching a
component. Database access lives in `src/services/`, so no component ever queries
Supabase directly. The two documents in `docs/` explain why both boundaries exist.

## Design system

Tokens are CSS custom properties in `src/app/globals.css` and are exposed to Tailwind in
`tailwind.config.ts`. Both themes are defined; `class` strategy, system default.

| Token | Light value | Role |
| --- | --- | --- |
| `paper` / `surface` / `raised` | `#F6F7FB` / `#FFFFFF` / `#F0F2F8` | page, cards, wells |
| `ink` / `muted` / `line` | `#131A2B` / `#59627A` / `#E0E4EE` | text, secondary text, borders |
| `primary` | `#2F4BD8` | actions, authority |
| `accent` | `#D69108` | alerts, upsell, the lit unit in the logo |
| `paid` / `due` / `overdue` / `vacant` | `#0F7A57` / `#B8710A` / `#C2352C` / `#969EB2` | rent status — data, not decoration |

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

## Known limitations at this phase

- No auth yet, so API routes 401 until Phase 3 wires Supabase Auth.
- `src/types/database.ts` is hand-maintained until a Supabase project exists; keep it in
  step with any migration, then switch to `npm run db:types`.
- Rate limiting is in-memory and counts per instance — replace with Upstash Redis before
  running more than one.
- The contact form validates but does not send; the landing page uses sample data from
  `src/content/building.ts`.
- Legal copy is placeholder text.

## What comes next

Phase 3 (verified-only auth) → Phase 4 (RBAC and role dashboards) → Phase 5–6 (buildings, flats, residents) →
Phase 7 (payments) → … → Phase 15 (testing, docs, deploy).

Two things worth deciding before Phase 4: the guard/gate role from Phase 9 should be part
of the role model from the start, and Phase 7 is large enough to split into "manual
payments + dues ledger" and "gateway integration".
