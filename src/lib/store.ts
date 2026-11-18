import type { BoardSnapshot, Edge, Member, Note, Op, Stroke } from '../types';
import type { Status } from './connection';

export type Selection = { kind: 'note' | 'edge' | 'stroke'; id: string } | null;

/**
 * 白板数据仓库。
 * 所有变更都通过这里落地：本地操作直接应用并广播给服务端，
 * 远端操作按服务端下发的顺序应用，保证所有端最终状态一致。
 */
export class BoardStore {
  private listeners = new Set<() => void>();
  private version = 0;
  private sender: (op: Op) => void = () => {};

  boardId = '';
  title = '未命名白板';
  notes = new Map<string, Note>();
  edges = new Map<string, Edge>();
  strokes = new Map<string, Stroke>();
  members = new Map<string, Member>();
  status: Status = 'connecting';
  selection: Selection = null;
  draggingNoteId: string | null = null;
  undoStack: Op[] = [];
  redoStack: Op[] = [];
  selfId = '';

  constructor(sender?: (op: Op) => void) {
    if (sender) this.sender = sender;
  }

  setSender(sender: (op: Op) => void) {
    this.sender = sender;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = (): number => this.version;

  private bump() {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }

  /* ---------------- 状态同步 ---------------- */

  setSnapshot(snapshot: BoardSnapshot, selfId: string) {
    this.boardId = snapshot.id;
    this.title = snapshot.title;
    this.selfId = selfId;
    this.notes = new Map(snapshot.notes.map((note) => [note.id, note]));
    this.edges = new Map(snapshot.edges.map((edge) => [edge.id, edge]));
    this.strokes = new Map((snapshot.strokes ?? []).map((stroke) => [stroke.id, stroke]));
    this.bump();
  }

  setMembers(members: Member[]) {
    this.members = new Map(members.map((member) => [member.id, member]));
    this.bump();
  }

  setStatus(status: Status) {
    this.status = status;
    this.bump();
  }

  setTitle(title: string) {
    this.title = title;
    this.bump();
  }

  select(selection: Selection) {
    this.selection = selection;
    this.bump();
  }

  /* ---------------- 读模型 ---------------- */

  sortedNotes(): Note[] {
    return [...this.notes.values()].sort((a, b) => a.z - b.z);
  }

  nextZ(): number {
    let max = 0;
    this.notes.forEach((note) => {
      if (note.z > max) max = note.z;
    });
    return max + 1;
  }

  /* ---------------- 操作应用 ---------------- */

  /** 仅本地应用，不记录历史也不发送（用于拖拽过程中的高频更新） */
  applyLocal(op: Op) {
    this.applyOp(op);
    this.bump();
  }

  /** 远端操作：按服务端顺序应用 */
  applyRemote(op: Op) {
    this.applyOp(op, { fromRemote: true });
    this.bump();
  }

  /** 本地操作：应用 + 记录撤销历史 + 发送服务端 */
  dispatch(op: Op, inverseOverride?: Op) {
    const inverse = inverseOverride ?? this.computeInverse(op);
    this.applyOp(op);
    this.undoStack.push(inverse);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.bump();
    this.sender(op);
  }

  /** 发送到服务端但不记录历史（置顶等「不产生用户价值」的操作） */
  sendOnly(op: Op) {
    this.applyOp(op);
    this.bump();
    this.sender(op);
  }

  /** 仅发送到服务端，不改变本地状态（拖拽过程中的高频同步） */
  broadcast(op: Op) {
    this.sender(op);
  }

  undo(): Op | null {
    const inverse = this.undoStack.pop();
    if (!inverse) return null;
    this.redoStack.push(this.computeInverse(inverse));
    this.applyOp(inverse);
    this.bump();
    this.sender(inverse);
    return inverse;
  }

  redo(): Op | null {
    const forward = this.redoStack.pop();
    if (!forward) return null;
    this.undoStack.push(this.computeInverse(forward));
    this.applyOp(forward);
    this.bump();
    this.sender(forward);
    return forward;
  }

  private applyOp(op: Op, opts?: { fromRemote?: boolean }) {
    switch (op.kind) {
      case 'note.create': {
        this.notes.set(op.note.id, op.note);
        break;
      }
      case 'note.update': {
        const note = this.notes.get(op.id);
        if (!note) break;
        const patch = { ...op.patch };
        // 正在拖拽的便签，忽略「远端」的位置变化，避免画面跳动。
        // 注意只能过滤远端操作：本地拖拽走的是同一条 applyOp 路径，
        // 若一并过滤，自己算出的新坐标会被当场删掉，便签就拖不动了。
        if (opts?.fromRemote && this.draggingNoteId === op.id) {
          delete patch.x;
          delete patch.y;
          delete patch.w;
          delete patch.h;
        }
        this.notes.set(op.id, { ...note, ...patch, updatedAt: op.at ?? Date.now() });
        break;
      }
      case 'note.delete': {
        this.notes.delete(op.id);
        this.edges.forEach((edge, key) => {
          if (edge.from === op.id || edge.to === op.id) this.edges.delete(key);
        });
        if (this.selection?.kind === 'note' && this.selection.id === op.id) this.selection = null;
        break;
      }
      case 'edge.create': {
        this.edges.set(op.edge.id, op.edge);
        break;
      }
      case 'stroke.create': {
        this.strokes.set(op.stroke.id, op.stroke);
        break;
      }
      case 'stroke.delete': {
        this.strokes.delete(op.id);
        break;
      }
      case 'edge.delete': {
        this.edges.delete(op.id);
        if (this.selection?.kind === 'edge' && this.selection.id === op.id) this.selection = null;
        break;
      }
      case 'notes.layout': {
        op.positions.forEach((p) => {
          const note = this.notes.get(p.id);
          if (!note) return;
          this.notes.set(p.id, { ...note, x: p.x, y: p.y, updatedAt: Date.now() });
        });
        break;
      }
      case 'board.update': {
        if (typeof op.patch.title === 'string' && op.patch.title.trim()) {
          this.title = op.patch.title.trim().slice(0, 60);
        }
        break;
      }
      default:
        break;
    }
  }

  private computeInverse(op: Op): Op {
    switch (op.kind) {
      case 'note.create':
        return { kind: 'note.delete', id: op.note.id };
      case 'note.delete': {
        const note = this.notes.get(op.id);
        return note ? { kind: 'note.create', note: { ...note } } : { kind: 'note.update', id: op.id, patch: {} };
      }
      case 'note.update': {
        const note = this.notes.get(op.id);
        if (!note) return { kind: 'note.update', id: op.id, patch: {} };
        const patch: Record<string, unknown> = {};
        Object.keys(op.patch).forEach((key) => {
          patch[key] = (note as unknown as Record<string, unknown>)[key];
        });
        return { kind: 'note.update', id: op.id, patch: patch as Partial<Note> };
      }
      case 'edge.create':
        return { kind: 'edge.delete', id: op.edge.id };
      case 'edge.delete': {
        const edge = this.edges.get(op.id);
        return edge
          ? { kind: 'edge.create', edge: { ...edge } }
          : { kind: 'edge.create', edge: { id: op.id, from: '', to: '' } };
      }
      case 'board.update':
        return { kind: 'board.update', patch: { title: this.title } };
      case 'notes.layout': {
        // 撤销 = 把每张便签放回原位，整体仍然只是一步
        const positions = op.positions
          .map((p) => {
            const note = this.notes.get(p.id);
            return note ? { id: p.id, x: note.x, y: note.y } : null;
          })
          .filter((p): p is { id: string; x: number; y: number } => p !== null);
        return { kind: 'notes.layout', positions };
      }
      case 'stroke.create':
        return { kind: 'stroke.delete', id: op.stroke.id };
      case 'stroke.delete': {
        const stroke = this.strokes.get(op.id);
        return stroke ? { kind: 'stroke.create', stroke: { ...stroke } } : op;
      }
      default:
        return op;
    }
  }
}

/** 远端成员光标，独立存储避免高频更新拖慢便签列表渲染 */
export class CursorStore {
  private listeners = new Set<() => void>();
  private version = 0;

  cursors = new Map<string, { x: number; y: number; ts: number }>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion = (): number => this.version;

  private bump() {
    this.version += 1;
    this.listeners.forEach((listener) => listener());
  }

  set(id: string, x: number, y: number) {
    this.cursors.set(id, { x, y, ts: Date.now() });
    this.bump();
  }

  remove(id: string) {
    if (this.cursors.delete(id)) this.bump();
  }

  clear() {
    if (this.cursors.size === 0) return;
    this.cursors.clear();
    this.bump();
  }
}
