/**
 * Search parsing, escaping, ranking and pagination.
 *
 * The search box is the most-used untrusted input in the app. Most of what
 * follows is about what happens when somebody types something the code did
 * not expect — a percent sign, a quote, a page number past the end.
 *
 *   npm run test:search
 */
import assert from 'node:assert/strict'
import {
  escapeLike,
  highlight,
  isSearchable,
  likePattern,
  paginate,
  parseQuery,
  parseSort,
  rankHits,
  scoreHit,
  withParams,
  type SearchHit,
} from '../src/lib/search'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('escaping')

check('a percent sign is a percent sign, not "everything"', () => {
  // Without this, searching "100%" returns every row in the table.
  assert.equal(escapeLike('100%'), '100\\%')
  assert.equal(likePattern('100%'), '%100\\%%')
})

check('an underscore matches an underscore, not any character', () => {
  assert.equal(escapeLike('flat_5b'), 'flat\\_5b')
})

check('a backslash is escaped before the wildcards are', () => {
  // Escaping in the wrong order turns \% into \\% and lets the wildcard back in.
  assert.equal(escapeLike('a\\%b'), 'a\\\\\\%b')
})

check('ordinary text is left alone', () => {
  assert.equal(escapeLike('Shirin Akter'), 'Shirin Akter')
  assert.equal(likePattern('  5B  '), '%5B%')
})

console.log('\nquery parsing')

check('a plain query is all free text', () => {
  assert.deepEqual(parseQuery('shirin akter'), { text: 'shirin akter', fields: {} })
})

check('known filters are lifted out of the text', () => {
  const parsed = parseQuery('overdue flat:5B status:open')
  assert.equal(parsed.text, 'overdue')
  assert.deepEqual(parsed.fields, { flat: '5B', status: 'open' })
})

check('a quoted filter value keeps its spaces', () => {
  const parsed = parseQuery('building:"Nasreen Tower" leak')
  assert.equal(parsed.fields.building, 'Nasreen Tower')
  assert.equal(parsed.text, 'leak')
})

check('an unknown filter stays in the text rather than vanishing', () => {
  // Dropping it silently would answer a different question than the one asked.
  const parsed = parseQuery('colour:blue tap')
  assert.equal(parsed.fields.colour, undefined)
  assert.ok(parsed.text.includes('colour:blue'))
})

check('field names are case-insensitive', () => {
  assert.equal(parseQuery('FLAT:5b').fields.flat, '5b')
})

console.log('\nwhat is worth searching')

check('one letter is not, because it matches most of a building', () => {
  assert.equal(isSearchable('a'), false)
  assert.equal(isSearchable(' '), false)
  assert.equal(isSearchable(''), false)
})

check('a single digit is, because flats are numbered that way', () => {
  assert.equal(isSearchable('5'), true)
  assert.equal(isSearchable('5B'), true)
})

console.log('\nranking')

check('an exact match beats a partial one', () => {
  assert.ok(scoreHit('5B', '5b') > scoreHit('Flat 5B extension', '5b'))
})

check('a prefix beats a match in the middle', () => {
  assert.ok(scoreHit('Shirin Akter', 'shir') > scoreHit('Nashirul Islam', 'shir'))
})

check('a word start beats a match inside a word', () => {
  assert.ok(scoreHit('Kamrul Hasan', 'has') > scoreHit('Prahasan', 'has'))
})

check('flats come before visitors when the score is level', () => {
  const hits: SearchHit[] = [
    { kind: 'visitor', id: '1', title: '5B', subtitle: null, href: '/gate', score: 100 },
    { kind: 'flat', id: '2', title: '5B', subtitle: null, href: '/flats/2', score: 100 },
  ]

  assert.equal(rankHits(hits)[0]!.kind, 'flat')
})

console.log('\nhighlighting')

check('the matched run is marked and the rest is not', () => {
  const segments = highlight('Shirin Akter', 'shir')
  assert.deepEqual(segments, [
    { text: 'Shir', match: true },
    { text: 'in Akter', match: false },
  ])
})

check('every occurrence is marked, not only the first', () => {
  const segments = highlight('ababa', 'a')
  assert.equal(segments.filter((segment) => segment.match).length, 3)
})

check('the original text survives exactly, tags and all', () => {
  // Segments rather than HTML, so a resident named <script> stays a string.
  const title = '<script>alert(1)</script>'
  const rebuilt = highlight(title, 'script')
    .map((segment) => segment.text)
    .join('')

  assert.equal(rebuilt, title)
})

check('an empty query highlights nothing', () => {
  assert.deepEqual(highlight('Shirin', ''), [{ text: 'Shirin', match: false }])
})

console.log('\npagination')

check('the first page of a long list', () => {
  const page = paginate(95, 1, 20)
  assert.deepEqual(
    {
      page: page.page,
      offset: page.offset,
      totalPages: page.totalPages,
      hasNext: page.hasNext,
    },
    { page: 1, offset: 0, totalPages: 5, hasNext: true },
  )
})

check('a page past the end is clamped, not an error', () => {
  // This URL arrives whenever a row is deleted while a link is being shared.
  const page = paginate(45, 99, 20)
  assert.equal(page.page, 3)
  assert.equal(page.hasNext, false)
})

check('page zero and negative pages become page one', () => {
  assert.equal(paginate(45, 0, 20).page, 1)
  assert.equal(paginate(45, -3, 20).page, 1)
})

check('an empty list still has one page', () => {
  const page = paginate(0, 1, 20)
  assert.equal(page.totalPages, 1)
  assert.equal(page.hasNext, false)
})

check('page size is capped so nobody can ask for the whole table', () => {
  assert.equal(paginate(10_000, 1, 5000).perPage, 100)
  assert.equal(paginate(10_000, 1, 0).perPage, 1)
})

console.log('\nsorting')

const COLUMNS = ['created_at', 'amount', 'unit_number'] as const
const FALLBACK = { column: 'created_at' as const, ascending: false }

check('a known column sorts as asked', () => {
  assert.deepEqual(parseSort('amount', COLUMNS, FALLBACK), {
    column: 'amount',
    ascending: true,
  })
  assert.deepEqual(parseSort('-amount', COLUMNS, FALLBACK), {
    column: 'amount',
    ascending: false,
  })
})

check('an unknown column falls back instead of reaching the database', () => {
  // ?sort= goes into an order() call; an unchecked name there leaks schema.
  assert.deepEqual(parseSort('password', COLUMNS, FALLBACK), FALLBACK)
  assert.deepEqual(parseSort('-profiles.email', COLUMNS, FALLBACK), FALLBACK)
  assert.deepEqual(parseSort(null, COLUMNS, FALLBACK), FALLBACK)
})

console.log('\nquery strings')

check('changing one filter keeps the others', () => {
  const query = withParams({ q: 'leak', status: 'open' }, { page: 2 })
  const params = new URLSearchParams(query)

  assert.equal(params.get('q'), 'leak')
  assert.equal(params.get('status'), 'open')
  assert.equal(params.get('page'), '2')
})

check('clearing a filter removes it rather than leaving it empty', () => {
  const query = withParams({ q: 'leak', status: 'open' }, { status: null })
  assert.ok(!query.includes('status'))
})

check('no parameters produce no question mark', () => {
  assert.equal(withParams({}, {}), '')
})

console.log(`\n${passed} checks passed`)
