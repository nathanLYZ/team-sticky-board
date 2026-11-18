/**
 * 界面回归测试：用 Playwright 真浏览器把新交互逐个走一遍。
 *
 * 覆盖：空格+拖拽平移 / 滚轮缩放 / Shift+滚轮横移 / V N P C 工具切换 /
 *       自由画笔（落盘 + 撤销）/ 便签右键菜单（换色·复制·编辑·删除）/
 *       缩略图跳转 / 双客户端实时同步。
 *
 * 跑法：node scripts/verify-ui.mjs
 * 每次会自建一个临时白板，测完自动删除。
 */
import { chromium } from 'playwright-core';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const BASE = process.env.BOARD_BASE || 'http://localhost:8787';
const EXE_CANDIDATES = [
  path.join(
    os.homedir(),
    'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  ),
  path.join(
    os.homedir(),
    'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell',
  ),
];

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function findExecutable() {
  for (const p of EXE_CANDIDATES) if (fs.existsSync(p)) return p;
  // 缓存目录里可能有多个版本，挑最新的一个
  const cache = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (fs.existsSync(cache)) {
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
  }
  throw new Error('找不到本地 Chromium，请先 npx playwright install chromium');
}

async function api(method, pathname, body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

/** 进入白板（填昵称 + 点进入） */
async function join(page, boardId, name) {
  await page.goto(`${BASE}/#/b/${boardId}`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[placeholder="例如：小林"]').fill(name);
  await page.getByRole('button', { name: '进入白板' }).click();
  await page.waitForSelector('.canvas', { timeout: 5000 });
  await page.waitForTimeout(400); // 等自动 fitToContent 结束
}

const countNotes = (page) => page.locator('.note').count();
const viewTransform = (page) =>
  page.evaluate(() => document.querySelector('.world')?.getAttribute('style') || '');
const tool = (page) =>
  page.evaluate(() => document.querySelector('.canvas')?.className || '');
const zoomText = (page) => page.locator('.zoom-level').innerText();

/** 找一个真正空着的画布位置（避开便签、色板、工具栏、缩略图） */
async function findEmptyPoint(page) {
  const candidates = [
    [300, 250],
    [900, 180],
    [250, 600],
    [700, 620],
    [1000, 380],
    [430, 160],
  ];
  for (const [x, y] of candidates) {
    const ok = await page.evaluate(
      ([px, py]) => document.elementFromPoint(px, py)?.classList?.contains('canvas') ?? false,
      [x, y],
    );
    if (ok) return [x, y];
  }
  throw new Error('找不到空白画布位置');
}

/** 找一张没被缩略图等浮层挡住的便签（右下角浮层会拦截点击） */
async function findClickableNote(page) {
  const boxes = await page.locator('.note').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { id: el.getAttribute('data-note-id'), x: r.x + 16, y: r.y + 16 };
    }),
  );
  for (const b of boxes) {
    const hit = await page.evaluate(
      ([px, py]) => document.elementFromPoint(px, py)?.closest('.note')?.getAttribute('data-note-id') ?? null,
      [b.x, b.y],
    );
    if (hit === b.id) return b.id;
  }
  return null;
}

async function main() {
  const created = await api('POST', '/api/boards', { title: 'UI 回归测试板' });
  if (created.status !== 201) throw new Error(`建临时白板失败：${JSON.stringify(created.data)}`);
  const boardId = created.data.id;
  console.log(`临时白板：${boardId}\n`);

  const browser = await chromium.launch({ headless: true, executablePath: findExecutable() });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  try {
    await join(page, boardId, '测试员A');

    console.log('【工具切换】');
    for (const [key, expect] of [
      ['v', 'tool-select'],
      ['p', 'tool-pan'],
      ['c', 'tool-draw'],
      ['n', 'tool-note'],
    ]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(120);
      check(`按 ${key.toUpperCase()} 切到 ${expect}`, (await tool(page)).includes(expect), await tool(page));
      if (key === 'n') {
        await page.keyboard.press('Escape'); // 退出便签编辑，把焦点还给画布
        await page.waitForTimeout(150);
      }
    }
    await page.keyboard.press('v');
    await page.waitForTimeout(120);

    console.log('\n【取消选择（再点一次同一个工具）】');
    const panBtn = page.locator('.toolbar button[title^="抓手平移"]');
    await panBtn.click();
    await page.waitForTimeout(150);
    check('点抓手进入平移模式', (await tool(page)).includes('tool-pan'), await tool(page));
    await panBtn.click();
    await page.waitForTimeout(150);
    check('再点一次抓手回到选择工具', (await tool(page)).includes('tool-select'), await tool(page));

    const drawBtn = page.locator('.toolbar button[title^="画笔"]');
    await drawBtn.click();
    await page.waitForTimeout(150);
    check('点画笔进入画笔模式', (await tool(page)).includes('tool-draw'), await tool(page));
    await drawBtn.click();
    await page.waitForTimeout(150);
    check('再点一次画笔回到选择工具', (await tool(page)).includes('tool-select'), await tool(page));

    const noteBtn = page.locator('.toolbar button[title^="便签工具"]');
    await noteBtn.click();
    await page.waitForTimeout(150);
    check('点便签工具进入便签模式', (await tool(page)).includes('tool-note'), await tool(page));
    await noteBtn.click();
    await page.waitForTimeout(150);
    check('再点一次便签工具回到选择工具', (await tool(page)).includes('tool-select'), await tool(page));

    await page.keyboard.press('p');
    await page.waitForTimeout(150);
    check('按 P 进入平移模式', (await tool(page)).includes('tool-pan'), await tool(page));
    await page.keyboard.press('p');
    await page.waitForTimeout(150);
    check('再按一次 P 回到选择工具', (await tool(page)).includes('tool-select'), await tool(page));

    console.log('\n【滚轮缩放 / Shift 滚轮横移】');
    const zoom0 = await zoomText(page);
    await page.mouse.move(640, 380);
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(200);
    const zoom1 = await zoomText(page);
    check('滚轮向上放大', parseInt(zoom1) > parseInt(zoom0), `${zoom0} → ${zoom1}`);

    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(200);
    const zoom2 = await zoomText(page);
    check('滚轮向下缩小', parseInt(zoom2) < parseInt(zoom1), `${zoom1} → ${zoom2}`);

    const before = await viewTransform(page);
    const txBefore = Number(before.match(/translate\((-?[\d.]+)px/)?.[1] ?? NaN);
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 200);
    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);
    const after = await viewTransform(page);
    const txAfter = Number(after.match(/translate\((-?[\d.]+)px/)?.[1] ?? NaN);
    check('Shift+滚轮横向平移', Math.abs(txAfter - txBefore) > 10, `tx ${txBefore} → ${txAfter}`);

    console.log('\n【空格 + 拖拽平移】');
    await page.keyboard.press('n'); // 便签工具（会建一张便签，先记下基准）
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape'); // 退出便签编辑，否则焦点在输入框里、空格会变成空格字符
    await page.waitForTimeout(200);
    const notesBefore = await countNotes(page);
    const viewBefore = await viewTransform(page);
    const [sx, sy] = await findEmptyPoint(page);
    await page.keyboard.down('Space');
    await page.waitForTimeout(80);
    const panningClass = (await tool(page)).includes('is-panning');
    check('按住空格时画布进入 is-panning 状态', panningClass, await tool(page));
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(sx + 160, sy + 80, { steps: 10 });
    await page.mouse.move(sx + 220, sy + 120, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await page.waitForTimeout(250);
    if (process.env.DEBUG_UI) {
      console.log(
        '    [debug]',
        JSON.stringify(
          await page.evaluate(
            ([px, py]) => {
              const el = document.elementFromPoint(px, py);
              return {
                at: el?.className || el?.tagName,
                active: document.activeElement?.className || document.activeElement?.tagName,
                canvas: document.querySelector('.canvas')?.className,
                transform: document.querySelector('.world')?.getAttribute('style'),
              };
            },
            [sx, sy],
          ),
        ),
      );
    }
    const viewAfter = await viewTransform(page);
    const notesAfter = await countNotes(page);
    check('空格+拖拽后视口发生平移', viewBefore !== viewAfter, `${viewBefore} → ${viewAfter}`);
    check('空格+拖拽不会新建便签', notesAfter === notesBefore, `便签数 ${notesBefore} → ${notesAfter}`);

    // 对照组：不按空格，在便签工具下拖拽应新建便签
    const [cx, cy] = await findEmptyPoint(page);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(250);
    check('松开空格后点击可以新建便签', (await countNotes(page)) === notesAfter + 1);

    console.log('\n【抓手工具平移】');
    await page.keyboard.press('p');
    await page.waitForTimeout(120);
    const panBefore = await viewTransform(page);
    const [px0, py0] = await findEmptyPoint(page);
    await page.mouse.move(px0, py0);
    await page.mouse.down();
    await page.mouse.move(px0 + 200, py0 + 120, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const panAfter = await viewTransform(page);
    check('抓手拖拽平移画布', panBefore !== panAfter, `${panBefore} → ${panAfter}`);

    console.log('\n【自由画笔】');
    await page.keyboard.press('c');
    await page.waitForTimeout(120);
    const [dx0, dy0] = await findEmptyPoint(page);
    await page.mouse.move(dx0, dy0);
    await page.mouse.down();
    await page.mouse.move(dx0 + 90, dy0 + 40, { steps: 6 });
    await page.mouse.move(dx0 + 180, dy0 + 20, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const strokeCount = await page.locator('.stroke-layer path').count();
    check('画笔产生一条笔画', strokeCount >= 1, `path 数 ${strokeCount}`);

    const boardAfterDraw = await api('GET', `/api/boards/${boardId}`);
    check('画笔后白板元数据可读', boardAfterDraw.status === 200);

    console.log('\n【撤销】');
    const strokesBeforeUndo = await page.locator('.stroke-layer path').count();
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(400);
    const strokesAfterUndo = await page.locator('.stroke-layer path').count();
    check('⌘Z 撤销掉最后一笔', strokesAfterUndo === strokesBeforeUndo - 1, `${strokesBeforeUndo} → ${strokesAfterUndo}`);
    await page.keyboard.press('Meta+Shift+z');
    await page.waitForTimeout(400);
    const strokesAfterRedo = await page.locator('.stroke-layer path').count();
    check('⇧⌘Z 重做回来', strokesAfterRedo === strokesBeforeUndo, `${strokesAfterUndo} → ${strokesAfterRedo}`);

    console.log('\n【编辑态切换】');
    // 新建便签会直接进入编辑态；此时点另一张便签，当前编辑应当关闭并保存草稿
    await page.keyboard.press('v');
    await page.waitForTimeout(120);
    await page.keyboard.press('n');
    await page.waitForTimeout(250);
    check('新建便签后自动进入编辑态', (await page.locator('.note-editor').count()) === 1);
    await page.locator('.note-editor').fill('草稿内容');
    await page.waitForTimeout(150);
    const ids2 = await page.locator('.note').evaluateAll((els) => els.map((e) => e.getAttribute('data-note-id')));
    const editingId = await page.locator('.note.is-editing').getAttribute('data-note-id');
    const otherId = ids2.find((id) => id !== editingId);
    await page.locator(`.note[data-note-id="${otherId}"]`).click({ position: { x: 12, y: 12 } });
    await page.waitForTimeout(400);
    check('点另一张便签会关闭当前编辑态', (await page.locator('.note-editor').count()) === 0);
    const savedText = await page
      .locator(`.note[data-note-id="${editingId}"] .note-body`)
      .innerText()
      .catch(() => '');
    check('关闭编辑时草稿被保存', savedText.includes('草稿内容'), savedText || '(空)');

    console.log('\n【便签右键菜单】');
    await page.keyboard.press('v');
    await page.waitForTimeout(120);
    const targetNoteId = await findClickableNote(page);
    check('找到可点击的便签', Boolean(targetNoteId), targetNoteId || '');
    const note = page.locator(`.note[data-note-id="${targetNoteId}"]`);
    await note.click({ button: 'right', position: { x: 16, y: 16 } });
    await page.waitForSelector('.ctx-menu', { timeout: 3000 });
    check('右键弹出便签菜单', await page.locator('.ctx-menu').isVisible());
    check('菜单含 6 个颜色色板', (await page.locator('.ctx-menu .swatch').count()) === 6);
    check(
      '菜单含 编辑/复制/删除 三项',
      (await page.locator('.ctx-menu .ctx-item').count()) === 3,
    );

    await page.locator('.ctx-menu .swatch-sky').click();
    await page.waitForTimeout(300);
    const cls = await page.locator(`.note[data-note-id="${targetNoteId}"]`).getAttribute('class');
    check('换色生效（sky）', (cls || '').includes('note-sky'), cls || '');

    // 复制便签：副本不能压在原便签上
    await page.locator(`.note[data-note-id="${targetNoteId}"]`).click({ button: 'right', position: { x: 16, y: 16 } });
    await page.waitForSelector('.ctx-menu', { timeout: 3000 });
    const notesBeforeCopy = await countNotes(page);
    await page.getByRole('button', { name: '复制便签' }).click();
    await page.waitForTimeout(400);
    check('复制便签新增一张', (await countNotes(page)) === notesBeforeCopy + 1);

    const boxes = await page.locator('.note').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.getAttribute('data-note-id'), x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    let overlap = null;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
          overlap = `${a.id} ↔ ${b.id}`;
        }
      }
    }
    check('所有便签互不重叠', !overlap, overlap || `${boxes.length} 张便签`);

    // 删除便签
    await page.locator(`.note[data-note-id="${targetNoteId}"]`).click({ button: 'right', position: { x: 16, y: 16 } });
    await page.waitForSelector('.ctx-menu', { timeout: 3000 });
    await page.getByRole('button', { name: '删除便签' }).click();
    await page.waitForTimeout(400);
    check(
      '删除便签生效',
      (await page.locator(`.note[data-note-id="${targetNoteId}"]`).count()) === 0,
    );

    console.log('\n【缩略图跳转】');
    await page.locator('.zoom-level').click(); // 适应内容
    await page.waitForTimeout(400);
    const miniBefore = await viewTransform(page);
    const mini = page.locator('.minimap svg');
    const miniBox = await mini.boundingBox();
    await page.mouse.click(miniBox.x + miniBox.width * 0.15, miniBox.y + miniBox.height * 0.8);
    await page.waitForTimeout(400);
    const miniAfter = await viewTransform(page);
    check('点击缩略图跳转视口', miniBefore !== miniAfter, `${miniBefore} → ${miniAfter}`);

    console.log('\n【模板库】');
    await page.getByRole('button', { name: '模板' }).click();
    await page.waitForSelector('.tpl-panel', { timeout: 3000 });
    check('顶栏「模板」按钮打开模板库', await page.locator('.tpl-panel').isVisible());
    check('模板库列出 8 个模板', (await page.locator('.tpl-item').count()) === 8, `${await page.locator('.tpl-item').count()} 个`);
    check('模板库有「一键整理」区', (await page.locator('.tpl-tidy-btn').count()) === 2);

    const notesBeforeTpl = await countNotes(page);
    await page.locator('.tpl-item').first().click(); // 复盘四象限：4 张便签
    await page.waitForTimeout(700);
    check('套用模板生成 4 张便签', (await countNotes(page)) === notesBeforeTpl + 4, `${notesBeforeTpl} → ${await countNotes(page)}`);
    check('套用后模板库自动关闭', (await page.locator('.tpl-panel').count()) === 0);

    await page.getByRole('button', { name: '模板' }).click();
    await page.waitForSelector('.tpl-panel', { timeout: 3000 });
    const edgesBefore = await page.locator('.edge-layer path.edge').count();
    await page.locator('.tpl-item').nth(1).click(); // 用户旅程：5 张便签 + 4 条连线
    await page.waitForTimeout(700);
    check('带连线的模板生成 5 张便签', (await countNotes(page)) === notesBeforeTpl + 9, `${await countNotes(page)}`);
    check(
      '模板连线生成',
      (await page.locator('.edge-layer path.edge').count()) === edgesBefore + 4,
      `${edgesBefore} → ${await page.locator('.edge-layer path.edge').count()}`,
    );

    console.log('\n【一键整理】');
    await page.getByRole('button', { name: '模板' }).click();
    await page.waitForSelector('.tpl-panel', { timeout: 3000 });
    const posBefore = await page.locator('.note').evaluateAll((els) => els.map((e) => e.style.left + ',' + e.style.top));
    await page.getByRole('button', { name: '按颜色' }).click();
    await page.waitForTimeout(600);
    const posAfter = await page.locator('.note').evaluateAll((els) => els.map((e) => e.style.left + ',' + e.style.top));
    check('按颜色整理后便签位置变化', JSON.stringify(posBefore) !== JSON.stringify(posAfter));
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(500);
    const posUndo = await page.locator('.note').evaluateAll((els) => els.map((e) => e.style.left + ',' + e.style.top));
    check('一步撤销即可还原整理结果', JSON.stringify(posUndo) === JSON.stringify(posBefore));

    console.log('\n【双客户端实时同步】');
    const page2 = await ctx.newPage();
    await join(page2, boardId, '测试员B');
    const n1 = await countNotes(page);
    const n2 = await countNotes(page2);
    check('新加入端拿到已有便签', n1 === n2, `${n1} vs ${n2}`);

    await page.keyboard.press('n');
    await page.waitForTimeout(600);
    check('A 建便签后 B 同步看到', (await countNotes(page2)) === n2 + 1, `B: ${n2} → ${await countNotes(page2)}`);

    const s1 = await page.locator('.stroke-layer path').count();
    const s2 = await page.locator('.stroke-layer path').count();
    check('两端笔画数一致', s1 === s2, `${s1} vs ${s2}`);
    await page2.close();

    console.log('\n【控制台】');
    const realErrors = consoleErrors.filter((e) => !/favicon|WebSocket.*(closed|reconnect)/i.test(e));
    check('页面无 JS 报错', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    const del = await api('DELETE', `/api/boards/${boardId}`);
    console.log(`\n临时白板已删除：${del.status === 200 ? '成功' : `失败(${del.status})`}`);
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  if (fail) {
    console.log('失败项：');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
