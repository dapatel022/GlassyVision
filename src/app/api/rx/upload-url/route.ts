import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRxToken } from '@/features/rx-intake/lib/rx-token';

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf',
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_EXPIRY_SECONDS = 300;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    orderId?: string;
    lineItemId?: string;
    filename?: string;
    mimeType?: string;
    token?: string;
    exp?: number;
  } | null;

  if (!body?.orderId || !body.lineItemId || !body.filename || !body.mimeType || !body.token || !body.exp) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!verifyRxToken(body.orderId, body.token, body.exp)) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  if (!ALLOWED_TYPES.includes(body.mimeType)) {
    return NextResponse.json(
      { error: 'File type not allowed. Accepted: JPEG, PNG, HEIC, PDF' },
      { status: 400 },
    );
  }

  const ext = body.filename.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `${body.orderId}/${body.lineItemId}/${crypto.randomUUID()}.${ext}`;

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from('rx-files')
    .createSignedUploadUrl(storagePath);

  if (error) {
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    storagePath,
    token: data.token,
    maxSize: MAX_SIZE_BYTES,
    expiresIn: SIGNED_URL_EXPIRY_SECONDS,
  });
}
