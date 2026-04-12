import { createHmac, timingSafeEqual } from 'crypto';

export function verifyShopifyWebhook(
  body: string,
  hmacHeader: string,
  secret: string,
): boolean {
  if (!hmacHeader || !body || !secret) return false;

  try {
    const computed = createHmac('sha256', secret)
      .update(body, 'utf-8')
      .digest('base64');

    return timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(hmacHeader),
    );
  } catch {
    return false;
  }
}
