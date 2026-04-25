import { test, expect, Page, BrowserContext } from '@playwright/test';
import { createHmac } from 'crypto';
import path from 'path';

const SECRET = process.env.RX_TOKEN_SECRET ?? '';
const SAMPLE_IMAGE = '/tmp/sample-rx.jpg';
const SHOTS = '/tmp/gv-flow';

function rxUrl(orderNumber: string): string {
  const exp = Date.now() + 30 * 86400000;
  const token = createHmac('sha256', SECRET).update(`${orderNumber}:${exp}`).digest('hex');
  return `/rx/${orderNumber}?token=${token}&exp=${exp}`;
}

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'password123');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function freshContext(browser: BrowserContext['browser']): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser!.newContext();
  const page = await context.newPage();
  return { context, page };
}

test.describe.serial('full glassyvision flow: customer Rx → admin approval → lab → shipping → tracking', () => {
  test('01 — customer arrives at /thanks/GV-1001', async ({ browser }) => {
    const { context, page } = await freshContext(browser);
    await page.goto('/thanks/GV-1001');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/01-thanks.png`, fullPage: true });
    await context.close();
  });

  test('02 — customer opens Rx wizard via valid token link', async ({ browser }) => {
    const { context, page } = await freshContext(browser);
    await page.goto(rxUrl('GV-1001'));
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/upload your prescription/i);
    await page.screenshot({ path: `${SHOTS}/02-rx-wizard-step1.png`, fullPage: true });
    await context.close();
  });

  test('03 — customer uploads Rx, fills typed values, certifies, submits', async ({ browser }) => {
    const { context, page } = await freshContext(browser);
    await page.goto(rxUrl('GV-1001'));

    // step 1: upload — file input may be hidden; force-set it
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(SAMPLE_IMAGE);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // upload + auto-checks + wizard advance
    await page.screenshot({ path: `${SHOTS}/03-rx-uploaded-and-typed-step.png`, fullPage: true });

    // step 2: typed values — skip via button (values are optional)
    const skipBtn = page.locator('button:has-text("Skip this step")').first();
    await skipBtn.click({ timeout: 5000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/04-certification-step.png`, fullPage: true });

    // step 3: certify + submit
    const certCheckbox = page.locator('input[type="checkbox"]').first();
    await certCheckbox.check();
    await page.screenshot({ path: `${SHOTS}/05-certification-checked.png`, fullPage: true });
    const submitBtn = page.locator('button:has-text("Submit Prescription")').first();
    await submitBtn.click();

    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOTS}/06-rx-submitted.png`, fullPage: true });
    await context.close();
  });

  test('04 — admin sees new Rx in /admin queue', async ({ browser }) => {
    const { context, page } = await freshContext(browser);
    await loginAs(page, 'founder@glassyvision.dev');
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/07-admin-dashboard.png`, fullPage: true });

    await page.goto('/admin/rx-queue');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/08-admin-rx-queue.png`, fullPage: true });
    await context.close();
  });

  test('05 — admin reviews + approves the Rx', async ({ browser }) => {
    const { context, page } = await freshContext(browser);
    await loginAs(page, 'founder@glassyvision.dev');
    await page.goto('/admin/rx-queue');
    await page.waitForLoadState('networkidle');
    // First item is auto-selected — review detail is already visible.
    await page.screenshot({ path: `${SHOTS}/09-rx-review-detail.png`, fullPage: true });

    const approveBtn = page.locator('button:has-text("Approve")').first();
    await approveBtn.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOTS}/10-rx-approved.png`, fullPage: true });
    await context.close();
  });

  test('06 — lab admin sees the new work order in /lab kanban inbox', async ({ browser }) => {
    const { context, page } = await freshContext(browser);
    await loginAs(page, 'labadmin@glassyvision.dev');
    await page.goto('/lab');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/11-lab-kanban-with-job.png`, fullPage: true });
    await context.close();
  });

  test('07 — customer tracks the order at /track', async ({ browser }) => {
    const { context, page } = await freshContext(browser);
    await page.goto('/track/GV-1001');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/12-track-order.png`, fullPage: true });
    await context.close();
  });
});
