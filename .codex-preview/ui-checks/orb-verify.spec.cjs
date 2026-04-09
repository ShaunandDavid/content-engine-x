const { test, expect } = require('playwright/test');
const fs = require('fs');
const path = require('path');

const baseUrl = 'http://127.0.0.1:3005';
const outDir = path.resolve('.codex-preview/ui-checks');
const summary = [];

function attachObservers(page, bucket) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      bucket.consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (error) => {
    bucket.pageErrors.push(String(error));
  });

  page.on('response', (response) => {
    if (response.status() >= 400) {
      bucket.networkErrors.push(`${response.status()} ${response.url()}`);
    }
  });
}

async function setThemeAndVerify(page, theme) {
  await page.getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light' }).click();
  await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction((expected) => document.documentElement.dataset.theme === expected, theme);
}

test('verify orb premium pass on desktop and mobile', async ({ browser }) => {
  fs.mkdirSync(outDir, { recursive: true });

  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    colorScheme: 'light'
  });
  const desktopPage = await desktop.newPage();
  const desktopBucket = { surface: 'desktop', consoleErrors: [], pageErrors: [], networkErrors: [] };
  attachObservers(desktopPage, desktopBucket);

  await desktopPage.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(desktopPage.locator('.enoch-orb')).toBeVisible();
  await expect(desktopPage.locator('.enoch-home-eyebrow')).toHaveText('ENOCH');

  await setThemeAndVerify(desktopPage, 'light');
  await desktopPage.screenshot({ path: path.join(outDir, 'orb-home-desktop-light-premium.png'), fullPage: true });
  await desktopPage.locator('.enoch-orb-container').screenshot({ path: path.join(outDir, 'orb-crop-desktop-light-premium.png') });

  await setThemeAndVerify(desktopPage, 'dark');
  await desktopPage.screenshot({ path: path.join(outDir, 'orb-home-desktop-dark-premium.png'), fullPage: true });
  await desktopPage.locator('.enoch-orb-container').screenshot({ path: path.join(outDir, 'orb-crop-desktop-dark-premium.png') });

  summary.push({
    ...desktopBucket,
    eyebrow: await desktopPage.locator('.enoch-home-eyebrow').textContent(),
    finalTheme: await desktopPage.evaluate(() => document.documentElement.dataset.theme),
    orbRect: await desktopPage.locator('.enoch-orb-container').boundingBox()
  });
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'light'
  });
  const mobilePage = await mobile.newPage();
  const mobileBucket = { surface: 'mobile', consoleErrors: [], pageErrors: [], networkErrors: [] };
  attachObservers(mobilePage, mobileBucket);

  await mobilePage.goto(baseUrl, { waitUntil: 'networkidle' });
  await expect(mobilePage.locator('.enoch-orb')).toBeVisible();
  await expect(mobilePage.locator('.enoch-home-eyebrow')).toHaveText('ENOCH');

  await setThemeAndVerify(mobilePage, 'light');
  await mobilePage.screenshot({ path: path.join(outDir, 'orb-home-mobile-light-premium.png'), fullPage: true });

  await setThemeAndVerify(mobilePage, 'dark');
  await mobilePage.screenshot({ path: path.join(outDir, 'orb-home-mobile-dark-premium.png'), fullPage: true });

  summary.push({
    ...mobileBucket,
    eyebrow: await mobilePage.locator('.enoch-home-eyebrow').textContent(),
    finalTheme: await mobilePage.evaluate(() => document.documentElement.dataset.theme),
    orbRect: await mobilePage.locator('.enoch-orb-container').boundingBox()
  });
  await mobile.close();

  fs.writeFileSync(path.join(outDir, 'orb-verify-summary.json'), JSON.stringify(summary, null, 2));
});
