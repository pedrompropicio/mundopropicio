import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { startServer, verifySources } from '../server.mjs';

const require = createRequire(import.meta.url);
function playwright() {
  try { return require('@playwright/test'); }
  catch {
    // Optional preinstalled runtime; never downloads or installs a browser.
    if (!process.env.UPDATE_LAB_PLAYWRIGHT_ROOT) throw new Error('Install existing project dependencies or set UPDATE_LAB_PLAYWRIGHT_ROOT to an installed Playwright module.');
    return require(path.resolve(process.env.UPDATE_LAB_PLAYWRIGHT_ROOT));
  }
}

async function scenario(run, options = {}) {
  const lab = await startServer();
  const chromium = playwright().chromium;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.UPDATE_LAB_CHROMIUM_PATH || chromium.executablePath(), args: ['--no-sandbox'] });
  } catch (error) { await lab.close(); throw error; }
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const external = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== lab.origin) {
      external.push(route.request().url()); return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${lab.origin}/?mode=${options.mode || 'baseline'}${options.sw ? '&channel=sw' : ''}`);
    await page.waitForFunction(() => Boolean(globalThis.__updateLab?.rerender));
    if (options.sw) {
      await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
      await page.waitForTimeout(500);
    }
    await run({ page, context, lab });
    assert.deepEqual(external, [], 'No non-local request attempted');
    assert.deepEqual(errors, [], 'No uncaught browser error');
  } finally { await context.close(); await browser.close(); await lab.close(); }
}

async function publish(page) {
  await page.locator('#deploy').click();
}
async function boots(page) { return Number(await page.locator('#boots').textContent()); }

test('Pinned ERP source fingerprints match', async () => {
  const source = await verifySources();
  assert.equal(source.commit, '29e18c96f4ebcc76bd1471cd4a68b333f966f12f');
});

test('BASELINE: dirty form with no modal/mutation reloads and loses its text', async () => scenario(async ({ page }) => {
  await page.locator('#draft').fill('Despesa fictícia por guardar');
  const before = await boots(page);
  await publish(page);
  await page.waitForFunction(expected => Number(document.querySelector('#boots').textContent) > expected, before);
  assert.equal(await page.locator('#draft').inputValue(), '');
}));

test('BASELINE: active simulated mutation postpones the reload', async () => scenario(async ({ page }) => {
  await page.locator('#mutation').check();
  const before = await boots(page);
  await publish(page);
  await page.locator('#update').waitFor({ state: 'visible' });
  assert.equal(await boots(page), before);
}));

test('BASELINE: an open modal postpones the version notification', async () => scenario(async ({ page, lab }) => {
  await page.locator('#open-modal').click();
  const before = await boots(page);
  await page.evaluate(async origin => { await fetch(`${origin}/__lab/deploy`, { method: 'POST' }); window.dispatchEvent(new Event('focus')); }, lab.origin);
  await page.locator('#update').waitFor({ state: 'visible' });
  assert.equal(await boots(page), before);
}));

test('PROPOSAL: dirty form survives notification; update blocked until saved; explicit click reloads once', async () => scenario(async ({ page }) => {
  await page.locator('#draft').fill('Descrição fictícia preservada');
  const before = await boots(page);
  await publish(page);
  await page.locator('#update').waitFor({ state: 'visible' });
  assert.equal(await boots(page), before);
  assert.equal(await page.locator('#draft').inputValue(), 'Descrição fictícia preservada');
  assert.equal(await page.locator('#update-now').isDisabled(), true);
  await page.locator('#save').click();
  assert.equal(await page.locator('#update-now').isDisabled(), false);
  assert.equal(await boots(page), before, 'Saving does not automatically reload');
  await page.locator('#update-now').click();
  await page.waitForFunction(expected => Number(document.querySelector('#boots').textContent) === expected, before + 1);
  await page.waitForTimeout(300);
  assert.equal(await boots(page), before + 1);
}, { mode: 'proposal' }));

test('PROPOSAL: no automatic reload even when no work is pending', async () => scenario(async ({ page }) => {
  const before = await boots(page);
  await publish(page);
  await page.locator('#update').waitFor({ state: 'visible' });
  assert.equal(await boots(page), before);
  assert.equal(await page.locator('#update-now').isDisabled(), false);
}, { mode: 'proposal' }));

test('PROPOSAL: a mutation starting after notification blocks the update click', async () => scenario(async ({ page }) => {
  await publish(page);
  await page.locator('#update').waitFor({ state: 'visible' });
  const before = await boots(page);
  await page.locator('#mutation').check();
  assert.equal(await page.locator('#update-now').isDisabled(), true);
  await page.evaluate(() => globalThis.__updateLab.action());
  assert.equal(await boots(page), before);
}, { mode: 'proposal' }));

test('PROPOSAL: each of two tabs decides independently when to update', async () => scenario(async ({ page, context, lab }) => {
  const second = await context.newPage();
  await second.goto(`${lab.origin}/?mode=proposal`);
  await second.waitForFunction(() => Boolean(globalThis.__updateLab?.rerender));
  await second.locator('#draft').fill('Texto do segundo separador');
  const before = await boots(second);
  await publish(page);
  await page.locator('#update').waitFor({ state: 'visible' });
  await second.evaluate(() => window.dispatchEvent(new Event('focus')));
  await second.locator('#update').waitFor({ state: 'visible' });
  await page.locator('#update-now').click();
  await page.waitForURL(/v=lab-2/);
  assert.equal(await boots(second), before);
  assert.equal(await second.locator('#draft').inputValue(), 'Texto do segundo separador');
  assert.equal(await second.locator('#update-now').isDisabled(), true);
}, { mode: 'proposal' }));

test('PROPOSAL: synthetic service-worker controller notification offers update without reload', async () => scenario(async ({ page }) => {
  await page.locator('#update').waitFor({ state: 'visible' });
  await page.locator('#draft').fill('Texto com worker local');
  assert.equal(await boots(page), 1);
  assert.equal(await page.locator('#draft').inputValue(), 'Texto com worker local');
}, { mode: 'proposal', sw: true }));

test('Server refuses foreign origins and unknown paths', async () => {
  const lab = await startServer();
  try {
    assert.equal((await fetch(lab.origin + '/__lab/deploy', { method: 'POST', headers: { Origin: 'https://foreign.invalid' } })).status, 403);
    assert.equal((await fetch(lab.origin + '/rest/v1/transactions')).status, 404);
    const response = await fetch(lab.origin);
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  } finally { await lab.close(); }
});
