import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_EXPIRY_DAYS = 90;

function getSecret(): string {
  const secret = process.env.CLAIM_TOKEN_SECRET;
  if (!secret) throw new Error('CLAIM_TOKEN_SECRET is not set');
  return secret;
}

export function generateClaimToken(
  customerId: string,
  expiryDays: number = DEFAULT_EXPIRY_DAYS,
): { token: string; exp: number } {
  const exp = Date.now() + expiryDays * 24 * 60 * 60 * 1000;
  const token = createHmac('sha256', getSecret())
    .update(`${customerId}:${exp}`, 'utf-8')
    .digest('hex');
  return { token, exp };
}

export function verifyClaimToken(customerId: string, token: string, exp: number): boolean {
  if (!customerId || !token || !exp) return false;
  if (exp < Date.now()) return false;
  try {
    const expected = createHmac('sha256', getSecret())
      .update(`${customerId}:${exp}`, 'utf-8')
      .digest('hex');
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

export function buildClaimUrl(customerId: string, baseUrl: string): string {
  const { token, exp } = generateClaimToken(customerId);
  return `${baseUrl}/account/claim?cid=${customerId}&token=${token}&exp=${exp}`;
}
