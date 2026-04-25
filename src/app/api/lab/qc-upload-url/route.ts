import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/middleware';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null) as { jobId?: string; filename?: string; mimeType?: string } | null;
  if (!body?.jobId || !body.filename || !body.mimeType) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(body.mimeType)) {
    return NextResponse.json({ error: 'Unsupported type' }, { status: 400 });
  }

  const ext = body.filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  const storagePath = `${body.jobId}/${crypto.randomUUID()}.${ext}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from('qc-photos')
    .createSignedUploadUrl(storagePath);

  if (error || !data) return NextResponse.json({ error: 'Failed to sign upload' }, { status: 500 });

  return NextResponse.json({ signedUrl: data.signedUrl, storagePath, token: data.token });
}
