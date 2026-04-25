import { test } from '@playwright/test';

test('debug — capture login network + console', async ({ page }) => {
  const consoleErrors: string[] = [];
  const networkLog: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('auth') || url.includes('supabase') || url.includes(':54321')) {
      networkLog.push(`${res.status()} ${res.request().method()} ${url}`);
    }
  });

  page.on('requestfailed', (req) => {
    networkLog.push(`FAILED ${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
  });

  await page.goto('/login');
  await page.fill('input[type="email"]', 'founder@glassyvision.dev');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(4000);

  const errorText = await page.locator('p.text-error, .error, [role="alert"]').allTextContents();

  console.log('---NETWORK---');
  networkLog.forEach((l) => console.log(l));
  console.log('---CONSOLE ERRORS---');
  consoleErrors.forEach((e) => console.log(e));
  console.log('---ERROR TEXT ON PAGE---');
  console.log(JSON.stringify(errorText));
  console.log('---FINAL URL---');
  console.log(page.url());
  console.log('---PAGE BODY (last 500 chars) ---');
  const body = await page.locator('body').textContent();
  console.log((body ?? '').slice(-500));
});
