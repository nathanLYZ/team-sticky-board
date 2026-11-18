/**
 * 便签落位（避让重叠）自测：
 *   node scripts/test-placement.mjs
 */
import { findFreeSpot } from '../src/lib/placement.ts';

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const note = (id, x, y, w = 220, h = 160) => ({ id, x, y, w, h });

/* 1. 空画布：保持原位 */
const empty = findFreeSpot([], 100, 200, 220, 160);
check('空画布落在原位', empty.x === 100 && empty.y === 200, `(${empty.x}, ${empty.y})`);

/* 2. 目标位置被占：必须挪走且不重叠 */
const one = findFreeSpot([note('a', 100, 200)], 100, 200, 220, 160);
check('被占用时自动挪到空位', one.x !== 100 || one.y !== 200, `(${one.x}, ${one.y})`);
check(
  '挪开后不与原便签重叠',
  !(one.x < 320 && one.x + 220 > 100 && one.y < 360 && one.y + 160 > 200),
);

/* 3. 连续新建 5 张：每张都互不重叠 */
const notes = [];
for (let i = 0; i < 5; i += 1) {
  const spot = findFreeSpot(notes, 100, 200, 220, 160);
  notes.push(note(`n${i}`, spot.x, spot.y));
}
let overlapFound = false;
for (let i = 0; i < notes.length; i += 1) {
  for (let j = i + 1; j < notes.length; j += 1) {
    const a = notes[i];
    const b = notes[j];
    if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
      overlapFound = true;
    }
  }
}
check('连续新建 5 张互不重叠', !overlapFound, `位置 ${notes.map((n) => `(${n.x},${n.y})`).join(' ')}`);

/* 4. 不同尺寸的便签也能避让 */
const mixed = findFreeSpot([note('big', 100, 200, 400, 300)], 100, 200, 220, 160);
check(
  '能避开更大的便签',
  !(mixed.x < 500 && mixed.x + 220 > 100 && mixed.y < 500 && mixed.y + 160 > 200),
  `(${mixed.x}, ${mixed.y})`,
);

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} 项通过`);
process.exit(failed ? 1 : 0);
