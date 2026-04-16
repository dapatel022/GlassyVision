const ADMIN_API_VERSION = '2025-01';

export async function adminFetch<T>(
  endpoint: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN!;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;
  const method = options.method || 'GET';

  const response = await fetch(
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

export async function updateInventoryLevel(
  inventoryItemId: string,
  locationId: string,
  quantity: number,
) {
  return adminFetch('inventory_levels/set.json', {
    method: 'POST',
    body: {
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available: quantity,
    },
  });
}

export async function createFulfillment(
  orderId: number,
  trackingNumber: string,
  trackingCompany: string,
  lineItemIds: number[],
) {
  return adminFetch(`orders/${orderId}/fulfillments.json`, {
    method: 'POST',
    body: {
      fulfillment: {
        tracking_number: trackingNumber,
        tracking_company: trackingCompany,
        line_items: lineItemIds.map((id) => ({ id })),
      },
    },
  });
}

export async function createRefund(
  orderId: number,
  amount: number,
  currency: string,
  note: string,
) {
  return adminFetch(`orders/${orderId}/refunds.json`, {
    method: 'POST',
    body: {
      refund: {
        currency,
        note,
        shipping: { amount: '0.00' },
        transactions: [{ kind: 'refund', amount: amount.toFixed(2) }],
      },
    },
  });
}
