import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isLabRole } from '@/lib/auth/middleware';

const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Sign a short-lived READ url for a QC photo in the private `qc-photos` bucket so
 * the lab UI can preview a just-uploaded photo. Lab-auth only. (The client
 * previously called this route, which did not exist — the 404 made successful
 * uploads report as failures.)
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isLabRole(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { path?: string } | null;
  if (!body?.path) return NextResponse.json({ error: 'Missing path' }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from('qc-photos')
    .createSignedUrl(body.path, SIGNED_URL_TTL_SECONDS);

  if (error || !data) return NextResponse.json({ error: 'Failed to sign preview URL' }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl });
}
