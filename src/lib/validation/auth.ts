import { z } from 'zod'
import { bdPhone, email } from './common'

/**
 * Auth input rules. The same schemas run in the browser for instant feedback
 * and again on the server, because the browser copy can be skipped.
 */

/** Long over cryptic: length beats forced symbols for real-world strength. */
export const password = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(72, 'Passwords are limited to 72 characters.')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), 'Mix upper and lower case letters.')
  .refine((v) => /\d/.test(v), 'Include at least one number.')
  .refine((v) => !/^\s|\s$/.test(v), 'Remove the spaces at the start or end.')

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
})

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your name.').max(120),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Both passwords must match.',
    path: ['confirmPassword'],
  })

export const magicLinkSchema = z.object({ email })

export const forgotPasswordSchema = z.object({ email })

/** The six-digit code Supabase mails when the template asks for a token. */
export const resetCodeSchema = z.object({
  email,
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'The code is six digits.'),
})

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Both passwords must match.',
    path: ['confirmPassword'],
  })

export const phoneSchema = z.object({ phone: bdPhone })

export const otpSchema = z.object({
  phone: bdPhone,
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'The code is six digits.'),
})

export type SignInInput = z.infer<typeof signInSchema>
export type SignUpInput = z.infer<typeof signUpSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type ResetCodeInput = z.infer<typeof resetCodeSchema>
