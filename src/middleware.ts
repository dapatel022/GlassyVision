import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin and /lab routes
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/lab')) {
    return NextResponse.next();
  }

  // Check for auth cookie (Supabase stores JWT in cookies)
  const accessToken = request.cookies.get('sb-access-token')?.value;

  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/lab/:path*'],
};
