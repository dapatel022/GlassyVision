import { fetchWithRetry } from './fetch-with-retry';
import { adminFetch, ADMIN_API_VERSION } from './admin-fetch';

export { adminFetch };

/**
 * Extracts the `page_info` cursor for the next page from a Shopify REST
 * `Link` header, e.g. `<https://x/orders.json?page_info=ABC&limit=250>; rel="next"`.
 * Returns null when there is no next page.
 */
export function parseNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    if (!/rel="next"/.test(part)) continue;
    const match = part.match(/[?&]page_info=([^&>]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

/** GET an Admin REST endpoint and return the body plus the next-page cursor. */
export async function adminFetchPage<T>(endpoint: string): Promise<{ data: T; nextPageInfo: string | null }> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN!;
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN!;

  const response = await fetchWithRetry(
    `https://${domain}/admin/api/${ADMIN_API_VERSION}/${endpoint}`,
    { method: 'GET', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token } },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Admin API error: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as T;
  return { data, nextPageInfo: parseNextPageInfo(response.headers.get('link')) };
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

interface FulfillmentOrderLineItem {
  id: number;
  line_item_id: number;
  quantity: number;
}
interface FulfillmentOrder {
  id: number;
  status: string;
  line_items: FulfillmentOrderLineItem[];
}
interface FulfillmentOrdersResponse {
  fulfillment_orders: FulfillmentOrder[];
}

/**
 * Create a Shopify fulfillment with tracking, scoped to the given order line
 * item ids (empty = the whole order).
 *
 * Uses the fulfillment-orders flow: the legacy order-scoped endpoint
 * `POST /orders/{id}/fulfillments.json` was REMOVED in Admin API 2023-04, so on
 * any modern version it 404s and the customer never gets a tracking email. We
 * first resolve the order's open fulfillment orders, then create a fulfillment
 * referencing only the matching fulfillment-order line items. `notify_customer`
 * triggers Shopify's shipment notification.
 */
export async function createFulfillment(
  orderId: number,
  trackingNumber: string,
  trackingCompany: string,
  lineItemIds: number[],
) {
  const { fulfillment_orders: fulfillmentOrders } = await adminFetch<FulfillmentOrdersResponse>(
    `orders/${orderId}/fulfillment_orders.json`,
  );

  const target = lineItemIds.length > 0 ? new Set(lineItemIds) : null;
  const OPEN_STATUSES = new Set(['open', 'in_progress', 'scheduled']);

  const lineItemsByFulfillmentOrder = (fulfillmentOrders ?? [])
    .filter((fo) => OPEN_STATUSES.has(fo.status))
    .map((fo) => ({
      fulfillment_order_id: fo.id,
      fulfillment_order_line_items: (fo.line_items ?? [])
        .filter((li) => (target ? target.has(li.line_item_id) : true))
        .map((li) => ({ id: li.id, quantity: li.quantity })),
    }))
    .filter((entry) => entry.fulfillment_order_line_items.length > 0);

  if (lineItemsByFulfillmentOrder.length === 0) {
    throw new Error(`No fulfillable line items found for order ${orderId}`);
  }

  return adminFetch('fulfillments.json', {
    method: 'POST',
    body: {
      fulfillment: {
        line_items_by_fulfillment_order: lineItemsByFulfillmentOrder,
        tracking_info: { number: trackingNumber, company: trackingCompany },
        notify_customer: true,
      },
    },
  });
}

/**
 * Ask Shopify what a refund of `amount` against `orderId` would look like.
 * Returns the suggested `shipping` and the `suggested_refund` transaction(s)
 * so we never hardcode shipping=0 or over-refund past what is captured.
 */
export async function calculateRefund(orderId: number, amount: number, currency: string) {
  // Shopify expects uppercase ISO currency ('USD'/'CAD'); our DB stores lowercase.
  return adminFetch(`orders/${orderId}/refunds/calculate.json`, {
    method: 'POST',
    body: { refund: { currency: currency.toUpperCase(), shipping: { full_refund: false }, transactions: [{ kind: 'refund' }] } },
  }) as Promise<{
    refund: {
      shipping?: { amount: string };
      transactions: Array<{ kind: string; amount: string; parent_id?: number; gateway?: string }>;
    };
  }>;
}

/**
 * The order's ORIGINAL captured amount — the sum of all `success` `capture`/`sale`
 * transactions (money actually captured), BEFORE subtracting any prior refunds.
 *
 * This is the correct pro-rata BASE for per-pair refunds: `refunds/calculate.json`'s
 * `suggested_refund.amount` is the REMAINING refundable (captured minus already-
 * refunded), which understates what unredeemed pairs are owed once a partial refund
 * has been issued. The remaining-refundable still acts as the CAP inside
 * `createRefund`, so over-refunding is impossible.
 *
 * Falls back to the order's `total_price` when no capture/sale transactions are
 * present (e.g. a gateway that reports captures differently). Rounds to 2 decimals.
 */
export async function getCapturedAmount(orderId: number, currency: string): Promise<number> {
  void currency; // captured amount is in the order's own currency
  const { transactions } = await adminFetch<{
    transactions?: Array<{ kind: string; status: string; amount: string }>;
  }>(`orders/${orderId}/transactions.json`);

  const captured = (transactions ?? [])
    .filter((t) => t.status === 'success' && (t.kind === 'capture' || t.kind === 'sale'))
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  if (captured > 0) {
    return Math.round(captured * 100) / 100;
  }

  // Fallback: no capture/sale transactions found — use the order total.
  const { order } = await adminFetch<{ order?: { total_price?: string } }>(
    `orders/${orderId}.json?fields=total_price`,
  );
  const total = order?.total_price ? parseFloat(order.total_price) : 0;
  return Math.round(total * 100) / 100;
}

export async function createRefund(
  orderId: number,
  amount: number,
  currency: string,
  note: string,
) {
  const calc = await calculateRefund(orderId, amount, currency);
  const suggested =
    calc.refund.transactions.find((t) => t.kind === 'suggested_refund') ?? calc.refund.transactions[0];
  const suggestedAmount = suggested ? parseFloat(suggested.amount) : Infinity;
  if (amount > suggestedAmount + 0.001) {
    throw new Error(`refund amount ${amount} exceeds refundable ${suggestedAmount} for order ${orderId}`);
  }
  return adminFetch(`orders/${orderId}/refunds.json`, {
    method: 'POST',
    body: {
      refund: {
        currency: currency.toUpperCase(),
        note,
        shipping: calc.refund.shipping ?? { amount: '0.00' },
        transactions: [
          {
            kind: 'refund',
            amount: amount.toFixed(2),
            parent_id: suggested?.parent_id,
            gateway: suggested?.gateway,
          },
        ],
      },
    },
  });
}
