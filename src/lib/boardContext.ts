import { createContext, useContext } from 'react';
import type { BoardStore, CursorStore } from './store';
import type { Connection } from './connection';
import type { Tool } from '../types';

export interface View {
  tx: number;
  ty: number;
  scale: number;
}

export interface PendingLink {
  from: string;
  x: number;
  y: number;
}

export interface BoardContextValue {
  store: BoardStore;
  cursors: CursorStore;
  conn: Connection;
  view: View;
  setView: (updater: (view: View) => View) => void;
  zoomAt: (clientX: number, clientY: number, factor: number) => void;
  toWorld: (clientX: number, clientY: number) => { x: number; y: number };
  createNote: (worldX: number, worldY: number) => void;
  pendingLink: PendingLink | null;
  setPendingLink: (link: PendingLink | null) => void;
  editingNoteId: string | null;
  setEditingNoteId: (id: string | null) => void;
  /** 当前工具：选择 / 便签 / 平移 / 画笔 */
  tool: Tool;
  /** 是否按住空格（临时平移） */
  spaceHeld: boolean;
  /** 打开便签右键菜单 */
  openNoteMenu: (noteId: string, clientX: number, clientY: number) => void;
}

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('BoardContext 未初始化');
  return ctx;
}
