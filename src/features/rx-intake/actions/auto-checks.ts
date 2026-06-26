import { isRxExpired } from '@/lib/rx/expiration';

export interface RxTypedValues {
  odSphere: string; odCylinder: string; odAxis: string; odAdd?: string;
  osSphere: string; osCylinder: string; osAxis: string; osAdd?: string;
  pd: string; pdType: 'mono' | 'binocular'; pdOd?: string; pdOs?: string;
  // Optional prism (Task 2.3 adds the prism-specific checks):
  odPrism?: string; osPrism?: string; odBase?: string; osBase?: string;
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

const VALID_BASES = ['up', 'down', 'in', 'out'];

function parseNum(v?: string): number | null {
  if (!v || !v.trim()) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Cross-field + advisory checks. All warnings — never block approval. */
function enrichedChecks(values: RxTypedValues): AutoCheckResult[] {
  const out: AutoCheckResult[] = [];
  const push = (field: string, message: string) => out.push({ field, passed: false, type: 'warning', message });

  for (const eye of ['od', 'os'] as const) {
    const add = parseNum(values[`${eye}Add`]);
    if (add !== null && (add < 0.5 || add > 3.5)) push(`${eye}Add`, 'Add power looks unusual (typical 0.50–3.50) — double-check');

    const cyl = parseNum(values[`${eye}Cylinder`]);
    const axisRaw = values[`${eye}Axis`];
    const axis = parseNum(axisRaw);
    if (cyl !== null && cyl !== 0 && (axis === null || axis === 0) && (!axisRaw || !axisRaw.trim())) {
      push(`${eye}Axis`, 'Cylinder is set but axis is missing — an axis is required with cylinder');
    }
    if ((axis !== null && axis !== 0) && (cyl === null || cyl === 0)) {
      push(`${eye}Cylinder`, 'Axis is set but cylinder is missing — confirm the cylinder value');
    }

    const sph = parseNum(values[`${eye}Sphere`]);
    if ((sph !== null && Math.abs(sph) >= 4) || (cyl !== null && Math.abs(cyl) >= 2)) {
      push(`${eye}HighIndex`, 'Strong correction — a high-index lens is recommended for thinner, lighter lenses');
    }

    const prism = parseNum(values[`${eye}Prism`]);
    const baseDir = (values[`${eye}Base`] ?? '').trim().toLowerCase();
    if (prism !== null && prism !== 0) {
      if (!baseDir) push(`${eye}Base`, 'Prism amount is set but base direction is missing');
      else if (!VALID_BASES.includes(baseDir)) push(`${eye}Base`, 'Base direction must be up, down, in, or out');
      if (prism > 6) push(`${eye}Prism`, 'Prism amount is unusually high (>6Δ) — please confirm');
    } else if (baseDir && VALID_BASES.includes(baseDir)) {
      push(`${eye}Prism`, 'Base direction is set but prism amount is missing');
    }
  }

  const odS = parseNum(values.odSphere);
  const osS = parseNum(values.osSphere);
  if (odS !== null && osS !== null && Math.abs(odS - osS) > 3) {
    push('anisometropia', 'Large difference between eyes (>3.00D) — please double-check both values');
  }
  return out;
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

  results.push(...enrichedChecks(values));

  if (expirationDate) {
    const expired = isRxExpired(expirationDate);
    results.push({
      field: 'expirationDate',
      passed: !expired,
      type: 'error',
      message: expired ? 'This prescription appears to be expired' : '',
    });
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
