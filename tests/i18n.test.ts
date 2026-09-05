/**
 * The dictionaries.
 *
 * TypeScript already guarantees that Bangla has every key English has —
 * `bn` is typed as `Dictionary`. What it cannot check is whether the Bangla
 * value is actually Bangla, whether somebody left a key empty, or whether a
 * translation is so much longer than the original that it breaks the layout
 * it sits in. That is what these do.
 *
 *   npm run test:i18n
 */
import assert from 'node:assert/strict'
import { en } from '../src/lib/i18n/en'
import { bn } from '../src/lib/i18n/bn'
import { DEFAULT_LOCALE, isLocale, LOCALES, parseLocale } from '../src/lib/i18n/locales'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

type Entries = [string, string][]

/** Flattens `{ hero: { title } }` into `[['hero.title', '…']]`. */
function flatten(dict: Record<string, Record<string, string>>): Entries {
  return Object.entries(dict).flatMap(([group, strings]) =>
    Object.entries(strings).map(
      ([key, value]) => [`${group}.${key}`, value] as [string, string],
    ),
  )
}

const english = flatten(en as never)
const bangla = flatten(bn as never)
const banglaByKey = new Map(bangla)

console.log('dictionaries')

check('there is something to check', () => {
  assert.ok(english.length > 60, `only ${english.length} strings`)
})

check('the two dictionaries have exactly the same keys', () => {
  // The types enforce this; the test states it, so a change to the type
  // setup cannot quietly remove the guarantee.
  assert.deepEqual(english.map(([key]) => key).sort(), bangla.map(([key]) => key).sort())
})

check('no string is empty in either language', () => {
  for (const [key, value] of [...english, ...bangla]) {
    assert.ok(value.trim().length > 0, `${key} is empty`)
  }
})

check('no Bangla string was left as its English original', () => {
  // The failure this catches: copying en.ts to bn.ts and translating half.
  const untranslated: string[] = []

  for (const [key, value] of english) {
    const translated = banglaByKey.get(key)
    if (translated === value && /[a-zA-Z]{4,}/.test(value)) untranslated.push(key)
  }

  assert.deepEqual(untranslated, [], `still in English: ${untranslated.join(', ')}`)
})

check('Bangla strings actually contain Bangla', () => {
  const bengali = /[\u0980-\u09FF]/
  const suspicious: string[] = []

  for (const [key, value] of bangla) {
    // Brand names and a bare dash are allowed to have no Bangla letters.
    if (value.length <= 2) continue
    if (!bengali.test(value) && !/^[A-Za-z ]+$/.test(value)) suspicious.push(key)
    else if (!bengali.test(value) && !['auth.continueWithGoogle'].includes(key)) {
      suspicious.push(key)
    }
  }

  assert.deepEqual(suspicious, [], `no Bangla in: ${suspicious.join(', ')}`)
})

check('short labels stay short in Bangla', () => {
  // A button label that triples in length breaks the row it sits in. Bangla
  // runs longer than English for most UI words, so the allowance is generous
  // — this only catches a paragraph pasted into a button.
  const tooLong: string[] = []

  for (const [key, value] of english) {
    if (value.length > 24) continue
    const translated = banglaByKey.get(key) ?? ''
    if (translated.length > Math.max(32, value.length * 3)) tooLong.push(key)
  }

  assert.deepEqual(tooLong, [], `far longer in Bangla: ${tooLong.join(', ')}`)
})

check('nothing has a stray interpolation placeholder', () => {
  // Strings are composed in JSX, not templated. A {name} left in one would
  // render as literal braces on the page.
  for (const [key, value] of [...english, ...bangla]) {
    assert.ok(!/\{\w+\}/.test(value), `${key} contains a placeholder: ${value}`)
  }
})

console.log('\nlocale parsing')

check('the two supported languages are recognised', () => {
  assert.deepEqual(LOCALES, ['en', 'bn'])
  assert.equal(isLocale('bn'), true)
  assert.equal(isLocale('fr'), false)
})

check('a regional tag resolves to its language', () => {
  assert.equal(parseLocale('bn-BD'), 'bn')
  assert.equal(parseLocale('bn_BD'), 'bn')
  assert.equal(parseLocale('en-GB'), 'en')
})

check('anything unrecognised falls back rather than throwing', () => {
  // This value comes from a cookie, which anyone can edit by hand.
  assert.equal(parseLocale('fr'), DEFAULT_LOCALE)
  assert.equal(parseLocale(''), DEFAULT_LOCALE)
  assert.equal(parseLocale(null), DEFAULT_LOCALE)
  assert.equal(parseLocale('../../etc/passwd'), DEFAULT_LOCALE)
})

console.log(`\n${passed} checks passed`)
