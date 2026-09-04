'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabase, requireUser } from '@/lib/supabase/server'
import { publicEnv } from '@/lib/env'
import { rateLimit } from '@/lib/rate-limit'
import { writeAuditLog } from '@/services/audit.service'
import {
  forgotPasswordSchema,
  magicLinkSchema,
  otpSchema,
  phoneSchema,
  resetCodeSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '@/lib/validation/auth'
import type { ActionResult } from '@/types'
import { z } from 'zod'

/**
 * Every auth flow, as server actions.
 *
 * Rules that hold across all of them:
 * - Sessions are Supabase's httpOnly, SameSite=Lax cookies. No token ever
 *   touches localStorage, so an XSS bug cannot read a session.
 * - Passwords are hashed by Supabase (bcrypt) and never reach this codebase
 *   in storable form.
 * - Failures are deliberately vague about whether an account exists.
 * - Attempts are rate limited per IP and per email.
 */

type Result<T = null> = ActionResult<T>

function clientIp() {
  const forwarded = headers().get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() ?? 'unknown'
}

function siteUrl(path: string) {
  return new URL(path, publicEnv().NEXT_PUBLIC_SITE_URL).toString()
}

/** Brute-force guard: 5 attempts per identifier per 15 minutes. */
function throttle<T>(
  scope: string,
  identifier: string,
): Extract<Result<T>, { ok: false }> | null {
  const perIdentifier = rateLimit(`${scope}:${identifier}`, 5, 15 * 60_000)
  const perIp = rateLimit(`${scope}:ip:${clientIp()}`, 20, 15 * 60_000)

  if (!perIdentifier.allowed || !perIp.allowed) {
    return { ok: false, error: 'Too many attempts. Wait 15 minutes and try again.' }
  }
  return null
}

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form'
    ;(fields[key] ??= []).push(issue.message)
  }
  return fields
}

function invalid<T>(error: z.ZodError): Extract<Result<T>, { ok: false }> {
  return { ok: false, error: 'Some fields need fixing.', fieldErrors: fieldErrors(error) }
}

// ---------------------------------------------------------------------------
// Google — the primary path. Email is verified by Google, so these accounts
// skip the verification step entirely.
// ---------------------------------------------------------------------------
export async function signInWithGoogle(next = '/dashboard'): Promise<Result> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(next)}`),
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })

  if (error || !data.url) {
    return { ok: false, error: 'Google sign-in is unavailable right now.' }
  }

  redirect(data.url)
}

// ---------------------------------------------------------------------------
// Email + password
// ---------------------------------------------------------------------------
export async function signUpWithPassword(
  input: unknown,
): Promise<Result<{ email: string }>> {
  const parsed = signUpSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const limited = throttle('signup', parsed.data.email)
  if (limited) return limited

  const supabase = createServerSupabase()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: siteUrl('/auth/callback?next=/onboarding/phone'),
    },
  })

  if (error) {
    // 'User already registered' would confirm an address exists. Return the
    // same message as a successful signup and let the email do the work.
    if (error.status === 429) {
      return { ok: false, error: 'Too many attempts. Try again in a few minutes.' }
    }
    if (!/already/i.test(error.message)) {
      return { ok: false, error: 'We could not create the account. Try again.' }
    }
  }

  // Supabase returns a user with no identities when the address is taken.
  const isExisting = data.user?.identities?.length === 0
  if (!isExisting && data.user) {
    await writeAuditLog({
      actorId: data.user.id,
      action: 'auth.signed_up',
      entityType: 'user',
      entityId: data.user.id,
      ip: clientIp(),
    })
  }

  return { ok: true, data: { email: parsed.data.email } }
}

export async function signInWithPassword(input: unknown): Promise<Result> {
  const parsed = signInSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const limited = throttle('signin', parsed.data.email)
  if (limited) return limited

  const supabase = createServerSupabase()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    if (/email not confirmed/i.test(error.message)) {
      return {
        ok: false,
        error: 'Confirm your email first. Check your inbox for the verification link.',
      }
    }
    // One message for wrong password and unknown address alike.
    return { ok: false, error: 'That email and password do not match.' }
  }

  await writeAuditLog({
    actorId: data.user.id,
    action: 'auth.signed_in',
    entityType: 'user',
    entityId: data.user.id,
    ip: clientIp(),
    userAgent: headers().get('user-agent'),
  })

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}

// ---------------------------------------------------------------------------
// Magic link — no password at all, and verification is built in.
// ---------------------------------------------------------------------------
export async function sendMagicLink(input: unknown): Promise<Result<{ email: string }>> {
  const parsed = magicLinkSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const limited = throttle('magiclink', parsed.data.email)
  if (limited) return limited

  const supabase = createServerSupabase()
  await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: siteUrl('/auth/callback?next=/dashboard'),
    },
  })

  // Always report success: whether the address exists is not ours to reveal.
  return { ok: true, data: { email: parsed.data.email } }
}

// ---------------------------------------------------------------------------
// Password reset. Supabase issues a single-use token that expires; the reset
// page runs inside the recovery session it creates.
// ---------------------------------------------------------------------------
export async function requestPasswordReset(
  input: unknown,
): Promise<Result<{ email: string }>> {
  const parsed = forgotPasswordSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const limited = throttle('reset', parsed.data.email)
  if (limited) return limited

  const supabase = createServerSupabase()
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: siteUrl('/auth/callback?next=/reset-password'),
  })

  return { ok: true, data: { email: parsed.data.email } }
}

/**
 * Checks the six-digit code from the reset email.
 *
 * Supabase decides between a link and a code by what the email template
 * contains: with `{{ .Token }}` in it, the same `resetPasswordForEmail` call
 * mails a code instead of a link. Both paths land in the same place — a
 * short-lived recovery session — so `/reset-password` does not care which
 * one was used.
 *
 * The code is `type: 'recovery'`, not `'email'`. A signup confirmation code
 * would verify an address; this one grants a password change, and mixing
 * them up would let an unconfirmed signup reset somebody's password.
 */
export async function verifyResetCode(input: unknown): Promise<Result> {
  const parsed = resetCodeSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const limited = throttle('reset-code', parsed.data.email)
  if (limited) return limited

  const supabase = createServerSupabase()
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: 'recovery',
  })

  if (error || !data.user) {
    // One message for a wrong code and an expired one: telling them apart
    // would say whether that address has a reset in flight.
    return { ok: false, error: 'That code is wrong or has expired. Ask for a new one.' }
  }

  await writeAuditLog({
    actorId: data.user.id,
    action: 'auth.reset_code_verified',
    entityType: 'user',
    entityId: data.user.id,
    ip: clientIp(),
  })

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}

export async function updatePassword(input: unknown): Promise<Result> {
  const parsed = resetPasswordSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { ok: false, error: 'This reset link has expired. Request a new one.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { ok: false, error: 'We could not update the password. Request a new link.' }
  }

  await writeAuditLog({
    actorId: user.id,
    action: 'auth.password_changed',
    entityType: 'user',
    entityId: user.id,
    ip: clientIp(),
  })

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}

// ---------------------------------------------------------------------------
// Phone verification. Needed before a person can hold a moderator role, since
// Phase 8 sends the handover OTP to this number.
// ---------------------------------------------------------------------------
export async function sendPhoneOtp(input: unknown): Promise<Result<{ phone: string }>> {
  const parsed = phoneSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const user = await requireUser()
  const limited = throttle('phone-otp', user.id)
  if (limited) return limited

  const supabase = createServerSupabase()
  const { error } = await supabase.auth.updateUser({ phone: parsed.data.phone })

  if (error) {
    if (/already/i.test(error.message)) {
      return { ok: false, error: 'That number is already linked to another account.' }
    }
    return {
      ok: false,
      error: 'We could not send the code. Check the number and try again.',
    }
  }

  return { ok: true, data: { phone: parsed.data.phone } }
}

export async function verifyPhoneOtp(input: unknown): Promise<Result> {
  const parsed = otpSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  const user = await requireUser()
  const limited = throttle('phone-verify', user.id)
  if (limited) return limited

  const supabase = createServerSupabase()
  const { error } = await supabase.auth.verifyOtp({
    phone: parsed.data.phone,
    token: parsed.data.token,
    type: 'phone_change',
  })

  if (error) {
    return { ok: false, error: 'That code is wrong or has expired. Ask for a new one.' }
  }

  await supabase
    .from('profiles')
    .update({ phone: parsed.data.phone, phone_verified_at: new Date().toISOString() })
    .eq('id', user.id)

  await writeAuditLog({
    actorId: user.id,
    action: 'auth.phone_verified',
    entityType: 'user',
    entityId: user.id,
    ip: clientIp(),
  })

  revalidatePath('/', 'layout')
  return { ok: true, data: null }
}

// ---------------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------------
export async function signOut() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase.auth.signOut()

  if (user) {
    await writeAuditLog({
      actorId: user.id,
      action: 'auth.signed_out',
      entityType: 'user',
      entityId: user.id,
      ip: clientIp(),
    })
  }

  revalidatePath('/', 'layout')
  redirect('/sign-in')
}
