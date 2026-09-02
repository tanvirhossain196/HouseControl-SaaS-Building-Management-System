import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Where every verification link lands: Google OAuth, the email confirmation
 * link, the magic link and the password-reset link.
 *
 * Exchanges the one-time code for a session cookie, then forwards to `next`.
 * `next` is only ever a path on this site — an absolute URL here would be an
 * open redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/dashboard'
  const next =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  const errorDescription = searchParams.get('error_description')
  if (errorDescription) {
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent(errorDescription)}`,
    )
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`)
  }

  const supabase = createServerSupabase()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?reason=expired`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
