# The gate register

Three people use this and they see three different things.

| Role     | Sees                           | Can do                                     |
| -------- | ------------------------------ | ------------------------------------------ |
| Guard    | everyone at their building     | log arrivals, mark exits, turn people away |
| Resident | their own flat's visitors only | pre-approve a guest, cancel that           |
| Owner    | the whole building's log       | everything above, plus the blocklist       |

RLS decides all of it. A resident's query for the building's visitors returns their flat's
rows and nothing else, however it is written.

## Who may write what

Phase 2's policy let any flat member update any visitor row in their building — including
setting `state = 'inside'`. That is the guard's job. Migration `0010` replaces it with
three narrower policies:

- **`visitors_preapprove`** — a resident may insert, with the state pinned to
  `pre_approved`, for a flat they live in, with themselves as the approver. The pin is the
  point: without it, "create a pre-approval" is also "declare someone present".
- **`visitors_cancel_own_preapproval`** — they may withdraw their own, while it is pending.
- **`visitors_gate_write`** — guards and owners run everything else.

## Entry codes

Six characters from `ACDEFGHJKMNPQRTUVWXY2346789`. Missing on purpose: `O/0`, `I/1`, `L/1`,
`S/5`, `B/8`. A code gets read aloud through a gate intercom or off a cracked phone screen,
and those are the pairs that come back wrong. `L` went last, when a test asked why it was
still in a list that already excluded `I` and `1`.

Shown grouped as `KF7-2M9`; typed back in any shape — dashes, spaces, lower case all
forgiven. A character outside the alphabet is reported as a mistake rather than guessed at,
because guessing `0` means `O` is how the wrong person gets in.

Codes live twelve hours and are single-use. The uniqueness index only covers codes still
attached to a pending pre-approval, so a used code frees its value for reuse later —
verified below.

**A code with no expiry counts as expired.** Rows created before `code_expires_at` existed
have none, and at a gate the safe reading of "we do not know when this stops working" is
that it already has. A new one takes seconds to issue.

## Phone numbers

`+8801712345678`, `8801712345678`, `01712345678` and `017-1234-5678` are one person. The
blocklist depends on that: a block that `+880` defeats is not a block. Everything is
normalised to the eleven local digits before it is stored or compared, and two unknown
numbers are never treated as the same person.

## The blocklist

`blocked_visitors` is about a person, not a visit — that is why it is a separate table from
`visitors.is_blocked`, which only ever marked one arrival.

The guard's entry form **refuses** a blocked number rather than warning about it. A guard
with someone standing in front of them will click through a warning; overriding is a
decision for whoever can lift the block. Lifting keeps the row, so the history shows the
block was made and then removed, and by whom.

## Notifications

The resident is told when someone arrives for their flat — a courier at the gate is the
case this exists for. Pre-approved arrivals notify too, because "your sister is here" is
still worth knowing.

## Built for the gate, not the desk

The guard is on a mid-range Android phone, often on a weak signal, with someone waiting.
The two actions that happen fifty times a day — log an arrival, mark someone out — are
reachable without scrolling, with 48px targets. There is no money anywhere on the screen,
and the RLS policies would refuse a ledger query from this role even if there were.

Anyone still marked inside after twelve hours is flagged. It is almost always a guard who
forgot to mark them out at shift change, and a register full of phantom residents stops
being read.

## What the database enforces on its own

Verified against a live Postgres instance:

| Attempt                                     | Result                                       |
| ------------------------------------------- | -------------------------------------------- |
| Two live pre-approvals sharing a code       | rejected by `visitors_active_entry_code`     |
| Reusing a code after the first was consumed | allowed — the index only covers pending ones |
| An exit timestamped before the entry        | rejected by `visitor_exit_after_entry`       |
| A block with a one-word reason              | rejected by the length check                 |
| A second live block on one number           | rejected by `blocked_visitors_one_active`    |
| Re-blocking after the first was lifted      | allowed                                      |
| A malformed phone number on a block         | rejected by the format check                 |
