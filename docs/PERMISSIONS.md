# Permissions

Five roles, one permission list, one `can()`. The UI, the server actions and the API all
ask the same function, and the RLS policies from Phase 2 enforce the same rules one layer
below.

## Roles are not a ladder

An owner is not "a moderator with more". Each role holds a different set, in a different
scope:

| Role | Scope | Held through |
| --- | --- | --- |
| `super_admin` | platform | `profiles.platform_role` |
| `admin` (owner) | one organization | `org_members` |
| `guard` | one organization | `org_members` |
| `moderator` | one flat | `flat_members` |
| `resident` | one flat | `flat_members` |

One person can hold several at once — an owner who also rents a flat elsewhere. The
dashboard they land on is decided by `primaryRole()`, highest authority first.

## The matrix

| Permission | Owner | Moderator | Resident | Guard |
| --- | :-: | :-: | :-: | :-: |
| `org.manage`, `org.billing.manage`, `org.team.manage` | ● | | | |
| `org.audit.view` | ● | | | |
| `building.create` / `edit` / `archive` | ● | | | |
| `flat.create` / `edit` / `archive` | ● | | | |
| `flat.assign_moderator` | ● | | | |
| `landlord_rent.manage` | ● | | | |
| `resident.invite` / `resident.remove` | ● | ● | | |
| `rent.assign` | ● | ● | | |
| `moderator.transfer` | ● | ● | | |
| `due.manage` | ● | ● | | |
| `expense.manage` | ● | ● | | |
| `payment.review` | ● | ● | | |
| `payment.submit` | ● | ● | ● | |
| `maintenance.create` | ● | ● | ● | ● |
| `maintenance.assign` / `resolve` | ● | ● | | |
| `visitor.log` | ● | ● | | ● |
| `visitor.preapprove` | ● | ● | ● | |
| `visitor.block` | ● | | | |
| `report.org.view` | ● | | | |
| `report.flat.view` | ● | ● | | |
| `report.self.view` | ● | ● | ● | |

`super_admin` holds everything. The guard row is the one worth reading twice: the gate,
repairs they spot, and nothing financial at all.

## Scope is half the question

```ts
can(ctx, 'payment.review', { flatId })            // moderator of that flat?
can(ctx, 'building.edit', { orgId })              // admin of that organization?
can(ctx, 'payment.review', { orgId, flatId })     // admin of the org the flat sits in
can(ctx, 'payment.review')                        // "anywhere at all?" — for menus only
```

An owner's flat-level rights only apply inside their own organization, so a flat-scoped
check grants them nothing unless `orgId` is passed too. Guessing in the permissive
direction is how access bugs happen, so `can()` refuses to guess.

## Using it

**Pages** — `requirePermission('building.edit')` redirects to `/forbidden`, which says
plainly that the page exists and the role does not match. A 404 would just generate a
support message.

**Server actions** — `assertPermission('resident.invite', { orgId })` throws a 403.

**API routes** — declare it, and `route()` checks before the handler runs:

```ts
export const POST = route(
  {
    body: createBuildingSchema,
    permission: 'building.create',
    scope: ({ body }) => ({ orgId: body.orgId }),
  },
  async ({ body, userId }) => created(await createBuilding(userId, body)),
)
```

**Components** — `<Can permission="payment.review" scope={{ flatId }}>` hides a button.
This is cosmetic. It stops people bumping into dead controls; it secures nothing, because
the server checks again and the database checks after that.

## Navigation

`src/lib/auth/navigation.ts` is one tree, filtered by permission. A resident sees three
links and an owner sees eleven, from the same source — there are not four hand-maintained
menus to drift apart.

## Route protection lives in layouts, not middleware

Middleware answers "are you signed in" only. Working out roles needs two membership
queries, and running those on every request — including static assets — would put a
database round trip in front of the whole app. Instead each protected page calls
`requirePermission()` in the server component, which is already the layer that fetches
the data. `getSession()` is request-cached, so several checks in one render cost one
query.

## Tests

```bash
npm run test:permissions
```

Fifteen checks over the cases that would be expensive to get wrong: cross-flat access,
cross-organization access, the flat-without-org case, the guard's financial isolation, and
role priority for someone holding two roles. `permissions.ts` is pure, so no database is
involved.

## Three layers, on purpose

1. **UI** hides what the role cannot use.
2. **Server** — `requirePermission` / `assertPermission` / `route({ permission })` — refuses it.
3. **Database** — RLS policies in `0007_rls.sql` refuse it again, and would refuse it even
   if a request reached Postgres without passing through this codebase at all.

When layers 2 and 3 disagree, the database wins and the person sees an error rather than
someone else's data. That is the correct failure direction.
