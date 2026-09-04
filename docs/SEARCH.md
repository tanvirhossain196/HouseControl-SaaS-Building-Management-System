# Search and filtering

One box in the header, `⌘K` or `/` to open, and a full-page version at `/search` for the
URL people share.

## What it searches

Flats, residents, payments, repairs, visitors and buildings — six small queries rather than
one clever join.

Two reasons for six queries. Each table's RLS policy applies to its own query, so a
resident searching `5B` gets their own flat and not the building's. And a failure in one
area returns the other five rather than an empty screen.

## Filters

Free text works. So does `flat:5B status:open building:"Nasreen Tower"`.

An unrecognised filter — `colour:blue` — stays in the free text rather than being dropped.
Dropping it silently would answer a different question from the one asked, which reads as
a bug rather than a feature.

Enum filters are matched against the values the column actually holds. `status:banana`
is ignored instead of being sent to Postgres as an enum it would reject.

## Escaping, and why it matters

`ilike` treats `%` as "everything" and `_` as "any character". A search box is the
most-used untrusted input in the app, so every value goes through `escapeLike` first.

Verified against Postgres:

| Typed | Result |
| --- | --- |
| `100%` | matches the literal string; 0 rows, not all 4 |
| `flat_5b` | the underscore is a character, not a wildcard |
| `5` | still finds flat 5B |

The backslash is escaped **before** the wildcards. In the other order `\%` becomes `\\%`
and the wildcard is back.

## Ranking

Exact match, then prefix, then word start, then anywhere; shorter titles win ties. `5B`
beats `Flat 5B extension` for the query `5b`, and `Shirin` beats `Nashirul` for `shir`.

Ties between kinds go to what people usually want: flats, then residents, then payments.

## Highlighting

`highlight()` returns segments — `{ text, match }` — rather than HTML. Nothing is
dangerously set, so a resident named `<script>alert(1)</script>` renders as their name.
A test asserts the original string survives the round trip exactly.

## Indexes

Trigram (`gin_trgm_ops`) rather than full text, because these are names and short codes and
people type fragments: `%shir%` finds Shirin, where a tsvector would not. Migration `0013`
adds them for resident names, repair titles and payment references, alongside the three
from Phase 2.

The planner uses them when the table is big enough to be worth it. On the seed data it
picks a sequential scan over five rows, which is correct; forcing `enable_seqscan = off`
confirms the index is there and usable:

```
Bitmap Index Scan on profiles_name_trgm
  Index Cond: (full_name ~~* '%shir%'::text)
```

Postgres cannot use a trigram index for a pattern under three characters, so the
application refuses one- and two-character queries before they reach the database —
except a single digit, because flats are genuinely numbered that way.

## Pagination and sorting

`paginate()` clamps rather than errors. `?page=99` on a two-page list shows page two: that
URL arrives whenever a row is deleted while a link is being shared. Page size is capped at
100 so nobody can ask for the whole table through the address bar.

`parseSort()` takes a whitelist. `?sort=` feeds an `order()` call, and an unchecked column
name there is a way to probe the shape of tables the caller cannot select from.

## The dialog

Debounced at 220ms with the previous request aborted, so typing quickly cannot leave a
stale response overwriting a newer one. Arrow keys move, Enter opens, Escape closes, and
Enter with no results goes to the full page instead of doing nothing.
