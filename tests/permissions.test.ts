/**
 * Permission matrix tests.
 *
 * `permissions.ts` is pure, so it can be checked without a database, a server
 * or a browser. These are the cases that would be expensive to get wrong.
 *
 *   npx tsx tests/permissions.test.ts
 */
import assert from 'node:assert/strict'
import {
  can,
  grantedPermissions,
  primaryRole,
  rolePermissions,
  type PermissionContext,
} from '../src/lib/auth/permissions'

const ORG_A = 'org-a'
const ORG_B = 'org-b'
const FLAT_1 = 'flat-1'
const FLAT_2 = 'flat-2'

const empty: PermissionContext = { isSuperAdmin: false, orgs: [], flats: [] }

const owner: PermissionContext = {
  ...empty,
  orgs: [{ orgId: ORG_A, role: 'admin' }],
}

const moderator: PermissionContext = {
  ...empty,
  flats: [{ flatId: FLAT_1, role: 'moderator' }],
}

const resident: PermissionContext = {
  ...empty,
  flats: [{ flatId: FLAT_1, role: 'resident' }],
}

const guard: PermissionContext = {
  ...empty,
  orgs: [{ orgId: ORG_A, role: 'guard' }],
}

/** An owner who also rents a flat in someone else's building. */
const ownerAndTenant: PermissionContext = {
  isSuperAdmin: false,
  orgs: [{ orgId: ORG_A, role: 'admin' }],
  flats: [{ flatId: FLAT_2, role: 'resident' }],
}

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('permission matrix')

check('a resident cannot review payments', () => {
  assert.equal(can(resident, 'payment.review', { flatId: FLAT_1 }), false)
})

check('a moderator can review payments in their own flat', () => {
  assert.equal(can(moderator, 'payment.review', { flatId: FLAT_1 }), true)
})

check('a moderator cannot review payments in another flat', () => {
  assert.equal(can(moderator, 'payment.review', { flatId: FLAT_2 }), false)
})

check('a moderator cannot create buildings', () => {
  assert.equal(can(moderator, 'building.create'), false)
})

check('an owner can manage any flat inside their own organization', () => {
  assert.equal(can(owner, 'payment.review', { orgId: ORG_A, flatId: FLAT_2 }), true)
})

check('an owner has no rights in another organization', () => {
  assert.equal(can(owner, 'building.edit', { orgId: ORG_B }), false)
})

check('a flat-scoped question without an org does not grant admin rights', () => {
  // Without orgId there is no way to know the flat belongs to this owner.
  assert.equal(can(owner, 'payment.review', { flatId: FLAT_2 }), false)
})

check('a guard can log visitors but never touch money', () => {
  assert.equal(can(guard, 'visitor.log', { orgId: ORG_A }), true)
  assert.equal(can(guard, 'payment.review', { orgId: ORG_A }), false)
  assert.equal(can(guard, 'due.manage', { orgId: ORG_A }), false)
  assert.equal(can(guard, 'report.flat.view', { orgId: ORG_A }), false)
})

check('a resident sees only their own reports', () => {
  assert.equal(can(resident, 'report.self.view', { flatId: FLAT_1 }), true)
  assert.equal(can(resident, 'report.flat.view', { flatId: FLAT_1 }), false)
  assert.equal(can(resident, 'report.org.view'), false)
})

check('a resident cannot remove other residents', () => {
  assert.equal(can(resident, 'resident.remove', { flatId: FLAT_1 }), false)
  assert.equal(can(moderator, 'resident.remove', { flatId: FLAT_1 }), true)
})

check('landlord rent is owner-only', () => {
  assert.equal(can(owner, 'landlord_rent.manage', { orgId: ORG_A }), true)
  assert.equal(can(moderator, 'landlord_rent.manage', { flatId: FLAT_1 }), false)
})

check('an account with no membership can do nothing', () => {
  assert.equal(grantedPermissions(empty).length, 0)
  assert.equal(can(empty, 'payment.submit'), false)
})

check('a super admin passes every check', () => {
  const superAdmin: PermissionContext = { ...empty, isSuperAdmin: true }
  for (const permission of rolePermissions.super_admin) {
    assert.equal(can(superAdmin, permission, { orgId: ORG_B, flatId: FLAT_2 }), true)
  }
})

check('an owner who rents elsewhere still lands on the owner dashboard', () => {
  assert.equal(primaryRole(ownerAndTenant), 'admin')
  assert.equal(primaryRole(resident), 'resident')
  assert.equal(primaryRole(guard), 'guard')
  assert.equal(primaryRole(moderator), 'moderator')
})

check('every role inherits payment.submit except the guard', () => {
  assert.equal(can(resident, 'payment.submit', { flatId: FLAT_1 }), true)
  assert.equal(can(moderator, 'payment.submit', { flatId: FLAT_1 }), true)
  assert.equal(can(guard, 'payment.submit', { orgId: ORG_A }), false)
})

console.log(`\n${passed} checks passed`)
