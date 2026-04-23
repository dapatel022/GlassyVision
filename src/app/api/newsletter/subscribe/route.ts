import { NextRequest, NextResponse } from 'next/server';

// NOTE: Newsletter persistence is deferred until Resend/ConvertKit integration lands.
// For now this endpoint accepts the email and returns success so the UI works end-to-end.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  return NextResponse.json({ success: true, message: 'Thanks — see you in your inbox.' });
}
