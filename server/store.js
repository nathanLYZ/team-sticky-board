import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

export function newId(len = 10) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

export function hashPassword(password, salt = crypto.randomBytes(12).toString('hex')) {
  const hash = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const actual = crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function applyOpToBoard(board, op) {
  switch (op.kind) {
    case 'note.create': {
      board.notes = board.notes.filter((n) => n.id !== op.note.id);
      board.notes.push(op.note);
      break;
    }
    case 'note.update': {
      const index = board.notes.findIndex((n) => n.id === op.id);
      if (index >= 0) {
        board.notes[index] = {
          ...board.notes[index],
          ...op.patch,
          updatedAt: op.at ?? Date.now(),
        };
      }
      break;
    }
    case 'note.delete': {
      board.notes = board.notes.filter((n) => n.id !== op.id);
      board.edges = board.edges.filter((e) => e.from !== op.id && e.to !== op.id);
      break;
    }
    case 'edge.create': {
      board.edges = board.edges.filter((e) => e.id !== op.edge.id);
      board.edges.push(op.edge);
      break;
    }
    case 'edge.delete': {
      board.edges = board.edges.filter((e) => e.id !== op.id);
      break;
    }
    case 'stroke.create': {
      board.strokes = (board.strokes ?? []).filter((s) => s.id !== op.stroke.id);
      board.strokes.push(op.stroke);
      break;
    }
    case 'stroke.delete': {
      board.strokes = (board.strokes ?? []).filter((s) => s.id !== op.id);
      break;
    }
    case 'notes.layout': {
      // 一键整理：一次性移动多张便签
      (op.positions ?? []).forEach((p) => {
        const note = board.notes.find((n) => n.id === p.id);
        if (!note) return;
        note.x = p.x;
        note.y = p.y;
        note.updatedAt = Date.now();
      });
      break;
    }
    case 'board.update': {
      if (typeof op.patch?.title === 'string' && op.patch.title.trim()) {
        board.title = op.patch.title.trim().slice(0, 60);
      }
      break;
    }
    default:
      break;
  }
  board.updatedAt = Date.now();
  return board;
}

export class BoardStore {
  constructor(dir) {
    this.dir = dir;
    this.boards = new Map();
    this.saveTimers = new Map();
    fs.mkdirSync(this.dir, { recursive: true });
    this.loadAll();
  }

  loadAll() {
    for (const file of fs.readdirSync(this.dir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = fs.readFileSync(path.join(this.dir, file), 'utf8');
        const board = JSON.parse(raw);
        if (board?.id) this.boards.set(board.id, board);
      } catch (err) {
        console.warn(`[store] 跳过损坏的白板文件 ${file}: ${err.message}`);
      }
    }
    console.log(`[store] 已载入 ${this.boards.size} 个白板`);
  }

  list() {
    return [...this.boards.values()]
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .map((b) => ({
        id: b.id,
        title: b.title,
        noteCount: (b.notes ?? []).length,
        edgeCount: (b.edges ?? []).length,
        hasPassword: Boolean(b.hash),
        updatedAt: b.updatedAt ?? 0,
        createdAt: b.createdAt ?? 0,
      }));
  }

  get(id) {
    return this.boards.get(id) ?? null;
  }

  create({ title, password }) {
    const id = newId();
    const { salt, hash } = password ? hashPassword(password) : { salt: '', hash: '' };
    const now = Date.now();
    const board = {
      id,
      title: (title || '未命名白板').trim().slice(0, 60),
      salt,
      hash,
      notes: [],
      edges: [],
      strokes: [],
      createdAt: now,
      updatedAt: now,
    };
    this.boards.set(id, board);
    this.saveNow(board);
    return board;
  }

  applyOp(board, op) {
    applyOpToBoard(board, op);
    this.scheduleSave(board);
    return board;
  }

  scheduleSave(board) {
    if (this.saveTimers.has(board.id)) return;
    const timer = setTimeout(() => {
      this.saveTimers.delete(board.id);
      this.saveNow(board);
    }, 400);
    if (typeof timer.unref === 'function') timer.unref();
    this.saveTimers.set(board.id, timer);
  }

  saveNow(board) {
    const file = path.join(this.dir, `${board.id}.json`);
    const tmp = `${file}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(board, null, 2));
      fs.renameSync(tmp, file);
    } catch (err) {
      console.error(`[store] 保存白板 ${board.id} 失败: ${err.message}`);
    }
  }

  flushAll() {
    for (const board of this.boards.values()) this.saveNow(board);
  }

  /** 删除白板：内存、待写盘定时器、磁盘文件一起清掉 */
  remove(id) {
    const board = this.boards.get(id);
    if (!board) return false;
    const timer = this.saveTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.saveTimers.delete(id);
    }
    this.boards.delete(id);
    const file = path.join(this.dir, `${id}.json`);
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (err) {
      console.error(`[store] 删除白板文件 ${id} 失败: ${err.message}`);
    }
    return true;
  }
}
