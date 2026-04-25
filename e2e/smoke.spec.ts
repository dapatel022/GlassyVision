import { test, expect } from '@playwright/test';
import { createHmac } from 'crypto';

const RX_SECRET = process.env.RX_TOKEN_SECRET ?? '';

function buildRxUrl(orderNumber: string): string {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const token = createHmac('sha256', RX_SECRET)
    .update(`${orderNumber}:${exp}`)
    .digest('hex');
  return `/rx/${orderNumber}?token=${token}&exp=${exp}`;
}

test('home page loads with hero + header chrome', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/GlassyVision/i);
  await expect(page.locator('body')).toContainText(/GlassyVision/i);
});

test('shop page renders (empty-state fallback when no Shopify)', async ({ page }) => {
  await page.goto('/shop');
  await expect(page.locator('body')).toContainText(/shop|catalog/i);
});

test('cart page renders empty-cart state', async ({ page }) => {
  await page.goto('/cart');
  await expect(page.locator('body')).toContainText(/cart/i);
});

test('rx intake with INVALID token shows expired link message', async ({ page }) => {
  await page.goto('/rx/GV-1001?token=deadbeef&exp=9999999999999');
  await expect(page.locator('body')).toContainText(/invalid|expired/i);
});

test('rx intake with NO token shows expired link message', async ({ page }) => {
  await page.goto('/rx/GV-1001');
  await expect(page.locator('body')).toContainText(/invalid|expired/i);
});

test('rx intake with VALID token renders for seeded order GV-1001', async ({ page }) => {
  test.skip(!RX_SECRET, 'RX_TOKEN_SECRET not set — skipping valid-token test');
  await page.goto(buildRxUrl('GV-1001'));
  // The page may show the upload wizard, the under-review message, or the
  // approved state depending on what other tests have done. All are valid
  // post-token-verification responses.
  await expect(page.locator('body')).toContainText(/GV-1001|prescription|review/i);
  await expect(page.locator('body')).not.toContainText(/invalid or expired/i);
});

test('thanks page renders order + cta', async ({ page }) => {
  await page.goto('/thanks/GV-1001');
  await expect(page.locator('body')).toContainText(/thank you|processing/i);
});

test('track page shows stage progress', async ({ page }) => {
  await page.goto('/track/GV-1001');
  await expect(page.locator('body')).toContainText(/track|order/i);
});

test('admin route redirects unauthenticated users to login', async ({ page }) => {
  const response = await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
  expect(response?.status()).toBeLessThan(500);
});

test('lab route redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/lab');
  await expect(page).toHaveURL(/\/login/);
});

test('login form renders email + password fields', async ({ page }) => {
  await page.goto('/login');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test('404 on missing product', async ({ page }) => {
  const response = await page.goto('/p/does-not-exist');
  expect(response?.status()).toBe(404);
});

test('newsletter subscribe validates empty email', async ({ request }) => {
  const res = await request.post('/api/newsletter/subscribe', {
    data: { email: '' },
  });
  expect(res.status()).toBe(400);
});

test('cron endpoint rejects missing auth', async ({ request }) => {
  const res = await request.get('/api/cron/reconcile');
  expect(res.status()).toBe(401);
});

test('cron endpoint accepts valid secret', async ({ request }) => {
  test.skip(!process.env.CRON_SECRET, 'CRON_SECRET not set');
  const res = await request.get('/api/cron/reconcile', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(res.status()).toBe(200);
});
