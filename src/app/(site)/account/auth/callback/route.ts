import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { linkCustomerByVerifiedEmail } from '@/features/account/actions/link-customer';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next') || '/account';
  // Only allow same-origin relative paths — reject open-redirect families
  // (`//host`, `/\host`, scheme-relative or absolute URLs).
  const safeNext =
    nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/\\')
      ? nextParam
      : '/account';

  if (code) {
    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // The email is now verified by Supabase, so bind any unclaimed customer
      // rows for it to this user — a token-free, leak-proof account claim.
      if (data.user?.id && data.user.email) {
        await linkCustomerByVerifiedEmail(data.user.id, data.user.email);
      }
      return NextResponse.redirect(new URL(safeNext, origin));
    }
  }
  return NextResponse.redirect(new URL('/account/login?error=auth', origin));
}
