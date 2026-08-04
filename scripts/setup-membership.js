#!/usr/bin/env node
/**
 * Idempotent bootstrap for the "GlassyVision Membership" product (3 prepaid
 * tiers) + the matching subscription_plans rows.
 * Spec: docs/superpowers/specs/2026-08-04-membership-tiers-purchase-flow-design.md
 *
 * Run (local DB):  node --env-file=.env.local scripts/setup-membership.js
 * Run (cloud DB):  SUPABASE_URL_CLOUD=... SUPABASE_SERVICE_ROLE_KEY_CLOUD=... \
 *                  node --env-file=.env.local scripts/setup-membership.js --db cloud
 *
 * Idempotency: product/variants created only if missing; existing Shopify
 * prices are NEVER overwritten; plan rows are matched by shopify_variant_id
 * then by name, and their policies are never touched on update.
 */
const { createClient } = require('@supabase/supabase-js');

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = '2025-01';
const HANDLE = 'membership';
const HEADLESS_PUBLICATION = 'gid://shopify/Publication/157504798791';

const CLOUD = process.argv.includes('--db') && process.argv[process.argv.indexOf('--db') + 1] === 'cloud';
const SB_URL = CLOUD ? process.env.SUPABASE_URL_CLOUD : process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = CLOUD ? process.env.SUPABASE_SERVICE_ROLE_KEY_CLOUD : process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DOMAIN || !TOKEN) { console.error('Shopify env missing. Run with --env-file=.env.local'); process.exit(1); }
if (!SB_URL || !SB_KEY) { console.error(`Supabase ${CLOUD ? 'CLOUD' : 'local'} env missing.`); process.exit(1); }

const TIERS = [
  { sku: 'SUB-1PAIR', title: 'Solo — 1 pair / year', price: '89.00', name: 'Solo', pairs: 1 },
  { sku: 'SUB-2PAIR', title: 'Duo — 2 pairs / year', price: '149.00', name: 'Duo', pairs: 2 },
  { sku: 'SUB-3PAIR', title: 'Trio — 3 pairs / year', price: '189.00', name: 'Trio', pairs: 3 },
];

async function rest(method, endpoint, body) {
  const res = await fetch(`https://${DOMAIN}/admin/api/${API_VERSION}/${endpoint}`, {
    method, headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${endpoint} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function gql(query, variables) {
  const res = await fetch(`https://${DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST', headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}
const variantPayload = (t) => ({
  option1: t.title, sku: t.sku, price: t.price, taxable: true,
  requires_shipping: false, inventory_management: null,
});

async function main() {
  // 1. Product + variants (create-if-missing only)
  const found = await rest('GET', `products.json?handle=${HANDLE}&fields=id,handle,variants`);
  let product = (found.products || [])[0] ?? null;
  if (!product) {
    console.log('Creating membership product…');
    product = (await rest('POST', 'products.json', {
      product: {
        title: 'GlassyVision Membership', handle: HANDLE, status: 'active',
        tags: 'internal-membership', options: [{ name: 'Tier' }],
        variants: TIERS.map(variantPayload),
      },
    })).product;
  } else {
    const have = new Set(product.variants.map((v) => v.sku));
    for (const t of TIERS.filter((t) => !have.has(t.sku))) {
      console.log(`Creating variant ${t.sku}…`);
      await rest('POST', `products/${product.id}/variants.json`, { variant: variantPayload(t) });
    }
    product = (await rest('GET', `products/${product.id}.json?fields=id,handle,variants`)).product;
  }

  // 2. Publish to the headless channel (idempotent — republish is a no-op)
  const pub = await gql(
    'mutation($id:ID!,$input:[PublicationInput!]!){publishablePublish(id:$id,input:$input){userErrors{message}}}',
    { id: `gid://shopify/Product/${product.id}`, input: [{ publicationId: HEADLESS_PUBLICATION }] },
  );
  const pubErr = pub.errors?.[0]?.message ?? pub.data?.publishablePublish?.userErrors?.[0]?.message;
  console.log('headless publish:', pubErr ?? 'OK');

  // 3. subscription_plans rows (match by variant id, then name; never touch policies)
  const supabase = createClient(SB_URL, SB_KEY);
  console.log(`\nDB: ${CLOUD ? 'CLOUD' : 'local'}  (${SB_URL})`);
  console.log('tier'.padEnd(6) + 'sku'.padEnd(12) + 'variant id'.padEnd(18) + 'price'.padEnd(10) + 'plan id');
  for (const t of TIERS) {
    const variant = product.variants.find((v) => v.sku === t.sku);
    if (!variant) throw new Error(`variant ${t.sku} missing after bootstrap`);
    let { data: plan } = await supabase.from('subscription_plans').select('id')
      .eq('shopify_variant_id', variant.id).maybeSingle();
    if (!plan) {
      const { data: byName } = await supabase.from('subscription_plans').select('id')
        .eq('name', t.name).maybeSingle();
      if (byName) {
        const { error } = await supabase.from('subscription_plans')
          .update({ shopify_product_id: product.id, shopify_variant_id: variant.id, pairs_count: t.pairs, status: 'active' })
          .eq('id', byName.id);
        if (error) throw new Error(`plan update ${t.name}: ${error.message}`);
        plan = byName;
      } else {
        const { data: inserted, error } = await supabase.from('subscription_plans')
          .insert({
            name: t.name, pairs_count: t.pairs, term_months: 12, billing_mode: 'prepaid',
            shopify_product_id: product.id, shopify_variant_id: variant.id, status: 'active',
          }).select('id').single();
        if (error || !inserted) throw new Error(`plan insert ${t.name}: ${error?.message}`);
        plan = inserted;
      }
    }
    console.log(t.name.padEnd(6) + t.sku.padEnd(12) + String(variant.id).padEnd(18) + `$${variant.price}`.padEnd(10) + plan.id);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
