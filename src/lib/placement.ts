import type { Note } from '../types';

const GAP = 32;

/**
 * 在基准位置附近找一个不与已有便签重叠的空位。
 * 解决「连续新建便签全部叠在同一个坐标、只能看到最后一张」的问题。
 */
export function findFreeSpot(
  notes: Iterable<Note>,
  baseX: number,
  baseY: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const list = [...notes];
  const overlaps = (nx: number, ny: number) =>
    list.some((n) => nx < n.x + n.w && nx + w > n.x && ny < n.y + n.h && ny + h > n.y);

  if (!overlaps(baseX, baseY)) return { x: baseX, y: baseY };

  const stepX = w + GAP;
  const stepY = h + GAP;
  // 从近到远按方向找空位，视觉上会在基准点周围铺开一圈
  const candidates: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
    [2, 0], [-2, 0], [0, 2], [0, -2],
    [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [1, -2], [-1, 2], [-1, -2],
  ];
  for (const [cx, cy] of candidates) {
    const nx = baseX + cx * stepX;
    const ny = baseY + cy * stepY;
    if (!overlaps(nx, ny)) return { x: nx, y: ny };
  }
  return { x: baseX + stepX, y: baseY };
}
