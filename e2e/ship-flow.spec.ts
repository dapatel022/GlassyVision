import { test, expect, Page } from '@playwright/test';

const SHOTS = '/tmp/gv-flow';
const SAMPLE = '/tmp/sample-rx.jpg'; // reused as a fake QC photo

async function loginAs(page: Page, email: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'password123');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function moveJobTo(page: Page, woNumber: string, targetColumn: string, beforeSaveScreenshot?: string) {
  await page.goto('/lab');
  await page.waitForLoadState('networkidle');

  // Click the card matching the work order number
  const card = page.locator('button', { has: page.locator(`text="${woNumber}"`) }).first();
  await card.click();

  // Modal opens with a select
  const select = page.locator('select').first();
  await select.selectOption(targetColumn);

  if (beforeSaveScreenshot) {
    await page.screenshot({ path: `${SHOTS}/${beforeSaveScreenshot}`, fullPage: true });
  }

  // Click "Save"
  await page.locator('button:has-text("Save")').click();
  await page.waitForTimeout(1500);
}

test.describe.serial('lab kanban → shipping → tracking', () => {
  test('20 — labadmin moves WO-202604-100 from inbox → ready_to_cut', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'labadmin@glassyvision.dev');
    await moveJobTo(page, 'WO-202604-100', 'ready_to_cut');
    await page.screenshot({ path: `${SHOTS}/20-after-move-to-ready-to-cut.png`, fullPage: true });
    await ctx.close();
  });

  test('21 — ready_to_cut → on_edger', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'labadmin@glassyvision.dev');
    await moveJobTo(page, 'WO-202604-100', 'on_edger');
    await page.screenshot({ path: `${SHOTS}/21-after-move-to-on-edger.png`, fullPage: true });
    await ctx.close();
  });

  test('22 — on_edger → on_bench', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'labadmin@glassyvision.dev');
    await moveJobTo(page, 'WO-202604-100', 'on_bench');
    await page.screenshot({ path: `${SHOTS}/22-after-move-to-on-bench.png`, fullPage: true });
    await ctx.close();
  });

  test('23 — on_bench → qc', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'labadmin@glassyvision.dev');
    await moveJobTo(page, 'WO-202604-100', 'qc');
    await page.screenshot({ path: `${SHOTS}/23-after-move-to-qc.png`, fullPage: true });
    await ctx.close();
  });

  test('24 — qc gating: try to ship without photo (expect error)', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'labadmin@glassyvision.dev');
    await page.goto('/lab');
    await page.waitForLoadState('networkidle');

    const card = page.locator('button', { has: page.locator('text="WO-202604-100"') }).first();
    await card.click();
    await page.locator('select').first().selectOption('ship');
    await page.locator('button:has-text("Save")').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/24-qc-photo-required-error.png`, fullPage: true });
    await ctx.close();
  });

  test('25 — upload QC photo, then move to ship', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'labadmin@glassyvision.dev');
    await page.goto('/lab');
    await page.waitForLoadState('networkidle');

    const card = page.locator('button', { has: page.locator('text="WO-202604-100"') }).first();
    await card.click();

    // Upload QC photo (file input is in the modal)
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(SAMPLE);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOTS}/25-qc-photo-uploaded.png`, fullPage: true });

    // Now move to ship
    await page.locator('select').first().selectOption('ship');
    await page.locator('button:has-text("Save")').click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/26-after-move-to-ship.png`, fullPage: true });
    await ctx.close();
  });

  test('27 — record shipment in /lab/shipping', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, 'labadmin@glassyvision.dev');
    await page.goto('/lab/shipping');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `${SHOTS}/27-shipping-queue-before.png`, fullPage: true });

    await page.locator('select').first().selectOption('FedEx');
    await page.locator('input[placeholder*="1Z9"]').first().fill('FX1234567890');
    await page.locator('button:has-text("Ship")').first().click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SHOTS}/28-shipping-queue-after.png`, fullPage: true });
    await ctx.close();
  });

  test('28 — customer /track/GV-1001 shows SHIPPED stage', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/track/GV-1001');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/shipped/i);
    await page.screenshot({ path: `${SHOTS}/29-track-shipped.png`, fullPage: true });
    await ctx.close();
  });
});
