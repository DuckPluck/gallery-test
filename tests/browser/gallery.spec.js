import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createServer, request as proxyRequest } from 'node:http';

test.beforeEach(async ({ page }) => {
  page.runtimeErrors = [];
  page.on('pageerror', error => page.runtimeErrors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.clip-preview')).toHaveCount(32);
});

test.afterEach(async ({ page }) => { expect(page.runtimeErrors).toEqual([]); });

test('selection, replacement, swapping, completion and reset', async ({ page }) => {
  const slots = page.locator('.slot');
  await page.locator('.emotion[data-emotion="fear"]').click();
  await slots.nth(0).click();
  await page.locator('.emotion[data-emotion="love"]').click();
  await slots.nth(1).click();
  await slots.nth(0).click();
  await slots.nth(1).click();
  await expect(slots.nth(0)).toHaveAttribute('data-emotion', 'love');
  await expect(slots.nth(1)).toHaveAttribute('data-emotion', 'fear');
  await page.locator('.emotion[data-emotion="calm"]').click();
  await slots.nth(0).click();
  await expect(page.locator('.emotion[data-emotion="love"]')).toBeVisible();
  await page.locator('.emotion[data-emotion="love"]').click();
  await slots.nth(2).click();
  await page.locator('.emotion[data-emotion="arousal"]').click();
  await slots.nth(3).click();
  await expect(page.locator('#progress')).toHaveText('Все варианты распределены');
  await page.reload();
  await expect(page.locator('#progress')).toHaveText('Распределено 0 из 4');
  await page.locator('.emotion[data-emotion="fear"]').click();
  await slots.nth(0).click();
  await page.locator('#reset').click();
  await expect(page.locator('.slot.assigned')).toHaveCount(0);
  await expect(page.locator('.emotion:visible')).toHaveCount(4);
});

test('pointer drag, outside release, Escape and interruption', async ({ page }) => {
  const source = page.locator('.emotion[data-emotion="fear"]');
  const target = page.locator('.slot').first();
  await source.dragTo(target);
  await expect(target).toHaveAttribute('data-emotion', 'fear');
  await page.locator('.emotion[data-emotion="love"]').dragTo(page.locator('h1'));
  await expect(page.locator('.slot.assigned')).toHaveCount(1);
  const box = await page.locator('.emotion[data-emotion="love"]').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x, box.y - 30, { steps: 4 });
  await expect(page.locator('.drag-ghost')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  await expect(page.locator('.slot.assigned')).toHaveCount(1);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x, box.y - 30, { steps: 4 });
  await page.dispatchEvent('body', 'pointercancel', { pointerId: 1 });
  await page.mouse.up();
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  await expect(page.locator('.slot.assigned')).toHaveCount(1);
});

test('proximity grows a card and moves neighbours without moving the slot', async ({ page }) => {
  const slot = page.locator('.slot').first();
  const before = await slot.boundingBox();
  const card = page.locator('#clip-1-2');
  const box = await card.boundingBox();
  const neighbour = page.locator('#clip-1-1');
  const initial = await neighbour.getAttribute('style');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(card).toHaveAttribute('data-active', 'true');
  await expect.poll(async () => (await card.boundingBox()).width).toBeGreaterThan(box.width * 1.5);
  expect(await neighbour.getAttribute('style')).not.toBe(initial);
  expect((await slot.boundingBox()).y).toBe(before.y);
  await page.mouse.move(5, 5);
  await expect(card).toHaveAttribute('data-active', 'false');
});

test('all cards can be inspected with keyboard and pause remains authoritative', async ({ page }) => {
  for (const card of await page.locator('.clip-preview').all()) {
    await card.focus();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
  }
  await page.locator('#playback').click();
  await expect(page.locator('#playback')).toHaveText('Включить видео');
  await page.locator('.slot').last().scrollIntoViewIfNeeded();
  await expect.poll(() => page.locator('video').evaluateAll(videos => videos.every(video => video.paused))).toBe(true);
});

test('responsive widths, target sizes, text zoom and accessibility', async ({ page }) => {
  for (const width of [280, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const slots = await page.locator('.slot').evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
    expect(slots.every(slot => slot.width >= 44 && slot.height >= 44)).toBe(true);
    if (width < 720) expect(await page.locator('.answer-tray').evaluate(node => getComputedStyle(node).position)).toBe('fixed');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.style.fontSize = '125%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.documentElement.style.fontSize = '');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(results.violations).toEqual([]);
});

test('reduced motion starts paused and supports explicit inspection', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('#playback')).toHaveText('Включить видео');
  expect(await page.locator('video').evaluateAll(videos => videos.every(video => video.paused))).toBe(true);
  const card = page.locator('#clip-1-1 .clip-preview');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(card).toHaveAttribute('aria-pressed', 'false');
});

test('mobile tap, fixed tray and touch transfer', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto('http://localhost:4173');
  const card = page.locator('#clip-1-2 .clip-preview');
  await card.tap();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.locator('h1').tap();
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  await page.locator('.emotion[data-emotion="fear"]').tap();
  await page.locator('.slot').first().tap();
  await expect(page.locator('.slot').first()).toHaveAttribute('data-emotion', 'fear');
  await page.locator('.slot').last().scrollIntoViewIfNeeded();
  await page.locator('.emotion[data-emotion="love"]').tap();
  await page.locator('.slot').last().tap();
  await expect(page.locator('.slot').last()).toHaveAttribute('data-emotion', 'love');
  await context.close();
});

test('media loads as silent looping video and errors offer retry', async ({ page, browserName, playwright }) => {
  test.setTimeout(90000);
  await page.close();
  // Isolate the native decoder pool from media pipelines used by earlier cases.
  const browser = await playwright[browserName].launch(browserName === 'webkit'
    ? { env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !/proxy/i.test(key))) }
    : {});
  const mediaPage = await browser.newPage();
  const mediaErrors = [];
  mediaPage.on('pageerror', error => mediaErrors.push(error.message));
  await mediaPage.goto('http://localhost:4173');
  const video = mediaPage.locator('video').first();
  await expect.poll(() => video.evaluate(node => node.readyState), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
  expect(await video.evaluate(node => node.muted && node.loop && node.hasAttribute('playsinline') && Math.abs(node.duration - 3) < .1)).toBe(true);
  await mediaPage.close();
  const context = await browser.newContext();
  const broken = await context.newPage();
  broken.on('pageerror', error => mediaErrors.push(error.message));
  let unavailable = true;
  // A real HTTP failure also exercises WebKit's native media network stack.
  const proxy = createServer((incoming, response) => {
    if (unavailable && incoming.url.startsWith('/videos/demo-1.mp4')) {
      response.writeHead(503, { 'Cache-Control': 'no-store' }).end();
      return;
    }
    const upstream = proxyRequest({ hostname: '127.0.0.1', port: 4173, path: incoming.url, headers: incoming.headers }, result => {
      response.writeHead(result.statusCode, result.headers);
      result.pipe(response);
    });
    upstream.on('error', () => response.destroy());
    incoming.pipe(upstream);
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  try {
    await broken.goto(`http://127.0.0.1:${proxy.address().port}`);
    await broken.bringToFront();
    expect(await broken.evaluate(() => document.hidden)).toBe(false);
    const retry = broken.locator('#clip-1-1 .clip-retry');
    await expect(retry).toBeVisible();
    unavailable = false;
    await broken.locator('#clip-1-1 .clip-preview').focus();
    await retry.click();
    await expect.poll(() => broken.locator('video').first().evaluate(node => node.readyState), { timeout: 20000 }).toBeGreaterThanOrEqual(2);
  } finally {
    await context.close();
    await browser.close();
    proxy.closeAllConnections();
    await new Promise(resolve => proxy.close(resolve));
  }
  expect(mediaErrors).toEqual([]);
});

test('touch drag and automatic edge scrolling', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'Touch movement injection uses Chromium CDP; tap parity is tested in every engine.');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto('http://localhost:4173');
  const slot = page.locator('.slot').first();
  await slot.scrollIntoViewIfNeeded();
  const source = await page.locator('.emotion[data-emotion="fear"]').boundingBox();
  const target = await slot.boundingBox();
  const session = await context.newCDPSession(page);
  const point = (x, y) => ({ x, y, id: 1, force: 1 });
  const startX = source.x + source.width / 2;
  const startY = source.y + source.height / 2;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(startX, startY)] });
  for (let step = 1; step <= 8; step++) {
    const t = step / 8;
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(startX + (target.x + target.width / 2 - startX) * t, startY + (target.y + target.height / 2 - startY) * t)] });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(slot).toHaveAttribute('data-emotion', 'fear');
  const next = await page.locator('.emotion[data-emotion="love"]').boundingBox();
  const before = await page.evaluate(() => scrollY);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(next.x + next.width / 2, next.y + next.height / 2)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(195, 836)] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 100);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
  await expect(page.locator('.slot.assigned')).toHaveCount(1);
  await context.close();
});
