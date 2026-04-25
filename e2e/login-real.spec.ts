import { test, expect } from '@playwright/test';

test('founder can sign in and reach /admin', async ({ page }) => {
  await page.goto('/login');

  await page.fill('input[type="email"]', 'founder@glassyvision.dev');
  await page.fill('input[type="password"]', 'password123');

  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith('/admin'), { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);

  await expect(page).toHaveURL(/\/admin/);
  await expect(page.locator('body')).toContainText(/admin|founder|dashboard/i);

  await page.screenshot({ path: '/tmp/gv-admin-after-login.png', fullPage: true });
});

test('reviewer can sign in and reach /admin/rx-queue', async ({ page }) => {
  await page.goto('/login?redirect=/admin/rx-queue');

  await page.fill('input[type="email"]', 'reviewer@glassyvision.dev');
  await page.fill('input[type="password"]', 'password123');

  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith('/admin'), { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.screenshot({ path: '/tmp/gv-rx-queue.png', fullPage: true });
});

test('lab admin can sign in and reach /lab', async ({ page }) => {
  await page.goto('/login?redirect=/lab');

  await page.fill('input[type="email"]', 'labadmin@glassyvision.dev');
  await page.fill('input[type="password"]', 'password123');

  await Promise.all([
    page.waitForURL((url) => url.pathname.startsWith('/lab'), { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);

  await page.screenshot({ path: '/tmp/gv-lab.png', fullPage: true });
});
