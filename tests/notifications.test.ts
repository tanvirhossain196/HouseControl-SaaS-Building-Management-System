/**
 * Notification rules.
 *
 * Three things decide whether people keep notifications turned on: how often
 * they arrive, when they arrive, and whether the same thing arrives twice.
 * All three are decided by pure functions, so all three are checked here.
 *
 *   npm run test:notifications
 */
import assert from 'node:assert/strict'
import {
  channelsFor,
  channelsNow,
  dedupeKey,
  dhakaHour,
  EVENTS,
  inQuietHours,
  nextSendableTime,
  render,
  type Channel,
  type EventKey,
} from '../src/lib/notifications'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

const reachable = { email: true, phone: true }

console.log('channel selection')

check('a new account gets each event’s defaults', () => {
  for (const event of Object.keys(EVENTS) as EventKey[]) {
    const channels = channelsFor(event, null, reachable)
    assert.ok(channels.includes('in_app'), `${event} must always leave an in-app record`)
  }
})

check('turning a channel off turns it off', () => {
  const before = channelsFor('due.reminder', null, reachable)
  const after = channelsFor('due.reminder', { email: false }, reachable)

  assert.ok(before.includes('email'))
  assert.ok(!after.includes('email'))
})

check('an in-app record is kept even when everything is switched off', () => {
  // Otherwise "I was never told" has no answer either way.
  const channels = channelsFor(
    'due.reminder',
    {
      in_app: false,
      email: false,
      sms: false,
      push: false,
    },
    reachable,
  )

  assert.deepEqual(channels, ['in_app'])
})

check('a mandatory event cannot be silenced', () => {
  const mandatory = (Object.keys(EVENTS) as EventKey[]).filter(
    (event) => EVENTS[event].mandatory,
  )
  assert.ok(mandatory.length > 0, 'some events must be mandatory')

  for (const event of mandatory) {
    const channels = channelsFor(
      event,
      {
        in_app: false,
        email: false,
        sms: false,
        push: false,
      },
      reachable,
    )

    assert.ok(
      channels.length >= EVENTS[event].defaults.length,
      `${event} lost a channel it is not allowed to lose`,
    )
  }
})

check('SMS is dropped for an unverified phone, however the preference reads', () => {
  const channels = channelsFor(
    'due.overdue',
    { sms: true },
    { email: true, phone: false },
  )
  assert.ok(!channels.includes('sms'))
})

check('email is dropped when there is no address', () => {
  const channels = channelsFor(
    'due.reminder',
    { email: true },
    { email: false, phone: true },
  )
  assert.ok(!channels.includes('email'))
})

check('SMS is never chosen for an event with no short version written', () => {
  // Every SMS costs money and 160 characters. An event without an sms()
  // template would otherwise send a truncated body.
  for (const event of Object.keys(EVENTS) as EventKey[]) {
    if (EVENTS[event].sms) continue
    const channels = channelsFor(event, { sms: true }, reachable)
    assert.ok(!channels.includes('sms'), `${event} has no SMS text but SMS was selected`)
  }
})

console.log('\nquiet hours')

check('the hour is Dhaka’s hour, not the server’s', () => {
  assert.equal(dhakaHour(new Date('2026-09-03T18:00:00Z')), 0, 'midnight in Dhaka')
  assert.equal(dhakaHour(new Date('2026-09-03T04:00:00Z')), 10)
})

check('3am is quiet, 3pm is not', () => {
  assert.equal(inQuietHours(new Date('2026-09-03T21:00:00Z')), true, '3am Dhaka')
  assert.equal(inQuietHours(new Date('2026-09-03T09:00:00Z')), false, '3pm Dhaka')
  assert.equal(inQuietHours(new Date('2026-09-03T17:00:00Z')), true, '11pm Dhaka')
})

check('a rent reminder at 3am holds the noisy channels and sends the quiet ones', () => {
  const middleOfNight = new Date('2026-09-03T21:00:00Z')
  const { send, hold } = channelsNow(
    'due.overdue',
    ['in_app', 'email', 'sms'],
    middleOfNight,
  )

  assert.deepEqual(send, ['in_app', 'email'], 'email and in-app wake nobody')
  assert.deepEqual(hold, ['sms'])
})

check('an urgent event goes through at 3am', () => {
  // A visitor at the gate at 3am is exactly when you want to know.
  const middleOfNight = new Date('2026-09-03T21:00:00Z')
  const urgent = (Object.keys(EVENTS) as EventKey[]).filter(
    (event) => EVENTS[event].urgent,
  )
  assert.ok(urgent.length > 0)

  for (const event of urgent) {
    const { hold } = channelsNow(event, ['in_app', 'sms'], middleOfNight)
    assert.deepEqual(hold, [], `${event} should not be held`)
  }
})

check('held messages are released at 8am Dhaka, not 8am UTC', () => {
  const at3am = new Date('2026-09-03T21:00:00Z')
  const release = nextSendableTime(at3am)

  assert.equal(dhakaHour(release), 8)
  assert.ok(release.getTime() > at3am.getTime())
})

check('something held at 11pm is released the next morning, not the same one', () => {
  const at11pm = new Date('2026-09-03T17:00:00Z')
  const release = nextSendableTime(at11pm)

  assert.equal(dhakaHour(release), 8)
  assert.ok(
    release.getTime() - at11pm.getTime() > 8 * 3_600_000,
    'released the following morning',
  )
})

console.log('\ndeduplication')

check('the same reminder on the same day is one key', () => {
  const a = dedupeKey('due.reminder', 'user-1', 'due-9', '2026-09-05')
  const b = dedupeKey('due.reminder', 'user-1', 'due-9', '2026-09-05')
  assert.equal(a, b)
})

check('tomorrow is a different key, so next month still reminds', () => {
  const today = dedupeKey('due.reminder', 'user-1', 'due-9', '2026-09-05')
  const tomorrow = dedupeKey('due.reminder', 'user-1', 'due-9', '2026-09-06')
  assert.notEqual(today, tomorrow)
})

check('two people are never deduplicated against each other', () => {
  const mine = dedupeKey('due.reminder', 'user-1', 'due-9', '2026-09-05')
  const theirs = dedupeKey('due.reminder', 'user-2', 'due-9', '2026-09-05')
  assert.notEqual(mine, theirs)
})

check('two charges on one person are separate notices', () => {
  const rent = dedupeKey('due.reminder', 'user-1', 'due-9', '2026-09-05')
  const gas = dedupeKey('due.reminder', 'user-1', 'due-10', '2026-09-05')
  assert.notEqual(rent, gas)
})

console.log('\nmessages')

check('every event renders a title and a body', () => {
  const data = {
    amount: '24,500',
    dueDate: '2026-09-05',
    unit: '5B',
    description: 'Rent for 2026-09',
    days: '3',
    name: 'Shirin Akter',
    reference: 'MR-0007',
    reason: 'No payment with that TrxID arrived',
    code: '482913',
    receipt: 'HC-2609-0004',
    building: 'Nasreen Tower',
    what: 'Kitchen tap leaking',
  }

  for (const event of Object.keys(EVENTS) as EventKey[]) {
    const message = render(event, data)
    assert.ok(message.title.length > 3, `${event} has no title`)
    assert.ok(message.body.length > 10, `${event} has no body`)
    assert.ok(!message.title.includes('undefined'), `${event} title has a hole in it`)
    assert.ok(!message.body.includes('undefined'), `${event} body has a hole in it`)
  }
})

check('an SMS never runs past one message', () => {
  const data = {
    amount: '1,234,567',
    dueDate: '2026-09-05',
    unit: '12C',
    description: 'A very long description that nobody would ever actually type in here',
    days: '14',
    name: 'A Person With A Rather Long Name Indeed',
    reference: 'MR-9999',
    reason:
      'A long reason that goes on and on and would not fit in a single text message',
    code: '482913',
    receipt: 'HC-2609-0004',
    building: 'A Building With An Unreasonably Long Name',
    what: 'Something long',
  }

  for (const event of Object.keys(EVENTS) as EventKey[]) {
    const message = render(event, data)
    if (!message.sms) continue
    assert.ok(
      message.sms.length <= 160,
      `${event} SMS is ${message.sms.length} characters`,
    )
  }
})

check('missing data does not produce a message with a hole in it', () => {
  for (const event of Object.keys(EVENTS) as EventKey[]) {
    const message = render(event, {})
    assert.ok(!message.title.includes('undefined'), `${event} title breaks with no data`)
    assert.ok(!message.body.includes('undefined'), `${event} body breaks with no data`)
    if (message.sms) {
      assert.ok(!message.sms.includes('undefined'), `${event} SMS breaks with no data`)
    }
  }
})

console.log(`\n${passed} checks passed`)
