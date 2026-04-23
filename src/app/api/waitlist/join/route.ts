import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { email?: string; dropSlug?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  const dropSlug = body?.dropSlug?.trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!dropSlug) {
    return NextResponse.json({ error: 'dropSlug required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: drop } = await supabase
    .from('drops')
    .select('id')
    .eq('slug', dropSlug)
    .maybeSingle();

  if (!drop) {
    return NextResponse.json({ error: 'Drop not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('waitlist')
    .insert({ email, drop_id: drop.id, notify_when: 'launch' });

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ success: true, message: "You're already on the list." });
    }
    return NextResponse.json({ error: 'Could not join waitlist' }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "You're on the list." });
}
