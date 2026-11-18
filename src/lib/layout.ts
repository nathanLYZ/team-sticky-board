import type { Note, NoteColor } from '../types';

export interface LayoutPosition {
  id: string;
  x: number;
  y: number;
}

const NOTE_W = 220;
const NOTE_H = 160;
const GAP_X = 40;
const GAP_Y = 40;

/** 以当前所有便签的外框中心为锚点，整理后整块内容不会「跑出画布」 */
function anchorOf(notes: Note[]): { x: number; y: number } {
  if (!notes.length) return { x: 0, y: 0 };
  const minX = Math.min(...notes.map((n) => n.x));
  const maxX = Math.max(...notes.map((n) => n.x + n.w));
  const minY = Math.min(...notes.map((n) => n.y));
  const maxY = Math.max(...notes.map((n) => n.y + n.h));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** 按颜色分组：每种颜色排成一行，行与行之间留白 */
export function layoutByColor(notes: Note[]): LayoutPosition[] {
  const anchor = anchorOf(notes);
  const groups = new Map<NoteColor, Note[]>();
  for (const n of notes) {
    const list = groups.get(n.color) ?? [];
    list.push(n);
    groups.set(n.color, list);
  }
  const rows = [...groups.values()];
  const totalHeight = rows.length * NOTE_H + Math.max(0, rows.length - 1) * GAP_Y;
  let y = anchor.y - totalHeight / 2;
  const out: LayoutPosition[] = [];
  for (const row of rows) {
    const width = row.length * NOTE_W + Math.max(0, row.length - 1) * GAP_X;
    let x = anchor.x - width / 2;
    for (const n of row) {
      out.push({ id: n.id, x, y });
      x += NOTE_W + GAP_X;
    }
    y += NOTE_H + GAP_Y;
  }
  return out;
}

/** 全部便签按层叠顺序排成整齐的网格 */
export function layoutGrid(notes: Note[], perRow = 4): LayoutPosition[] {
  const anchor = anchorOf(notes);
  const cols = Math.max(1, Math.min(perRow, notes.length));
  const rows = Math.ceil(notes.length / cols);
  const totalW = cols * NOTE_W + Math.max(0, cols - 1) * GAP_X;
  const totalH = rows * NOTE_H + Math.max(0, rows - 1) * GAP_Y;
  const startX = anchor.x - totalW / 2;
  const startY = anchor.y - totalH / 2;
  return notes.map((n, i) => ({
    id: n.id,
    x: startX + (i % cols) * (NOTE_W + GAP_X),
    y: startY + Math.floor(i / cols) * (NOTE_H + GAP_Y),
  }));
}
