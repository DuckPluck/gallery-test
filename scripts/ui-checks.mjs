import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

await mkdir('artifacts', { recursive: true });
const [html, theme, styles, state, media, app] = await Promise.all([
  'site/index.html', 'site/theme.css', 'site/styles.css', 'site/state.js', 'site/media.js', 'site/app.js',
].map(path => readFile(path, 'utf8')));
// File-based gates need an inline module because browsers block file imports.
const code = [state, media, app.replace(/^import .*;\n/gm, '')].join('\n').replace(/^export /gm, '');
const harness = html.replace('<head>', `<head><base href="${new URL('../site/', import.meta.url).href}">`)
  .replace(/<link rel="stylesheet"[^>]+>/g, '')
  .replace('<script type="module" src="./app.js"></script>', () => `<style>${theme}\n${styles}</style><script type="module">${code}</script>`);
await writeFile('artifacts/ui-harness.html', harness);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto('http://localhost:4173');
await page.locator('.clip-preview').last().waitFor();
await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
await page.locator('#clip-1-2 .clip-preview').focus();
await page.waitForTimeout(350);
await page.screenshot({ path: 'artifacts/desktop-inspect.png', fullPage: true });
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const mobilePage = await mobile.newPage();
await mobilePage.goto('http://localhost:4173');
await mobilePage.locator('.clip-preview').last().waitFor();
await mobilePage.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
await mobilePage.screenshot({ path: 'artifacts/mobile-viewport.png' });
await browser.close();

const kit = dirname(fileURLToPath(import.meta.resolve('ux-ui-agent-skills/package.json')));
const gates = ['verify_states.mjs', 'verify_responsive.mjs', 'verify_keyboard.mjs', 'verify_target_size.mjs', 'axe_audit.mjs', 'verify_reduced_motion.mjs'];
let failed = false;
for (const gate of gates) {
  const args = [join(kit, 'scripts/gate.mjs'), gate, resolve('artifacts/ui-harness.html')];
  if (gate === 'verify_responsive.mjs') args.push('--scale=1.25');
  const preload = fileURLToPath(new URL('./gate-browser.mjs', import.meta.url));
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, DS_REQUIRE_BROWSER: '1', NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --import=${preload}` } });
  console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  await writeFile(`artifacts/${gate}.log`, result.stdout + result.stderr);
  if (result.status !== 0) failed = true;
}
if (failed) process.exitCode = 1;
