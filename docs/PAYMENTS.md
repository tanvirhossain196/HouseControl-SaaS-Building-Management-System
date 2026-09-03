# Payments

Two ways money is recorded, one ledger underneath.

| Path | Who acts | What confirms it |
| --- | --- | --- |
| Manual (bKash, bank, cash) | resident records it, moderator reviews it | a human pressing Confirm |
| Online (SSLCommerz) | resident pays at the gateway | our own server-side validation call |

Either way the balance moves only through the trigger on `payments`. Nothing in the
application writes `dues.amount_paid`.

## The trust model for online payments

The order matters more than any single step:

1. **We create the payment row first**, as `pending`, with the amount read from the charge
   on the server. The browser never tells us what the rent is — it only names which charge
   is being paid.
2. **The callback's signature is verified.** SSLCommerz signs a named set of fields with
   the MD5 of the store password; we recompute it and compare in constant time.
3. **We call the gateway back and ask what happened**, using the `val_id` from the
   callback. This answer — from a request we made ourselves, to an address we hardcoded —
   is the one that confirms anything.
4. **The amount must match** what we recorded in step 1.

A signature proves a message is authentic. It does not prove the payment succeeded, and it
does not prove the figures are the ones we asked for. Steps 3 and 4 exist because of that
gap. Anything that fails a step is written to `webhook_events` and ignored.

## Replays

Providers retry. A network hiccup, a slow response, a manual replay from their dashboard —
the same event arrives more than once and must produce the same result.

Three things stop a double confirmation:

- `webhook_events` has a unique index on `(provider, transaction_id, val_id)`.
- The confirming update is `... where id = ? and status = 'pending'`, so a second delivery
  updates zero rows and is logged as a duplicate.
- `payments.transaction_id` is unique, so two payments cannot claim one gateway
  transaction.

Verified against a live Postgres instance:

| Attempt | Result |
| --- | --- |
| Same event inserted twice | rejected by `webhook_events_unique_event` |
| Different `val_id`, same transaction (a genuine retry after failure) | allowed |
| Unknown `outcome` value | rejected by `webhook_outcome_known` |
| Two payments sharing a `transaction_id` | rejected by the unique constraint |
| Refused callbacks | still recorded, with `signature_ok = false` |

## What the signature check refuses

`npm run test:gateway` covers these. Each is an attack that has worked on somebody's
integration:

| Forged callback | Result |
| --- | --- |
| Amount changed after signing | rejected |
| `status` flipped to VALID after signing | rejected |
| Pointed at a different transaction | rejected |
| Signed with a guessed store password | rejected |
| No signature at all | rejected |
| Empty `verify_key` with an empty-string hash | rejected |
| A signed field deleted, hoping it hashes as `''` | rejected |
| Extra unsigned fields added by the provider | still accepted |
| Fields sent in a different order | still accepted |

The truncation case is the one worth keeping: only fields named in `verify_key` are
hashed, so a handler that reads them straight out of the payload without checking they
exist will hash a missing `amount` as an empty string and accept the forgery.

## The webhook endpoint

`POST /api/payments/webhook/sslcommerz` is public, exempt from the CSRF origin check and
from the session requirement — the gateway has no session with us and sends no Origin
header. `src/middleware.ts` names the prefix explicitly rather than opening `/api`.

It answers 200 once the payload has been recorded, including for payloads it refuses. A
500 would make SSLCommerz retry an event we have already decided about. A 500 is returned
only when our own stack failed, which is exactly when a retry helps.

## Return page

The gateway redirects the resident to `/payments/return?status=...`. That page reads our
own record, not the query string: `status=success` in a URL the resident's browser
followed is a hint about where to look, not proof. The IPN may land a second after the
redirect, so "waiting for the bank" is a normal state rather than an error.

## Receipts

`GET /api/receipts/[paymentId]` renders a PDF with `pdf-lib`. Access is decided by RLS —
the query runs as the signed-in user, so a resident gets their own receipts and a
moderator their flat's. There is no separate permission check because there is no way to
widen the query.

Receipt numbers are `HC-2609-0001`: the month is part of the number, so the sequence
restarts monthly and cannot collide with last year's. `payments.receipt_no` is unique, so
two moderators confirming at the same moment fail on the constraint and the code retries.

**Unicode.** PDF standard fonts cannot draw Bangla, and `pdf-lib` throws at draw time
rather than degrading — confirmed by rendering one: `WinAnsi cannot encode "শ" (0x09b6)`.
A receipt that half-renders and then throws is worse than one with a placeholder, which is
why the check is per string rather than assumed for the document. Drop a Bangla-capable font at
`public/fonts/NotoSansBengali-Regular.ttf` and it is embedded automatically; without it,
text is made WinAnsi-safe first — `৳` becomes `BDT`, and a name that cannot be printed
becomes a marker rather than a blank line on a financial document.

Amounts are also written out in words, grouped the South Asian way: "Taka Twenty-four
thousand five hundred only".

## Configuration

```
SSLCOMMERZ_STORE_ID=
SSLCOMMERZ_STORE_PASSWORD=
SSLCOMMERZ_SANDBOX=true
```

Without a store id the online button does not render and the manual path is the only one
offered, so a deployment with no gateway is a working deployment.

In the SSLCommerz merchant panel, set the IPN URL to
`https://yourdomain.com/api/payments/webhook/sslcommerz` and enable IPN. The sandbox
credentials work end to end; test a full payment there before switching
`SSLCOMMERZ_SANDBOX` to `false`.
