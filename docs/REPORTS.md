# Reports and statements

Five numbers, three tables, two file formats. Everything reads through RLS, so the same
page shows an owner their whole organization and a moderator their own flat — the numbers
narrow with the role rather than the page changing.

## What is on the page

|                       | Answers                                   |
| --------------------- | ----------------------------------------- |
| Collection this month | how much came in, against last month      |
| Twelve-month bars     | which months were chased late             |
| Arrears ageing        | whether the debt is new or old            |
| Who owes what         | the list an owner works down, worst first |
| Expenses by category  | where the building's money went           |

The ageing table is the one worth having. A total is what an owner already knows; the
shape is what they do not. Two lakh spread across this month is a collection problem, and
the same two lakh sitting past ninety days is a legal one.

## Statements balance

The invariant, on every line and at the foot:

```
opening + charges − payments = closing
```

The opening balance is everything charged before the window minus everything paid before
it, so a statement reconciles against the ledger rather than starting from zero and
pretending history began in January. `buildStatement` is pure and tested, including the
awkward cases: a charge and a payment on the same day (charge first — you cannot pay
something that has not been billed), and amounts that do not divide cleanly.

Arithmetic runs in paisa, so a statement of thirty lines closes on the exact figure rather
than a rounding error.

## CSV exports

`GET /api/reports/ledger|arrears|expenses?period=YYYY-MM-01`

Three details that make an export usable rather than merely correct:

**Formula cells are neutralised.** A cell starting with `=`, `+`, `-` or `@` is prefixed
with an apostrophe. An export is opened in Excel by someone who trusts the file, which is
exactly what CSV injection relies on — a resident named `=cmd|calc!A1` should not run
anything on the owner's laptop. Verified in the rendered output:

```
2026-09-05,6B,'=cmd|calc!A1,'+1+1,0,0
```

**A byte-order mark leads the file**, so Excel opens Bangla names as Bangla rather than
mojibake. Without it a resident called শিরিন আক্তার appears as garbage in the one program
every owner uses.

**Lines end CRLF and embedded newlines stay inside their quotes.** A description with a
line break in it must not shift every column after it:

```
2026-09-05,3A,শিরিন আক্তার,"Gas share, Sept
second line",1200,0
```

Filenames are `housecontrol-ledger-all-2026-09-01.csv`: sortable by date, safe on every
filesystem.

## PDF statements

`GET /api/statements/[flatId]?period=YYYY-MM-01`

One page: brought-forward balance, every line with a running balance, and the closing
figure in numerals and in words. This is what an owner sends to a landlord or an
accountant.

The same Unicode rule as receipts applies — standard PDF fonts throw on Bangla rather than
degrading, so every string is checked before it is drawn. Long statements are truncated to
one page on purpose; the CSV carries the full tail, and a three-page PDF is not what anyone
wanted from a monthly statement.

## Access

There is no permission check in either route. Both queries run as the signed-in user, and
RLS decides the rows: a resident's statement is their own flat, a moderator's is their
flat, an owner's is any of theirs. Adding a check on top would be a second, weaker copy of
a rule the database already enforces.

The page itself needs `report.flat.view`, which is what keeps `/reports` off a resident's
sidebar — they have `/dues` instead.
