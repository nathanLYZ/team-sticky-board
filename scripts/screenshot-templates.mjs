/**
 * 生成模板库相关截图：面板本身 + 套用模板后的画布。
 * 临时白板，截完即删。
 */
import { chromium } from 'playwright-core';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

function findExecutable() {
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  const dirs = fs
    .readdirSync(cache)
    .filter((d) => d.startsWith('chromium-'))
    .sort()
    .reverse();
  for (const d of dirs) {
    const base = path.join(cache, d, 'chrome-mac-arm64');
    if (!fs.existsSync(base)) continue;
    for (const app of fs.readdirSync(base)) {
      const exe = path.join(base, app, 'Contents/MacOS', app.replace(/\.app$/, ''));
      if (fs.existsSync(exe)) return exe;
    }
  }
  throw new Error('找不到本地 Chromium');
}

const BASE = 'http://localhost:8787';
const res = await fetch(`${BASE}/api/boards`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: '截图用白板' }),
});
const { id } = await res.json();

let browser;
try {
const browser = await chromium.launch({ headless: true, executablePath: findExecutable() });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
await page.goto(`${BASE}/#/b/${id}`);
await page.waitForLoadState('networkidle');
await page.locator('input[placeholder="例如：小林"]').fill('小林');
await page.getByRole('button', { name: '进入白板' }).click();
await page.waitForSelector('.canvas');
await page.waitForTimeout(600);

// 1) 模板库面板
await page.locator('.topbar-actions button[title^="从模板库"]').click();
await page.waitForSelector('.tpl-panel');
await page.waitForTimeout(400);
await page.screenshot({ path: path.resolve('docs/screenshot-template-library.png') });
console.log('模板库面板截图已保存');

// 2) 套用「思维导图」后的画布
await page.locator('.tpl-item').nth(5).click();
await page.waitForTimeout(900);
await page.screenshot({ path: path.resolve('docs/screenshot-template-applied.png') });
console.log('套用模板截图已保存');

// 3) 一键整理：按颜色
await page.locator('.topbar-actions button[title^="从模板库"]').click();
await page.waitForSelector('.tpl-panel');
await page.getByRole('button', { name: '按颜色' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: path.resolve('docs/screenshot-template-tidy.png') });
console.log('一键整理截图已保存');

await browser.close();
await fetch(`${BASE}/api/boards/${id}`, { method: 'DELETE' });
console.log('临时白板已删除');
} finally {
  try { await browser?.close(); } catch {}
  await fetch(`${BASE}/api/boards/${id}`, { method: 'DELETE' });
}
