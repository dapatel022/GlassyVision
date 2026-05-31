import { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '../supabase/types';
import { generateRxToken } from '@/features/rx-intake/lib/rx-token';
import { renderRxReminder } from '../email/templates/rx-reminder';
import { sendEmail } from '../email/resend';

type OrderFinancialStatus = Database['public']['Enums']['order_financial_status'];
type OrderFulfillmentStatus = Database['public']['Enums']['order_fulfillment_status'];
type RxStatus = Database['public']['Enums']['rx_status'];

export interface SyncOrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

// Subset of the Shopify Order webhook/Admin payload that this sync consumes.
interface ShopifyAttribute { name: string; value: string }
interface ShopifyAddress { first_name?: string; last_name?: string; country_code?: string }
interface ShopifyCustomer {
  id?: number | null;
  email?: string;
  first_name?: string;
  last_name?: string;
  total_spent?: number | string;
  orders_count?: number;
}
interface ShopifyLineItem {
  id: number;
  product_id?: number | null;
  variant_id?: number | null;
  title: string;
  variant_title?: string | null;
  sku?: string | null;
  quantity?: number | string;
  price?: number | string;
  properties?: ShopifyAttribute[];
}
export interface ShopifyOrderPayload {
  id?: number;
  name?: string;
  order_number?: number | string;
  email?: string;
  customer?: ShopifyCustomer;
  billing_address?: ShopifyAddress;
  shipping_address?: ShopifyAddress;
  created_at?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  currency?: string;
  subtotal_price?: number | string;
  total_price?: number | string;
  total_tax?: number | string;
  shipping_lines?: Array<{ price?: number | string }>;
  discount_codes?: Array<{ code?: string }>;
  note_attributes?: ShopifyAttribute[];
  line_items?: ShopifyLineItem[];
}

type LineItemInsert = Omit<Database['public']['Tables']['order_line_items']['Insert'], 'order_id'>;

export async function syncShopifyOrder(
  payload: ShopifyOrderPayload,
  supabase: SupabaseClient<Database>
): Promise<SyncOrderResult> {
  try {
    const shopifyOrderId = payload.id;
    if (!shopifyOrderId) {
      return { success: false, error: 'Missing shopify_order_id (payload.id)' };
    }

    const shopifyOrderNumber = String(payload.name || payload.order_number || payload.id);
    const customerEmail = payload.email || payload.customer?.email || 'no-email@shopify.com';

    // 1. Sync Customer
    let customerUuid: string | null = null;
    const customerPayload = payload.customer;

    if (customerPayload || customerEmail) {
      const shopifyCustomerId = customerPayload?.id || null;
      const firstName = customerPayload?.first_name || payload.billing_address?.first_name || payload.shipping_address?.first_name || '';
      const lastName = customerPayload?.last_name || payload.billing_address?.last_name || payload.shipping_address?.last_name || '';
      const lifetimeValue = customerPayload ? Number(customerPayload.total_spent || 0) : Number(payload.total_price || 0);
      const totalOrders = customerPayload ? Number(customerPayload.orders_count || 1) : 1;

      // Check by shopify_customer_id first if available
      let existingCustomer = null;
      if (shopifyCustomerId) {
        const { data: byId } = await supabase
          .from('customers')
          .select('id')
          .eq('shopify_customer_id', shopifyCustomerId)
          .maybeSingle();
        existingCustomer = byId;
      }

      if (!existingCustomer && customerEmail) {
        // Fallback check by email
        const { data: byEmail } = await supabase
          .from('customers')
          .select('id')
          .eq('email', customerEmail)
          .maybeSingle();
        existingCustomer = byEmail;
      }

      const customerObj = {
        shopify_customer_id: shopifyCustomerId,
        email: customerEmail,
        first_name: firstName,
        last_name: lastName,
        lifetime_value: lifetimeValue,
        total_orders: totalOrders,
        last_order_at: payload.created_at || new Date().toISOString(),
      };

      if (existingCustomer) {
        const { data: updated, error: updateErr } = await supabase
          .from('customers')
          .update(customerObj)
          .eq('id', existingCustomer.id)
          .select('id')
          .single();

        if (updateErr) {
          console.error('[sync] Failed to update customer', updateErr);
        } else {
          customerUuid = updated.id;
        }
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('customers')
          .insert(customerObj)
          .select('id')
          .single();

        if (insertErr) {
          console.error('[sync] Failed to insert customer', insertErr);
        } else {
          customerUuid = inserted.id;
        }
      }
    }

    // 2. Map Financial & Fulfillment Statuses
    let financialStatus: OrderFinancialStatus = 'pending';
    if (payload.financial_status === 'paid') {
      financialStatus = 'paid';
    } else if (payload.financial_status === 'refunded') {
      financialStatus = 'refunded';
    } else if (payload.financial_status === 'partially_refunded') {
      financialStatus = 'partial_refund';
    } else if (payload.financial_status === 'pending') {
      financialStatus = 'pending';
    }

    let fulfillmentStatus: OrderFulfillmentStatus = 'unfulfilled';
    if (payload.fulfillment_status === 'fulfilled') {
      fulfillmentStatus = 'shipped';
    }

    // 3. Extract billing country & currency
    const billingCountryCode = payload.billing_address?.country_code || payload.shipping_address?.country_code;
    const billingCountry: 'us' | 'ca' | null =
      billingCountryCode?.toLowerCase() === 'us' ? 'us' :
      billingCountryCode?.toLowerCase() === 'ca' ? 'ca' : null;

    const currencyCode = payload.currency?.toLowerCase();
    const currency: 'usd' | 'cad' = currencyCode === 'cad' ? 'cad' : 'usd';

    // 4. Parse UTM parameters
    let utmSource: string | null = null;
    let utmMedium: string | null = null;
    let utmCampaign: string | null = null;

    const noteAttributes = payload.note_attributes || [];
    if (Array.isArray(noteAttributes)) {
      for (const attr of noteAttributes) {
        if (attr.name === 'utm_source') utmSource = attr.value;
        if (attr.name === 'utm_medium') utmMedium = attr.value;
        if (attr.name === 'utm_campaign') utmCampaign = attr.value;
      }
    }

    // 5. Check Line Items for Rx requirements
    let hasRxItems = false;
    const lineItemsToInsert: LineItemInsert[] = [];

    const lineItems = payload.line_items || [];
    for (const item of lineItems) {
      const properties = item.properties || [];
      let isRxRequired = false;
      let frameShape: string | null = null;
      let frameColor: string | null = null;
      let frameSize: string | null = null;

      // Scan properties array
      if (Array.isArray(properties)) {
        for (const prop of properties) {
          const name = String(prop.name).toLowerCase();
          const value = String(prop.value).toLowerCase();

          if (name === 'lenstype' || name === '_lenstype') {
            if (value === 'single_vision' || value === 'progressive') {
              isRxRequired = true;
            }
          }
          if (name === 'is_rx_required') {
            if (value === 'true' || value === 'yes' || value === '1') {
              isRxRequired = true;
            }
          }
          if (name === 'frameshape') frameShape = prop.value;
          if (name === 'framecolor') frameColor = prop.value;
          if (name === 'framesize') frameSize = prop.value;
        }
      }

      // If properties didn't list frame values, try parsing variant_title (e.g. "Bombay Round / Tortoise / Medium")
      if (item.variant_title && (!frameColor || !frameSize)) {
        const parts = item.variant_title.split('/').map((s: string) => s.trim());
        if (parts.length >= 2) {
          if (!frameColor) frameColor = parts[0];
          if (!frameSize) frameSize = parts[1];
        }
      }

      if (isRxRequired) {
        hasRxItems = true;
      }

      lineItemsToInsert.push({
        shopify_line_item_id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        product_title: item.title,
        variant_title: item.variant_title || null,
        sku: item.sku || null,
        quantity: Number(item.quantity || 1),
        unit_price: Number(item.price || 0),
        line_total: Number(item.price || 0) * Number(item.quantity || 1),
        is_rx_required: isRxRequired,
        frame_shape: frameShape,
        frame_color: frameColor,
        frame_size: frameSize,
      });
    }

    const rxStatus: RxStatus = hasRxItems ? 'awaiting_upload' : 'none';

    // 6. Sync Order in Database
    const orderObj = {
      shopify_order_id: shopifyOrderId,
      shopify_order_number: shopifyOrderNumber,
      customer_id: customerUuid,
      customer_email: customerEmail,
      customer_name: customerPayload ? `${customerPayload.first_name || ''} ${customerPayload.last_name || ''}`.trim() : '',
      shipping_address: (payload.shipping_address ?? null) as Json,
      billing_country: billingCountry,
      currency,
      subtotal: Number(payload.subtotal_price || 0),
      total: Number(payload.total_price || 0),
      tax: Number(payload.total_tax || 0),
      shipping_cost: Number(payload.shipping_lines?.[0]?.price || 0),
      discount_code_used: payload.discount_codes?.[0]?.code || null,
      financial_status: financialStatus,
      fulfillment_status: fulfillmentStatus,
      has_rx_items: hasRxItems,
      rx_status: rxStatus,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      first_order_ever: customerPayload ? (customerPayload.orders_count ?? 1) <= 1 : true,
      created_at: payload.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Check if order already exists
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id, rx_status')
      .eq('shopify_order_id', shopifyOrderId)
      .maybeSingle();

    let orderUuid: string;
    let isNewOrder = false;

    if (existingOrder) {
      orderUuid = existingOrder.id;
      const { error: updateErr } = await supabase
        .from('orders')
        .update(orderObj)
        .eq('id', orderUuid);

      if (updateErr) {
        return { success: false, error: `Failed to update order: ${updateErr.message}` };
      }
    } else {
      isNewOrder = true;
      const { data: inserted, error: insertErr } = await supabase
        .from('orders')
        .insert(orderObj)
        .select('id')
        .single();

      if (insertErr || !inserted) {
        return { success: false, error: `Failed to insert order: ${insertErr?.message ?? 'no row returned'}` };
      }
      orderUuid = inserted.id;
    }

    // 7. Sync Line Items (refresh them)
    const { error: deleteErr } = await supabase
      .from('order_line_items')
      .delete()
      .eq('order_id', orderUuid);

    if (deleteErr) {
      console.error('[sync] Failed to delete existing line items', deleteErr);
    }

    if (lineItemsToInsert.length > 0) {
      const lineItemsWithOrder = lineItemsToInsert.map((item) => ({
        ...item,
        order_id: orderUuid,
      }));

      const { error: itemsErr } = await supabase
        .from('order_line_items')
        .insert(lineItemsWithOrder);

      if (itemsErr) {
        return { success: false, error: `Failed to insert line items: ${itemsErr.message}` };
      }
    }

    // 8. Trigger Rx reminder email for new Rx orders (Day 0, 5 min post-payment)
    if (isNewOrder && hasRxItems && rxStatus === 'awaiting_upload') {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://glassyvision.com';

      // Check if we already sent any reminder for this order (safeguard)
      const { data: existingComm } = await supabase
        .from('communications')
        .select('id')
        .eq('order_id', orderUuid)
        .eq('type', 'rx_reminder')
        .maybeSingle();

      if (!existingComm) {
        const { token, exp } = generateRxToken(shopifyOrderNumber);
        const rxUrl = `${baseUrl}/rx/${shopifyOrderNumber}?token=${token}&exp=${exp}`;
        const rendered = renderRxReminder({
          orderNumber: shopifyOrderNumber,
          customerEmail,
          rxUrl,
          reminderDay: 1, // Treat first webhook reminder as day 1 template style or day 0
        });

        // Insert row as queued
        const { data: claimed, error: claimError } = await supabase
          .from('communications')
          .insert({
            order_id: orderUuid,
            customer_email: customerEmail,
            type: 'rx_reminder',
            direction: 'outbound',
            channel: 'email',
            provider: 'resend',
            subject: rendered.subject,
            status: 'queued',
            metadata: { reminder_day: 0 },
          })
          .select('id')
          .single();

        if (claimed && !claimError) {
          // Send immediately
          const sendResult = await sendEmail({
            to: customerEmail,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
          });

          if (sendResult.success) {
            await supabase
              .from('communications')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                provider_message_id: sendResult.providerMessageId,
              })
              .eq('id', claimed.id);
          } else {
            await supabase
              .from('communications')
              .update({
                status: 'failed',
                metadata: { failed_error: sendResult.error, original_reminder_day: 0 },
              })
              .eq('id', claimed.id);
          }
        }
      }
    }

    return { success: true, orderId: orderUuid };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    return { success: false, error: `Exception during sync: ${message}` };
  }
}
