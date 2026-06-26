'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { createHash } from 'crypto';
import type { Json } from '@/lib/supabase/types';
import { verifyRxToken } from '../lib/rx-token';
import { validateTypedValues, validateImage, type RxTypedValues, type AutoCheckResult } from './auto-checks';
import { sendOrderEmailOnce } from '@/lib/email/transactional';
import { renderRxReceived } from '@/lib/email/templates/rx-received';

export interface SubmitRxInput {
  /** Order DB UUID — used to query orders/line items. */
  orderId: string;
  /** Public order number the Rx token is signed over (binds the request to the link). */
  publicOrderId: string;
  /** HMAC Rx token + expiry from the upload link. */
  token: string;
  exp: number;
  lineItemId: string;
  storagePath: string;
  mimeType: string;
  certificationChecked: boolean;
  typedValues: RxTypedValues | null;
  /** Provenance of the typed values: 'ocr' if auto-read from the image then confirmed. */
  typedValuesSource?: 'manual' | 'ocr';
  expirationDate: string | null;
}

function authError(message: string): SubmitRxResult {
  return { success: false, errors: [{ field: 'auth', passed: false, type: 'error', message }] };
}

export interface SubmitRxResult {
  success: boolean;
  rxFileId?: string;
  errors?: AutoCheckResult[];
  warnings?: AutoCheckResult[];
}

function extractIp(h: Headers): string {
  const forwardedFor = h.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return h.get('x-real-ip') || 'unknown';
}

export async function submitRx(input: SubmitRxInput): Promise<SubmitRxResult> {
  // Auth: this writes the compliance record and flips rx_status, so it must
  // re-verify the same HMAC token the page checked — never trust a bare orderId
  // (which would be an IDOR on the order UUID). The token is signed over the
  // public order number, so we bind everything to that below.
  if (!verifyRxToken(input.publicOrderId, input.token, input.exp)) {
    return authError('Invalid or expired upload link');
  }

  // Bind the uploaded file to this order: upload-url mints the path as
  // `${publicOrderId}/${lineItemId}/…` after verifying the token, so a path that
  // does not start with this order's prefix means a cross-order attach attempt.
  if (!input.storagePath.startsWith(`${input.publicOrderId}/`)) {
    return authError('Invalid upload reference');
  }

  const errors: AutoCheckResult[] = [];
  const warnings: AutoCheckResult[] = [];

  if (!input.certificationChecked) {
    errors.push({
      field: 'certification',
      passed: false,
      type: 'error',
      message: 'You must certify your prescription is current',
    });
  }

  if (input.typedValues) {
    const tvResults = validateTypedValues(input.typedValues, input.expirationDate || undefined);
    for (const r of tvResults) {
      if (!r.passed) {
        if (r.type === 'error') errors.push(r);
        else warnings.push(r);
      }
    }
  } else if (input.expirationDate) {
    const expResults = validateTypedValues(
      { odSphere: '', odCylinder: '', odAxis: '', osSphere: '', osCylinder: '', osAxis: '', pd: '', pdType: 'binocular' },
      input.expirationDate,
    );
    for (const r of expResults) {
      if (!r.passed && r.type === 'error') errors.push(r);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors, warnings };
  }

  const supabase = createAdminClient();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('customer_email, shopify_order_number')
    .eq('id', input.orderId)
    .single();

  // The order UUID must resolve to the same order the token was signed over.
  if (orderError || !order || order.shopify_order_number !== input.publicOrderId) {
    errors.push({
      field: 'order',
      passed: false,
      type: 'error',
      message: 'Order not found',
    });
    return { success: false, errors };
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from('rx-files')
    .download(input.storagePath);

  if (downloadError || !fileData) {
    errors.push({
      field: 'image',
      passed: false,
      type: 'error',
      message: 'Upload failed — please try again',
    });
    return { success: false, errors };
  }

  const buffer = Buffer.from(await fileData.arrayBuffer());
  const fileSize = buffer.length;
  const checksum = createHash('sha256').update(buffer).digest('hex');

  if (input.mimeType !== 'application/pdf') {
    const imageResult = await validateImage(buffer, input.mimeType);
    if (!imageResult.valid) {
      errors.push(...imageResult.errors);
      return { success: false, errors };
    }
  }

  const h = await headers();
  const ip = extractIp(h);
  const userAgent = h.get('user-agent') || 'unknown';

  const originalFilename = input.storagePath.split('/').pop() || 'unknown';

  const { data: rxFile, error: insertError } = await supabase
    .from('rx_files')
    .insert({
      order_id: input.orderId,
      line_item_id: input.lineItemId,
      customer_email: order.customer_email,
      storage_path: input.storagePath,
      original_filename: originalFilename,
      file_size: fileSize,
      mime_type: input.mimeType,
      typed_od_sphere: input.typedValues?.odSphere || null,
      typed_od_cylinder: input.typedValues?.odCylinder || null,
      typed_od_axis: input.typedValues?.odAxis || null,
      typed_od_add: input.typedValues?.odAdd || null,
      typed_os_sphere: input.typedValues?.osSphere || null,
      typed_os_cylinder: input.typedValues?.osCylinder || null,
      typed_os_axis: input.typedValues?.osAxis || null,
      typed_os_add: input.typedValues?.osAdd || null,
      typed_od_prism: input.typedValues?.odPrism || null,
      typed_os_prism: input.typedValues?.osPrism || null,
      typed_od_base: input.typedValues?.odBase || null,
      typed_os_base: input.typedValues?.osBase || null,
      typed_pd: input.typedValues?.pd || null,
      typed_pd_type: input.typedValues?.pdType || null,
      typed_values_source: input.typedValues ? (input.typedValuesSource ?? 'manual') : null,
      rx_expiration_date: input.expirationDate || null,
      certification_checked: input.certificationChecked,
      auto_check_results: { warnings } as unknown as Json,
      checksum_sha256: checksum,
      scan_quality_score: null,
      uploaded_by_ip: ip,
      uploaded_by_user_agent: userAgent,
    })
    .select('id')
    .single();

  if (insertError) {
    errors.push({
      field: 'submit',
      passed: false,
      type: 'error',
      message: 'Failed to save prescription — please try again',
    });
    return { success: false, errors };
  }

  await supabase
    .from('orders')
    .update({ rx_status: 'uploaded_pending_review' as const })
    .eq('id', input.orderId);

  // Best-effort: confirm to the customer that the upload landed and is queued for
  // manual review. Deduped on (order_id, 'rx_received'); never gates the upload.
  if (order.customer_email && order.customer_email !== 'no-email@shopify.com') {
    try {
      await sendOrderEmailOnce({
        supabase,
        orderId: input.orderId,
        customerEmail: order.customer_email,
        type: 'rx_received',
        rendered: renderRxReceived({ orderNumber: order.shopify_order_number }),
      });
    } catch (e) {
      console.error('[submit-rx] rx_received email failed', { orderId: input.orderId, error: e });
    }
  }

  return {
    success: true,
    rxFileId: rxFile.id,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
