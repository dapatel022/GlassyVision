#!/usr/bin/env node
/**
 * Print fresh HMAC URLs for every seeded order so you can paste any of
 * them into a browser. Run with:  node --env-file=.env.local scripts/demo-tokens.js
 */
const { createHmac } = require('crypto');

const SECRET = process.env.RX_TOKEN_SECRET;
if (!SECRET) {
  console.error('RX_TOKEN_SECRET not set. Run with: node --env-file=.env.local scripts/demo-tokens.js');
  process.exit(1);
}

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3001';
const ORDERS = ['GV-1001', 'GV-1002', 'GV-1003', 'GV-1004', 'GV-1005'];
const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;

function hmac(orderNumber) {
  return createHmac('sha256', SECRET).update(`${orderNumber}:${exp}`).digest('hex');
}

console.log(`\nDemo URLs (valid for 30 days, exp=${exp})\n`);
for (const o of ORDERS) {
  const token = hmac(o);
  console.log(`Order ${o}`);
  console.log(`  Thanks:  ${BASE}/thanks/${o}`);
  console.log(`  Rx:      ${BASE}/rx/${o}?token=${token}&exp=${exp}`);
  console.log(`  Track:   ${BASE}/track/${o}`);
  console.log(`  Returns: ${BASE}/returns/start/${o}?token=${token}&exp=${exp}`);
  console.log();
}

console.log('Founder login: founder@glassyvision.dev / password123');
console.log('Reviewer:      reviewer@glassyvision.dev / password123');
console.log('Lab admin:     labadmin@glassyvision.dev / password123');
console.log('Lab operator:  labop@glassyvision.dev / password123');
