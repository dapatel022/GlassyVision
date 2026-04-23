'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { createHash } from 'crypto';
import type { Json } from '@/lib/supabase/types';
import { validateTypedValues, validateImage, type RxTypedValues, type AutoCheckResult } from './auto-checks';

export interface SubmitRxInput {
  orderId: string;
  lineItemId: string;
  storagePath: string;
  mimeType: string;
  certificationChecked: boolean;
  typedValues: RxTypedValues | null;
  expirationDate: string | null;
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
    .select('customer_email')
    .eq('id', input.orderId)
    .single();

  if (orderError || !order) {
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
      typed_pd: input.typedValues?.pd || null,
      typed_pd_type: input.typedValues?.pdType || null,
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

  return {
    success: true,
    rxFileId: rxFile.id,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
