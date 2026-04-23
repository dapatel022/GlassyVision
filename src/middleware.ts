import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin and /lab routes
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/lab')) {
    return NextResponse.next();
  }

  // Supabase SSR stores the session in cookies named `sb-<project-ref>-auth-token`
  // (optionally split into `.0`/`.1` chunks for large tokens). Presence-check
  // only — the real role check runs in the page via getCurrentUser.
  const hasSupabaseSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'));

  if (!hasSupabaseSession) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/lab/:path*'],
};
