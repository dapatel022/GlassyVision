import { test } from '@playwright/test';
import { createHmac } from 'crypto';

const SECRET = process.env.RX_TOKEN_SECRET ?? '';

function rxUrl(orderNumber: string): string {
  const exp = Date.now() + 30 * 86400000;
  const token = createHmac('sha256', SECRET).update(`${orderNumber}:${exp}`).digest('hex');
  return `/rx/${orderNumber}?token=${token}&exp=${exp}`;
}

test('snapshot home', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/gv-home.png', fullPage: true });
});

test('snapshot shop', async ({ page }) => {
  await page.goto('/shop');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/gv-shop.png', fullPage: true });
});

test('snapshot login', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/gv-login.png', fullPage: true });
});

test('snapshot rx wizard with valid token', async ({ page }) => {
  await page.goto(rxUrl('GV-1001'));
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/gv-rx.png', fullPage: true });
});

test('snapshot thanks page', async ({ page }) => {
  await page.goto('/thanks/GV-1001');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/gv-thanks.png', fullPage: true });
});

test('snapshot track page', async ({ page }) => {
  await page.goto('/track/GV-1001');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '/tmp/gv-track.png', fullPage: true });
});
