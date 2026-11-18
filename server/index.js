import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { BoardStore, newId, verifyPassword } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STATIC_DIR = path.join(ROOT, 'dist', 'client');
const DATA_DIR = path.join(ROOT, 'data', 'boards');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

const store = new BoardStore(DATA_DIR);

/** boardId -> Set<conn> */
const rooms = new Map();
/** 本机在局域网里的地址：分享给同事时要用它，而不是 localhost */
function lanAddress() {
  const nets = os.networkInterfaces();
  const found = [];
  for (const [name, addrs] of Object.entries(nets)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      found.push({ name, address: addr.address });
    }
  }
  // 优先物理网卡（en0/en1…），其次常见私网段，最后才是其它网卡（如 VPN 隧道）
  const preferred =
    found.find((n) => /^en\d+$/.test(n.name)) ??
    found.find((n) => /^192\.168\./.test(n.address)) ??
    found.find((n) => /^10\./.test(n.address)) ??
    found.find((n) => /^172\.(1[6-9]|2\d|3[01])\./.test(n.address)) ??
    found[0];
  return preferred?.address ?? '127.0.0.1';
}

/** connId -> conn */
const connections = new Map();
/** token 的 sha256 -> { boardId, name, expiresAt } 刷新页面后免重复输口令 */
const sessions = new Map();
const SESSION_TTL = 12 * 60 * 60 * 1000;
const SESSIONS_FILE = path.join(ROOT, 'data', 'sessions.json');

/** 会话只以哈希形式落盘，明文令牌不写文件 */
function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function loadSessions() {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const now = Date.now();
    let kept = 0;
    for (const [hash, session] of Object.entries(raw ?? {})) {
      if (!session?.expiresAt || session.expiresAt < now) continue;
      sessions.set(hash, session);
      kept += 1;
    }
    console.log(`[session] 载入 ${kept} 个有效会话`);
  } catch (err) {
    console.warn(`[session] 会话文件读取失败: ${err.message}`);
  }
}

function saveSessions() {
  try {
    const tmp = `${SESSIONS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(sessions), null, 2));
    fs.renameSync(tmp, SESSIONS_FILE);
  } catch (err) {
    console.error(`[session] 会话保存失败: ${err.message}`);
  }
}

function issueToken(boardId, name) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(tokenHash(token), { boardId, name, expiresAt: Date.now() + SESSION_TTL });
  saveSessions();
  return token;
}

function resolveToken(token, boardId) {
  if (!token) return null;
  const key = tokenHash(token);
  const session = sessions.get(key);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(key);
    saveSessions();
    return null;
  }
  return session.boardId === boardId ? session : null;
}

const MEMBER_COLORS = [
  '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f43f5e', '#7c3aed',
];

function pickColor(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return MEMBER_COLORS[hash % MEMBER_COLORS.length];
}

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function roomOf(boardId) {
  let room = rooms.get(boardId);
  if (!room) {
    room = new Set();
    rooms.set(boardId, room);
  }
  return room;
}

function membersOf(boardId) {
  const room = rooms.get(boardId);
  if (!room) return [];
  return [...room]
    .map((conn) => ({ id: conn.memberId, name: conn.memberName, color: conn.memberColor }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function broadcast(boardId, payload, except = null) {
  const room = rooms.get(boardId);
  if (!room) return;
  for (const conn of room) {
    if (conn === except) continue;
    send(conn.ws, payload);
  }
}

function broadcastPresence(boardId) {
  broadcast(boardId, { t: 'presence', members: membersOf(boardId) });
}

function snapshotOf(board) {
  return {
    id: board.id,
    title: board.title,
    notes: board.notes ?? [],
    edges: board.edges ?? [],
    strokes: board.strokes ?? [],
    hasPassword: Boolean(board.hash),
    updatedAt: board.updatedAt ?? 0,
  };
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1024 * 256) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('JSON 格式错误'));
      }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function serveStatic(req, res, url) {
  if (!fs.existsSync(STATIC_DIR)) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<meta charset="utf-8"><body style="font-family:system-ui;padding:40px;line-height:1.8">' +
        '<h2>前端尚未构建</h2><p>开发模式请访问 <a href="http://localhost:5173">http://localhost:5173</a></p>' +
        '<p>生产模式请先执行 <code>npm run build</code>，再重启本服务。</p></body>',
    );
    return;
  }
  const requested = decodeURIComponent(url.pathname);
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(STATIC_DIR, safePath);
  if (!filePath.startsWith(STATIC_DIR)) filePath = STATIC_DIR;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(STATIC_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, url) {
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/api/server') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ip: lanAddress(), port: PORT }));
    return;
  }

  if (req.method === 'GET' && pathname === '/api/boards') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ boards: store.list() }));
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/boards/')) {
    const id = pathname.slice('/api/boards/'.length);
    const board = store.get(id);
    if (!board) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '白板不存在' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        id: board.id,
        title: board.title,
        hasPassword: Boolean(board.hash),
        noteCount: (board.notes ?? []).length,
        updatedAt: board.updatedAt ?? 0,
      }),
    );
    return;
  }

  if (req.method === 'POST' && pathname === '/api/boards') {
    try {
      const body = await readJsonBody(req);
      const board = store.create({ title: body.title, password: body.password });
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ id: board.id, title: board.title, hasPassword: Boolean(board.hash) }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/boards/')) {
    const id = pathname.slice('/api/boards/'.length);
    const board = store.get(id);
    if (!board) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '白板不存在' }));
      return;
    }
    // 有口令的白板必须校验口令才能删除，避免误删或被他人清空
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch {
      /* 无 body 视为空 */
    }
    if (board.hash && !verifyPassword(String(body.password || ''), board.salt, board.hash)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: '口令不正确，无法删除' }));
      return;
    }
    // 断开该白板上的所有连接，避免留下僵尸连接
    for (const conn of rooms.get(board.id) ?? []) {
      send(conn.ws, { t: 'error', code: 'board_deleted', message: '该白板已被删除' });
      try {
        conn.ws.close();
      } catch {
        /* ignore */
      }
    }
    rooms.delete(board.id);
    store.remove(board.id);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, id: board.id }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not Found' }));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      console.error('[api]', err);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '服务器内部错误' }));
    });
    return;
  }
  serveStatic(req, res, url);
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  const conn = {
    ws,
    connId: newId(12),
    boardId: null,
    memberId: newId(10),
    memberName: '匿名',
    memberColor: pickColor(newId(6)),
    alive: true,
  };
  connections.set(conn.connId, conn);

  ws.on('pong', () => {
    conn.alive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    handleMessage(conn, msg);
  });

  ws.on('close', () => {
    connections.delete(conn.connId);
    if (conn.boardId) {
      const room = rooms.get(conn.boardId);
      if (room) {
        room.delete(conn);
        if (room.size === 0) rooms.delete(conn.boardId);
      }
      broadcastPresence(conn.boardId);
    }
  });

  ws.on('error', (err) => {
    console.warn('[ws] 连接错误:', err.message);
  });
});

function handleMessage(conn, msg) {
  switch (msg?.t) {
    case 'join': {
      const board = store.get(String(msg.boardId || ''));
      if (!board) {
        send(conn.ws, { t: 'error', code: 'board_not_found', message: '白板不存在或已被删除' });
        return;
      }
      // 有口令时：令牌或明文口令任一通过即可
      const session = resolveToken(msg.token, board.id);
      if (board.hash && !session && !verifyPassword(String(msg.password || ''), board.salt, board.hash)) {
        send(conn.ws, { t: 'error', code: 'wrong_password', message: '白板口令不正确' });
        return;
      }

      if (conn.boardId) {
        const old = rooms.get(conn.boardId);
        if (old) old.delete(conn);
        broadcastPresence(conn.boardId);
      }

      conn.boardId = board.id;
      conn.memberName = String(msg.name || session?.name || '匿名').trim().slice(0, 24) || '匿名';
      conn.memberColor = pickColor(conn.memberId);
      roomOf(board.id).add(conn);

      send(conn.ws, {
        t: 'joined',
        snapshot: snapshotOf(board),
        members: membersOf(board.id),
        you: { id: conn.memberId, name: conn.memberName, color: conn.memberColor },
        token: issueToken(board.id, conn.memberName),
      });
      broadcastPresence(board.id);
      console.log(`[ws] ${conn.memberName} 加入白板 ${board.id}（当前 ${roomOf(board.id).size} 人）`);
      return;
    }

    case 'op': {
      if (!conn.boardId || !msg.op) return;
      const board = store.get(conn.boardId);
      if (!board) return;
      store.applyOp(board, msg.op);
      // 广播给房间内所有人（含发起者），保证所有端按同一顺序应用，最终状态一致
      broadcast(conn.boardId, { t: 'op', op: msg.op });
      return;
    }

    case 'cursor': {
      if (!conn.boardId) return;
      // 注意：except 传连接对象本身，传 ws 会导致发送者收到自己的光标
      broadcast(
        conn.boardId,
        { t: 'cursor', id: conn.memberId, x: Number(msg.x) || 0, y: Number(msg.y) || 0 },
        conn,
      );
      return;
    }

    default:
      return;
  }
}

const heartbeat = setInterval(() => {
  for (const conn of connections.values()) {
    if (!conn.alive) {
      conn.ws.terminate();
      continue;
    }
    conn.alive = false;
    try {
      conn.ws.ping();
    } catch {
      /* ignore */
    }
  }
}, 30000);
if (typeof heartbeat.unref === 'function') heartbeat.unref();

loadSessions();

server.listen(PORT, HOST, () => {
  console.log(`[server] 协作白板服务已启动: http://localhost:${PORT}`);
  console.log(`[server] 数据目录: ${DATA_DIR}`);
});

function shutdown() {
  console.log('\n[server] 正在保存数据并退出…');
  store.flushAll();
  clearInterval(heartbeat);
  for (const conn of connections.values()) conn.ws.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
