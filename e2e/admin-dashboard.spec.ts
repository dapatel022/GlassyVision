import { test, expect } from '@playwright/test';

test('admin dashboard shows live stats and section cards', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'founder@glassyvision.dev');
  await page.fill('input[type="password"]', 'password123');
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/admin', { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);

  await expect(page.locator('h1')).toContainText(/admin dashboard/i);
  await expect(page.locator('body')).toContainText(/rx awaiting review/i);
  await expect(page.locator('body')).toContainText(/active drops/i);
  await expect(page.locator('a', { hasText: /rx queue/i })).toBeVisible();
  await expect(page.locator('a', { hasText: /lab kanban/i })).toBeVisible();

  await page.screenshot({ path: '/tmp/gv-admin-dashboard.png', fullPage: true });
});
