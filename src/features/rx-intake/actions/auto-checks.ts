export interface RxTypedValues {
  odSphere: string;
  odCylinder: string;
  odAxis: string;
  odAdd?: string;
  osSphere: string;
  osCylinder: string;
  osAxis: string;
  osAdd?: string;
  pd: string;
  pdType: 'mono' | 'binocular';
  pdOd?: string;
  pdOs?: string;
}

export interface AutoCheckResult {
  field: string;
  passed: boolean;
  type: 'error' | 'warning';
  message: string;
}

interface RangeCheck {
  field: string;
  value: string;
  min: number;
  max: number;
  message: string;
  integer?: boolean;
}

function checkRange(check: RangeCheck): AutoCheckResult | null {
  if (!check.value.trim()) return null;

  const num = Number(check.value);
  if (isNaN(num)) {
    return {
      field: check.field,
      passed: false,
      type: 'warning',
      message: `${check.field}: value is not a number`,
    };
  }

  if (check.integer && !Number.isInteger(num)) {
    return {
      field: check.field,
      passed: false,
      type: 'warning',
      message: check.message,
    };
  }

  if (num < check.min || num > check.max) {
    return {
      field: check.field,
      passed: false,
      type: 'warning',
      message: check.message,
    };
  }

  return { field: check.field, passed: true, type: 'warning', message: '' };
}

export function validateTypedValues(
  values: RxTypedValues,
  expirationDate?: string,
): AutoCheckResult[] {
  const results: AutoCheckResult[] = [];

  const rangeChecks: RangeCheck[] = [
    { field: 'odSphere', value: values.odSphere, min: -20, max: 20, message: 'Sphere value looks unusual — please double-check' },
    { field: 'osSphere', value: values.osSphere, min: -20, max: 20, message: 'Sphere value looks unusual — please double-check' },
    { field: 'odCylinder', value: values.odCylinder, min: -6, max: 6, message: 'Cylinder value looks unusual — please double-check' },
    { field: 'osCylinder', value: values.osCylinder, min: -6, max: 6, message: 'Cylinder value looks unusual — please double-check' },
    { field: 'odAxis', value: values.odAxis, min: 0, max: 180, message: 'Axis must be between 0 and 180', integer: true },
    { field: 'osAxis', value: values.osAxis, min: 0, max: 180, message: 'Axis must be between 0 and 180', integer: true },
    { field: 'pd', value: values.pd, min: 50, max: 75, message: 'PD value looks unusual — please double-check' },
  ];

  for (const check of rangeChecks) {
    const result = checkRange(check);
    if (result) results.push(result);
  }

  if (expirationDate) {
    const expDate = new Date(expirationDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    if (expDate < now) {
      results.push({
        field: 'expirationDate',
        passed: false,
        type: 'error',
        message: 'This prescription appears to be expired',
      });
    } else {
      results.push({
        field: 'expirationDate',
        passed: true,
        type: 'error',
        message: '',
      });
    }
  }

  return results;
}

export interface ImageCheckResult {
  valid: boolean;
  width: number;
  height: number;
  format: string;
  errors: AutoCheckResult[];
}

export async function validateImage(
  buffer: Buffer,
  mimeType: string,
): Promise<ImageCheckResult> {
  const sharp = (await import('sharp')).default;
  const errors: AutoCheckResult[] = [];

  try {
    let image = sharp(buffer);
    const metadata = await image.metadata();

    if (mimeType === 'image/heic' || mimeType === 'image/heif') {
      image = sharp(buffer).jpeg({ quality: 90 });
      const converted = await image.toBuffer();
      const convertedMeta = await sharp(converted).metadata();
      return validateImageMetadata(convertedMeta, errors);
    }

    return validateImageMetadata(metadata, errors);
  } catch {
    errors.push({
      field: 'image',
      passed: false,
      type: 'error',
      message: "File doesn't appear to be a valid image",
    });
    return { valid: false, width: 0, height: 0, format: 'unknown', errors };
  }
}

function validateImageMetadata(
  metadata: { width?: number; height?: number; format?: string },
  errors: AutoCheckResult[],
): ImageCheckResult {
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const format = metadata.format || 'unknown';

  if (width < 600 || height < 400) {
    errors.push({
      field: 'resolution',
      passed: false,
      type: 'error',
      message: 'Image is too small to read — please take a clearer photo',
    });
  }

  return { valid: errors.length === 0, width, height, format, errors };
}
