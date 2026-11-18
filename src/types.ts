export type NoteColor = 'amber' | 'rose' | 'lime' | 'sky' | 'violet' | 'slate';

export interface Note {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: NoteColor;
  z: number;
  createdBy: string;
  updatedBy: string;
  updatedAt: number;
}

export interface Edge {
  id: string;
  from: string;
  to: string;
}

export interface Member {
  id: string;
  name: string;
  color: string;
}

/** 自由画笔的一笔 */
export interface Stroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
  createdBy: string;
  updatedAt: number;
}

/** 当前工具 */
export type Tool = 'select' | 'note' | 'pan' | 'draw';

export interface BoardSnapshot {
  id: string;
  title: string;
  notes: Note[];
  edges: Edge[];
  strokes: Stroke[];
  hasPassword: boolean;
  updatedAt: number;
}

export interface BoardMeta {
  id: string;
  title: string;
  noteCount: number;
  edgeCount: number;
  hasPassword: boolean;
  updatedAt: number;
  createdAt: number;
}

export type Op =
  | { kind: 'note.create'; note: Note }
  | { kind: 'note.update'; id: string; patch: Partial<Note>; at?: number }
  | { kind: 'note.delete'; id: string }
  | { kind: 'edge.create'; edge: Edge }
  | { kind: 'edge.delete'; id: string }
  | { kind: 'stroke.create'; stroke: Stroke }
  | { kind: 'stroke.delete'; id: string }
  /** 一次性移动多张便签（一键整理），整体算一步撤销 */
  | { kind: 'notes.layout'; positions: { id: string; x: number; y: number }[] }
  | { kind: 'board.update'; patch: { title?: string } };

export const NOTE_COLORS: NoteColor[] = ['amber', 'rose', 'lime', 'sky', 'violet', 'slate'];

export const NOTE_COLOR_MAP: Record<NoteColor, { bg: string; border: string }> = {
  amber: { bg: '#ffe4a3', border: '#efc75c' },
  rose: { bg: '#ffcede', border: '#f0a3b4' },
  lime: { bg: '#d9f0a6', border: '#b6d97c' },
  sky: { bg: '#c2e4ff', border: '#93c9f2' },
  violet: { bg: '#ded0ff', border: '#bca6f0' },
  slate: { bg: '#e4e8ee', border: '#c2c9d3' },
};
