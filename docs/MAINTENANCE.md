# Complaints and repairs

A leaking tap, a lift that sticks, a light in the stairwell. Each one gets a reference
number, a response target, and a record of what was done — which is the part that settles
the argument six months later about whether it was fixed.

## Who may do what

|           | Report | Comment | Assign, start work | Resolve | Withdraw |
| --------- | :----: | :-----: | :----------------: | :-----: | :------: |
| Resident  |   ●    |    ●    |                    |         | own only |
| Moderator |   ●    |    ●    |         ●          |    ●    | own only |
| Owner     |   ●    |    ●    |         ●          |    ●    | own only |
| Guard     |   ●    |    ●    |                    |         | own only |

**The person who reported a problem cannot mark it resolved.** That judgement belongs to
whoever did the work; a complaint closed by the complainant is one nobody can audit. They
can withdraw it instead, which closes it with their own reason attached and is a different
thing on the record.

The RLS policies in `0011` enforce the same split from underneath: `maintenance_cancel_own`
lets the reporter set `cancelled` and nothing else.

## Reference numbers

`MR-0001`, per building, never reused. A resident calls the caretaker and says "the lift
one, MR-0007" — that only works if the number is short, spoken easily, and unique in the
building rather than across the platform.

Allocation reads the building's existing numbers and takes the highest plus one. A gap in
the sequence does not cause a reuse; two people reporting at the same second collide on
the unique index and the second one retries.

## Response targets

| Priority | Target   | What it means                                       |
| -------- | -------- | --------------------------------------------------- |
| Urgent   | 4 hours  | water coming through a ceiling, someone in the lift |
| High     | 24 hours | it is affecting daily life                          |
| Normal   | 3 days   | this week                                           |
| Low      | 7 days   | whenever someone is passing                         |

The target is shown in the report form as the priority changes, so "urgent" reads as a
promise the building has to keep rather than a way to feel heard.

A resolved or cancelled request stops counting, **including one resolved late**. A target
that keeps punishing after the work is done stops being read.

## The state machine

```
open ⇄ in_progress → resolved → open (reopened)
  ↓         ↓
cancelled  cancelled          cancelled is final
```

Two decisions worth stating:

**Resolved is not final.** Things come back. Reopening adds an event to the same request
and bumps `reopened_count` rather than creating a second request — a tap fixed three times
is a different conversation from three taps, and the owner should see which one they have
before paying the same plumber again.

**Cancelled is final.** A withdrawn complaint that could be revived would let somebody
quietly resurrect it after the fact. Report it again if it is still a problem.

The machine lives in `src/lib/maintenance.ts`, so the UI only offers transitions that
exist rather than offering everything and refusing afterwards.

## The timeline

Status changes and notes share one table, so the story reads in one order. Status rows are
written by the trigger from migration `0005`; notes are written by whoever is talking. A
note has to have text in it, and a status row does not — both enforced by check
constraints rather than by the form.

## Repairs that cost money

Resolving with an amount creates a building expense for the current period and links it
back with `expense_id`, so the work and the money stay attached. If the expense insert
fails the repair still closes: the work is done either way, and an owner can add the cost
by hand. That is the correct direction to fail in.

## What the database enforces on its own

Verified against a live Postgres instance:

| Attempt                                          | Result                                           |
| ------------------------------------------------ | ------------------------------------------------ |
| Status changed                                   | timeline row written automatically               |
| Resolving with no `resolved_at`                  | rejected by `maintenance_resolved_has_timestamp` |
| Two requests sharing a reference in one building | rejected by the unique constraint                |
| A note with only whitespace                      | rejected by `maintenance_note_has_text`          |
| An event of an unknown kind                      | rejected by `maintenance_event_kind_known`       |
| A negative repair cost                           | rejected by the cost check                       |
| A seventh photo                                  | rejected by `maintenance_photo_limit`            |

## Still to come

Photos are stored as URLs; the upload path arrives with the storage work. Notifications on
status changes arrive in Phase 11 alongside email and SMS.
