#!/usr/bin/env node
/**
 * Idempotent bootstrap for the hidden `lens-upgrades` Shopify product — the
 * price source for lens upgrade add-on line items (spec
 * docs/superpowers/specs/2026-07-29-lens-upgrade-charging-design.md).
 *
 * Run with:  node --env-file=.env.local scripts/setup-lens-addons.js
 *
 * Safe to re-run against any store (local/staging/prod):
 *  - product missing        → created with all variants at default prices
 *  - variants missing       → only the missing ones are created
 *  - variants present       → NEVER touched (merchant price edits win)
 *
 * After running, publish the product to the headless sales channel in Shopify
 * admin (Products → Lens Upgrades → Sales channels) so the Storefront API can
 * read it. Do NOT add it to any collection — PLPs are collection-driven, so it
 * stays unlisted.
 */

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const API_VERSION = '2025-01'; // keep in sync with src/lib/commerce/admin-fetch.ts

if (!DOMAIN || !TOKEN) {
  console.error('SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_ACCESS_TOKEN not set. Run with: node --env-file=.env.local scripts/setup-lens-addons.js');
  process.exit(1);
}

const HANDLE = 'lens-upgrades';

// Default launch prices — used ONLY at first creation. After that, prices are
// merchant-owned in Shopify admin.
const VARIANTS = [
  { sku: 'LENSUP-SINGLE_VISION', title: 'Single-vision Rx lenses', price: '50.00' },
  { sku: 'LENSUP-PROGRESSIVE', title: 'Progressive Rx lenses', price: '150.00' },
  { sku: 'LENSUP-AR', title: 'Anti-reflective coating', price: '30.00' },
  { sku: 'LENSUP-BLUE_LIGHT', title: 'Blue-light filter', price: '25.00' },
  { sku: 'LENSUP-PHOTOCHROMIC', title: 'Photochromic (Transitions)', price: '85.00' },
  { sku: 'LENSUP-TINT_GREY', title: 'Grey tint', price: '40.00' },
  { sku: 'LENSUP-TINT_AMBER', title: 'Amber tint', price: '40.00' },
  { sku: 'LENSUP-TINT_GREEN', title: 'G-15 Green tint', price: '40.00' },
];

async function api(method, endpoint, body) {
  const res = await fetch(`https://${DOMAIN}/admin/api/${API_VERSION}/${endpoint}`, {
    method,
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} → ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

function variantPayload(v) {
  return {
    option1: v.title,
    sku: v.sku,
    price: v.price,
    taxable: true,
    requires_shipping: false,
    inventory_management: null, // untracked — upgrades never run out
  };
}

async function main() {
  const found = await api('GET', `products.json?handle=${HANDLE}&fields=id,handle,variants`);
  let product = (found.products || [])[0] ?? null;

  if (!product) {
    console.log('Creating lens-upgrades product with all variants…');
    const created = await api('POST', 'products.json', {
      product: {
        title: 'Lens Upgrades',
        handle: HANDLE,
        status: 'active',
        tags: 'internal-addon',
        options: [{ name: 'Upgrade' }],
        variants: VARIANTS.map(variantPayload),
      },
    });
    product = created.product;
  } else {
    const existingSkus = new Set(product.variants.map((v) => v.sku));
    const missing = VARIANTS.filter((v) => !existingSkus.has(v.sku));
    if (missing.length === 0) {
      console.log('lens-upgrades product exists with all variants — nothing to do.');
    }
    for (const v of missing) {
      console.log(`Creating missing variant ${v.sku}…`);
      await api('POST', `products/${product.id}/variants.json`, { variant: variantPayload(v) });
    }
    if (missing.length > 0) {
      const refreshed = await api('GET', `products/${product.id}.json?fields=id,handle,variants`);
      product = refreshed.product;
    }
  }

  console.log(`\nproduct id: ${product.id}  handle: ${HANDLE}`);
  console.log('sku'.padEnd(26) + 'variant id'.padEnd(18) + 'price');
  for (const v of product.variants) {
    console.log(String(v.sku).padEnd(26) + String(v.id).padEnd(18) + `$${v.price}`);
  }
  console.log('\nReminder: publish this product to the headless sales channel (and NO collections).');
}

main().catch((err) => {
  if (String(err).includes('403')) {
    console.error('Admin API returned 403 — the token needs the write_products scope. Grant it in Shopify admin (app settings) and re-run.');
  }
  console.error(err);
  process.exit(1);
});
