/**
 * 一次性数据修复：把完全重叠的旧便签错开摆放到右侧。
 * 起因：旧版本新建便签没有避让逻辑，会全部落在同一坐标、互相盖住。
 *   node scripts/spread-overlaps.mjs
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data', 'boards');

/** 服务运行中时直接改文件会被服务端内存状态覆盖，所以必须先停服务 */
function serverRunning(port = 8787) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

if (await serverRunning()) {
  console.error('检测到服务正在运行（端口 8787）。');
  console.error('服务端会用内存状态覆盖磁盘文件，请先停掉服务再运行本脚本：');
  console.error('  pkill -f "node server/index.js" && node scripts/spread-overlaps.mjs && npm start');
  process.exit(1);
}

if (!fs.existsSync(dir)) {
  console.log('暂无数据目录，跳过');
  process.exit(0);
}

const overlapArea = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  return (w * h) / Math.min(a.w * a.h, b.w * b.h);
};

let changed = 0;
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.json')) continue;
  const filePath = path.join(dir, file);
  const board = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const notes = board.notes ?? [];
  const placed = [];

  for (const note of notes) {
    let candidate = { ...note };
    // 与已放置的便签重叠超过 60% 就往右挪一张便签的宽度
    let guard = 0;
    while (placed.some((p) => overlapArea(candidate, p) > 0.6) && guard < 50) {
      candidate.x += candidate.w + 32;
      guard += 1;
    }
    if (candidate.x !== note.x) changed += 1;
    placed.push(candidate);
  }

  const moved = placed.filter((n, i) => n.x !== notes[i].x);
  if (moved.length) {
    board.notes = placed;
    fs.writeFileSync(filePath, JSON.stringify(board, null, 2));
    console.log(`白板「${board.title}」错开 ${moved.length} 张便签`);
  }
}
console.log(changed ? `共错开 ${changed} 张便签` : '没有需要错开的便签');
