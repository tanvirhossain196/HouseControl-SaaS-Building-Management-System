/**
 * Complaints: reference numbers, response targets, and the state machine.
 *
 * The transitions are the part worth testing. "Resolve a cancelled request"
 * and "reopen something that was withdrawn" both look harmless in a dropdown
 * and both produce a history nobody can audit.
 *
 *   npm run test:maintenance
 */
import assert from 'node:assert/strict'
import {
  ageOf,
  allowedTransitions,
  canTransition,
  compareRequests,
  maintenanceReference,
  nextReference,
  parseReference,
  responseDueAt,
  RESPONSE_HOURS,
  slaState,
  type MaintenancePriority,
  type MaintenanceStatus,
} from '../src/lib/maintenance'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const now = new Date('2026-09-03T12:00:00Z')
const hoursAgo = (hours: number) =>
  new Date(now.getTime() - hours * 3_600_000).toISOString()

console.log('reference numbers')

check('references are short, padded and readable aloud', () => {
  assert.equal(maintenanceReference(1), 'MR-0001')
  assert.equal(maintenanceReference(7), 'MR-0007')
  assert.equal(maintenanceReference(1234), 'MR-1234')
})

check('the next reference follows the highest one the building has', () => {
  assert.equal(nextReference(['MR-0001', 'MR-0002', 'MR-0003']), 'MR-0004')
  assert.equal(nextReference([]), 'MR-0001', 'a new building starts at one')
})

check('a gap in the sequence does not cause a reused number', () => {
  // MR-0002 was deleted in some earlier life; the next one must still be 0004.
  assert.equal(nextReference(['MR-0001', 'MR-0003']), 'MR-0004')
})

check('unordered input still finds the highest', () => {
  assert.equal(nextReference(['MR-0009', 'MR-0002', 'MR-0011', 'MR-0004']), 'MR-0012')
})

check('rubbish in the list is ignored rather than crashing the sequence', () => {
  assert.equal(nextReference(['MR-0004', 'nonsense', '']), 'MR-0005')
})

check('references read back to their number', () => {
  assert.equal(parseReference('MR-0042'), 42)
  assert.equal(parseReference('mr-0042'), 42, 'case does not matter on the phone')
  assert.equal(parseReference('MR-42'), null, 'a short form is not a reference')
  assert.equal(parseReference('XX-0042'), null)
})

console.log('\nstate machine')

check('an open request can be started, resolved or cancelled', () => {
  assert.equal(canTransition('open', 'in_progress'), true)
  assert.equal(canTransition('open', 'resolved'), true)
  assert.equal(canTransition('open', 'cancelled'), true)
})

check('a resolved request can come back, and nothing else', () => {
  assert.deepEqual(allowedTransitions('resolved'), ['open'])
  assert.equal(canTransition('resolved', 'cancelled'), false)
  assert.equal(canTransition('resolved', 'in_progress'), false)
})

check('a cancelled request is final', () => {
  // Reviving a withdrawn complaint would let somebody resurrect it quietly.
  assert.deepEqual(allowedTransitions('cancelled'), [])
  for (const to of ['open', 'in_progress', 'resolved'] as MaintenanceStatus[]) {
    assert.equal(
      canTransition('cancelled', to),
      false,
      `cancelled -> ${to} should be refused`,
    )
  }
})

check('a status cannot transition to itself', () => {
  for (const status of [
    'open',
    'in_progress',
    'resolved',
    'cancelled',
  ] as MaintenanceStatus[]) {
    assert.equal(canTransition(status, status), false)
  }
})

check('work in progress can be paused back to open', () => {
  assert.equal(canTransition('in_progress', 'open'), true)
})

console.log('\nresponse targets')

check('urgent means hours, low means a week', () => {
  assert.equal(RESPONSE_HOURS.urgent, 4)
  assert.equal(RESPONSE_HOURS.high, 24)
  assert.equal(RESPONSE_HOURS.normal, 72)
  assert.equal(RESPONSE_HOURS.low, 168)
})

check('the target is counted from when it was reported', () => {
  const due = responseDueAt('urgent', '2026-09-03T12:00:00.000Z')
  assert.equal(due, '2026-09-03T16:00:00.000Z')
})

check('an urgent request breaches after four hours, not four days', () => {
  const request = (hours: number) => ({
    status: 'open' as MaintenanceStatus,
    priority: 'urgent' as MaintenancePriority,
    createdAt: hoursAgo(hours),
  })

  assert.equal(slaState(request(1), now), 'met')
  assert.equal(slaState(request(3.5), now), 'due_soon')
  assert.equal(slaState(request(5), now), 'breached')
})

check('a closed request stops counting, even one resolved late', () => {
  // A target that keeps punishing after the work is done stops being read.
  const late = {
    status: 'resolved' as MaintenanceStatus,
    priority: 'urgent' as MaintenancePriority,
    createdAt: hoursAgo(300),
  }
  assert.equal(slaState(late, now), 'closed')
  assert.equal(slaState({ ...late, status: 'cancelled' }, now), 'closed')
})

console.log('\nordering')

check('open before closed, urgent before low, oldest first', () => {
  const requests = [
    { status: 'resolved' as const, priority: 'urgent' as const, createdAt: hoursAgo(1) },
    { status: 'open' as const, priority: 'low' as const, createdAt: hoursAgo(200) },
    { status: 'open' as const, priority: 'urgent' as const, createdAt: hoursAgo(2) },
    { status: 'open' as const, priority: 'urgent' as const, createdAt: hoursAgo(10) },
  ]

  const sorted = [...requests].sort(compareRequests)

  assert.equal(sorted[0]!.priority, 'urgent')
  assert.equal(
    sorted[0]!.createdAt,
    hoursAgo(10),
    'the urgent one that has waited longest',
  )
  assert.equal(sorted[1]!.createdAt, hoursAgo(2))
  assert.equal(sorted[2]!.priority, 'low')
  assert.equal(sorted[3]!.status, 'resolved', 'closed work sinks regardless of priority')
})

check('age reads the way a person would say it', () => {
  assert.equal(ageOf(hoursAgo(0), now), 'just now')
  assert.equal(ageOf(hoursAgo(3), now), '3h ago')
  assert.equal(ageOf(hoursAgo(48), now), '2 days ago')
  assert.equal(ageOf(hoursAgo(24 * 65), now), '2 months ago')
})

console.log(`\n${passed} checks passed`)
