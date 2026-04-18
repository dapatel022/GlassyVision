import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_EXPIRY_DAYS = 30;

function getSecret(): string {
  const secret = process.env.RX_TOKEN_SECRET;
  if (!secret) throw new Error('RX_TOKEN_SECRET is not set');
  return secret;
}

export function generateRxToken(
  orderId: string,
  expiryDays: number = DEFAULT_EXPIRY_DAYS,
): { token: string; exp: number } {
  const exp = Date.now() + expiryDays * 24 * 60 * 60 * 1000;
  const payload = `${orderId}:${exp}`;
  const token = createHmac('sha256', getSecret())
    .update(payload, 'utf-8')
    .digest('hex');
  return { token, exp };
}

export function verifyRxToken(
  orderId: string,
  token: string,
  exp: number,
): boolean {
  if (!orderId || !token || !exp) return false;
  if (exp < Date.now()) return false;

  try {
    const payload = `${orderId}:${exp}`;
    const expected = createHmac('sha256', getSecret())
      .update(payload, 'utf-8')
      .digest('hex');

    return timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(token),
    );
  } catch {
    return false;
  }
}

export function parseRxTokenParams(
  params: URLSearchParams,
): { token: string; exp: number } | null {
  const token = params.get('token');
  const expStr = params.get('exp');

  if (!token || !expStr) return null;

  const exp = Number(expStr);
  if (isNaN(exp)) return null;

  return { token, exp };
}

export function buildRxUrl(orderId: string, baseUrl: string): string {
  const { token, exp } = generateRxToken(orderId);
  return `${baseUrl}/rx/${orderId}?token=${token}&exp=${exp}`;
}
