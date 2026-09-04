# Authentication

Supabase Auth, with sessions in httpOnly cookies. Nothing is stored in
`localStorage`, so an XSS bug cannot read a session token.

## The rule this phase exists for

**An unverified account can see nothing.** Every path either verifies the address before
the account works (email + password), or arrives already verified (Google, magic link).
Passwords alone never grant access.

## The four ways in

| Path             | Verification                                     | Where it lands                                  |
| ---------------- | ------------------------------------------------ | ----------------------------------------------- |
| Google OAuth     | Google has verified the address                  | `/auth/callback` → `/dashboard`                 |
| Email + password | Confirmation link, required before first sign-in | `/check-email` → callback → `/onboarding/phone` |
| Magic link       | The link itself is the proof                     | `/check-email` → callback → `/dashboard`        |
| Password reset   | Single-use link, one hour                        | callback → `/reset-password`                    |

### The reset code

`/forgot-password` asks for the address, mails a code, and takes the code on the next
step. The link in the same email still works and lands in the same place.

A code rather than only a link because of where this gets used: a resident opens the email
in Gmail on their phone, and the link opens a second browser with none of the session the
first one was building. A code is read in one app and typed into another, which is what
everyone here already does with every OTP they get.

**Supabase decides which one it sends by what the template contains.** In
Authentication → Email Templates → Reset Password, the body must include the token:

```html
<p>Your HouseControl password reset code is <strong>{{ .Token }}</strong>.</p>
<p>It expires in an hour and works once.</p>
<p>Or open this link instead: <a href="{{ .ConfirmationURL }}">reset your password</a></p>
```

Without `{{ .Token }}` the email carries only a link and the code step will never match.

The code is verified as `type: 'recovery'`, not `'email'`. A signup confirmation code
verifies an address; this one grants a password change, and treating them alike would let
an unconfirmed signup reset somebody else's password.

Wrong and expired codes give the same message, and attempts are throttled per address, so
the form cannot be used to find out whether a reset is in flight for an address.

Phase 3 note: phone verification (`/onboarding/phone`) is separate from sign-in. It gates moderator
work rather than access, because the Phase 8 role handover sends its OTP to that number.
`requireVerifiedPhone()` is the guard to use for anything that depends on it.

## Files

```
src/lib/auth/actions.ts      every flow, as server actions
src/lib/auth/session.ts      getSession, requireSession, requireVerifiedPhone
src/lib/supabase/middleware.ts   session refresh on every request
src/middleware.ts            CORS, rate limit, CSRF origin check, route protection
src/app/auth/callback        exchanges the one-time code for a session
src/app/(auth)/              sign-in, sign-up, forgot, reset, check-email
src/app/(app)/               everything behind sign-in
```

Route groups carry the chrome: `(marketing)` has the public nav and footer, `(auth)` is a
single centred card with no nav, `(app)` has the signed-in header and calls
`requireSession()` in its layout.

## Security decisions

**`getUser()`, never `getSession()`, on the server.** `getSession()` reads the cookie and
trusts it. `getUser()` revalidates the token with Supabase. Middleware and every server
helper use `getUser()`.

**Two locks on protected routes.** Middleware redirects anonymous visitors, and the
`(app)` layout calls `requireSession()` again. Middleware can be bypassed by
misconfiguration; a server component cannot.

**CSRF.** Session cookies are `SameSite=Lax`, which already blocks a cross-site form POST.
Middleware adds a second check: any non-GET request must come from a known origin.
Verified with a `POST` carrying `Origin: https://evil.example` — 403.

**Brute force.** Five attempts per email per fifteen minutes, twenty per IP, on sign-in,
signup, magic link, password reset and OTP. Supabase applies its own limits on top.

**Enumeration.** A wrong password and an unknown address return the same message. Magic
link and password reset always report success. Signup succeeds even when the address is
taken, and the email explains what happened.

**Open redirect.** The `next` parameter is used only when it starts with a single `/`.
`//evil.com` and absolute URLs fall back to `/dashboard`.

**Passwords.** Minimum ten characters with mixed case and a digit — length first, since
forced symbols push people toward `Password1!`. Hashing is Supabase's (bcrypt); no
password ever reaches this codebase in storable form.

**Audit trail.** Sign-in, sign-out, signup, password change and phone verification each
write an `audit_logs` row with the actor, IP and user agent.

## Supabase project setup

1. **Authentication → Providers → Google.** Add the OAuth client ID and secret from Google
   Cloud Console. Authorised redirect URI:
   `https://<project>.supabase.co/auth/v1/callback`.
2. **Authentication → URL Configuration.** Site URL is your domain. Redirect allow list:
   `http://localhost:3000/auth/callback` and `https://yourdomain.com/auth/callback`.
3. **Authentication → Providers → Email.** Turn on "Confirm email". Leave signups enabled;
   the confirmation requirement is what keeps unverified accounts out.
4. **Authentication → Providers → Phone.** Connect an SMS provider (Twilio, or a local
   aggregator for Bangladeshi numbers). Without one, phone OTP fails and the rest of auth
   still works.
5. **Authentication → Settings.** Enable leaked-password protection. Set OTP expiry to
   3600 seconds or lower.
6. **Email templates.** Phase 11 replaces the defaults with branded templates; the default
   ones are fine until then.

Local `.env.local`:

```
NEXT_PUBLIC_SITE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The service role key is server-only. `src/lib/supabase/admin.ts` imports `server-only`, so
importing it from a client component fails the build rather than shipping the key.

## Verified in this phase

| Check                                | Result                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `/dashboard` while signed out        | 307 → `/sign-in?next=%2Fdashboard`                                                   |
| `/onboarding/phone` while signed out | 307 → `/sign-in?next=%2Fonboarding%2Fphone`                                          |
| `POST` with a foreign `Origin`       | 403, request never reaches the handler                                               |
| 61st request in a minute             | 429 with `Retry-After` and rate-limit headers                                        |
| Security headers on every response   | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Site with no Supabase keys           | marketing pages still render                                                         |

Sign-in against a real project cannot be exercised without Supabase credentials — run
through it once after step 6 above.

## What Phase 4 adds

`route()` gains a `roles` option, and `requireSession()` gains role assertions
(`requireOrgAdmin`, `requireFlatModerator`) checked against the memberships already loaded
in `getSession()`. The RLS policies from Phase 2 are the layer underneath both.
