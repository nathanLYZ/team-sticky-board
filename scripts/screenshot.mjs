/**
 * 生成一张新功能的界面截图（临时白板，截完即删）。
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
const EXE = findExecutable();
const BASE = 'http://localhost:8787';
const OUT = path.resolve('docs/screenshot-new-ui.png');

const res = await fetch(`${BASE}/api/boards`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: '界面截图用' }),
});
const { id } = await res.json();

let browser;
try {
const browser = await chromium.launch({ headless: true, executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
await page.goto(`${BASE}/#/b/${id}`);
await page.waitForLoadState('networkidle');
await page.locator('input[placeholder="例如：小林"]').fill('小林');
await page.getByRole('button', { name: '进入白板' }).click();
await page.waitForSelector('.canvas');
await page.waitForTimeout(600);

// 先建三张空便签
for (let i = 0; i < 3; i += 1) {
  await page.keyboard.press('n');
  await page.waitForTimeout(220);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(140);
}

// 再按 id 逐张填内容（点便签会抬层级导致 DOM 顺序变化，所以用 id 定位而不是序号）
const ids = await page.locator('.note').evaluateAll((els) => els.map((e) => e.getAttribute('data-note-id')));
const notes = ['这周要做的三件事', '接口联调\n- [x] 登录\n- [ ] 同步', '记得买咖啡豆'];
for (let i = 0; i < notes.length; i += 1) {
  await page.locator(`.note[data-note-id="${ids[i]}"]`).dblclick({ position: { x: 12, y: 12 } });
  await page.waitForSelector('.note-editor');
  await page.locator('.note-editor').fill(notes[i]);
  await page.keyboard.press('Meta+Enter');
  await page.waitForTimeout(260);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(140);
}

// 画一笔
await page.keyboard.press('c');
await page.waitForTimeout(150);
await page.mouse.move(300, 520);
await page.mouse.down();
await page.mouse.move(420, 470, { steps: 8 });
await page.mouse.move(560, 540, { steps: 8 });
await page.mouse.move(700, 480, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(500);

// 选中一张便签 + 打开右键菜单（点左上角空白处，避开待办复选框）
await page.keyboard.press('v');
await page.waitForTimeout(150);
await page.locator(`.note[data-note-id="${ids[1]}"]`).click({ position: { x: 12, y: 12 } });
await page.waitForTimeout(200);
await page.locator(`.note[data-note-id="${ids[1]}"]`).click({ button: 'right', position: { x: 12, y: 12 } });
await page.waitForSelector('.ctx-menu');
await page.waitForTimeout(400);

await page.screenshot({ path: OUT });
console.log('截图已保存：', OUT);

await browser.close();
await fetch(`${BASE}/api/boards/${id}`, { method: 'DELETE' });
console.log('临时白板已删除');
} finally {
  try { await browser?.close(); } catch {}
  await fetch(`${BASE}/api/boards/${id}`, { method: 'DELETE' });
}
