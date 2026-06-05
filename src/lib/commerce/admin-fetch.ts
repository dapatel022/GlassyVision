import { fetchWithRetry } from './fetch-with-retry';

export const ADMIN_API_VERSION = '2025-01';

export async function adminFetch<T>(
  endpoint: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN!;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
  const method = options.method || 'GET';

  const response = await fetchWithRetry(
    `https://${domain}/admin/api/${ADMIN_API_VERSION}/${endpoint}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Admin API error: ${response.status} ${errorBody}`);
  }

  return response.json() as Promise<T>;
}
