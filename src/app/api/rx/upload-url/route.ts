import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf',
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_EXPIRY_SECONDS = 300;

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = cookieStore.get('rx_session')?.value;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { orderId, lineItemId, filename, mimeType } = body as {
    orderId: string;
    lineItemId: string;
    filename: string;
    mimeType: string;
  };

  if (!orderId || !lineItemId || !filename || !mimeType) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(mimeType)) {
    return NextResponse.json(
      { error: 'File type not allowed. Accepted: JPEG, PNG, HEIC, PDF' },
      { status: 400 },
    );
  }

  const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `${orderId}/${lineItemId}/${crypto.randomUUID()}.${ext}`;

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
