/**
 * 端到端自测：创建白板 → 口令校验 → 双端实时同步 → 落盘 → 重连快照
 * 运行：node scripts/selftest.mjs
 */
import WebSocket from 'ws';
import fs from 'node:fs';

const BASE = 'http://localhost:8787';
const WS = 'ws://localhost:8787/ws';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    const inbox = [];
    const waiters = [];
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      inbox.push(msg);
      const idx = waiters.findIndex((w) => w.match(msg));
      if (idx >= 0) {
        const [w] = waiters.splice(idx, 1);
        w.resolve(msg);
      }
    });
    ws.on('open', () => resolve({ ws, inbox, waitFor: (match, timeout = 3000) =>
      new Promise((res, rej) => {
        const hit = inbox.find(match);
        if (hit) return res(hit);
        const w = { match, resolve: res };
        waiters.push(w);
        setTimeout(() => {
          const i = waiters.indexOf(w);
          if (i >= 0) waiters.splice(i, 1);
          rej(new Error('等待消息超时'));
        }, timeout);
      }) }));
    ws.on('error', reject);
  });
}

const isJoined = (m) => m.t === 'joined';
const isOp = (m) => m.t === 'op';
const isError = (m) => m.t === 'error';
const isPresence = (m) => m.t === 'presence';

const run = async () => {
  /* 1. 创建带口令的白板 */
  const created = await fetch(`${BASE}/api/boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '自测白板', password: 'team-2024' }),
  }).then((r) => r.json());
  check('创建白板返回 id', Boolean(created.id), created.id);
  check('白板标记为有口令', created.hasPassword === true);

  /* 2. 错误口令应被拒绝 */
  const bad = await connect();
  bad.ws.send(JSON.stringify({ t: 'join', boardId: created.id, name: ' intruder', password: 'wrong' }));
  const badResp = await bad.waitFor(isError);
  check('错误口令被拒绝', badResp.code === 'wrong_password', badResp.message);
  bad.ws.close();

  /* 2.5 令牌：口令校验通过后签发，刷新页面可凭令牌免口令重连 */
  const tk = await connect();
  tk.ws.send(JSON.stringify({ t: 'join', boardId: created.id, name: '令牌用户', password: 'team-2024' }));
  const joinedTk = await tk.waitFor(isJoined);
  check('加入成功并签发令牌', typeof joinedTk.token === 'string' && joinedTk.token.length > 20);
  tk.ws.close();

  const tk2 = await connect();
  tk2.ws.send(JSON.stringify({ t: 'join', boardId: created.id, name: '令牌用户', token: joinedTk.token }));
  const joinedTk2 = await tk2.waitFor(isJoined);
  check('凭令牌免口令重连成功', joinedTk2.snapshot?.id === created.id);
  tk2.ws.close();

  const tkBad = await connect();
  tkBad.ws.send(JSON.stringify({ t: 'join', boardId: created.id, name: 'x', token: 'deadbeefdeadbeef' }));
  const tkBadResp = await tkBad.waitFor(isError);
  check('伪造令牌被拒绝', tkBadResp.code === 'wrong_password');
  tkBad.ws.close();

  /* 3. 两个正确口令的客户端加入 */
  const a = await connect();
  a.ws.send(JSON.stringify({ t: 'join', boardId: created.id, name: '小林', password: 'team-2024' }));
  const joinedA = await a.waitFor(isJoined);
  check('正确口令可加入', joinedA.snapshot?.id === created.id);

  const b = await connect();
  b.ws.send(JSON.stringify({ t: 'join', boardId: created.id, name: '阿远', password: 'team-2024' }));
  const joinedB = await b.waitFor(isJoined);
  check('第二人加入拿到成员列表', joinedB.members.length === 2, `在线 ${joinedB.members.length} 人`);

  /* 4. A 端的在线状态应广播给 B */
  await b.waitFor((m) => isPresence(m) && m.members.length === 2);
  check('在线成员变更实时广播', true);

  /* 5. A 新建便签，B 应收到 */
  const note = {
    id: 'note-test-1',
    x: 100,
    y: 120,
    w: 220,
    h: 160,
    text: '# 迭代目标\n- [ ] 登录流程重构',
    color: 'amber',
    z: 1,
    createdBy: joinedA.you.id,
    updatedBy: joinedA.you.id,
    updatedAt: Date.now(),
  };
  a.ws.send(JSON.stringify({ t: 'op', op: { kind: 'note.create', note } }));
  const opOnB = await b.waitFor((m) => isOp(m) && m.op.kind === 'note.create');
  check('便签实时同步到 B 端', opOnB.op.note.id === 'note-test-1');

  /* 6. A 拖动便签（位置更新）同步到 B */
  a.ws.send(
    JSON.stringify({
      t: 'op',
      op: { kind: 'note.update', id: 'note-test-1', patch: { x: 300, y: 240 }, at: Date.now() },
    }),
  );
  const moveOnB = await b.waitFor((m) => isOp(m) && m.op.kind === 'note.update');
  check('位置变更实时同步', moveOnB.op.patch.x === 300 && moveOnB.op.patch.y === 240);

  /* 7. B 新建连线，A 收到 */
  b.ws.send(
    JSON.stringify({
      t: 'op',
      op: { kind: 'edge.create', edge: { id: 'edge-test-1', from: 'note-test-1', to: 'note-test-1' } },
    }),
  );
  const edgeOnA = await a.waitFor((m) => isOp(m) && m.op.kind === 'edge.create');
  check('连线实时同步', edgeOnA.op.edge.id === 'edge-test-1');

  /* 8. 光标广播：发给同伴，但不能回弹给自己 */
  b.ws.send(JSON.stringify({ t: 'cursor', x: 42, y: 88 }));
  const cursorOnA = await a.waitFor((m) => m.t === 'cursor');
  check('实时光标广播', cursorOnA.x === 42 && cursorOnA.y === 88);

  let selfEcho = false;
  b.ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.t === 'cursor' && m.id === joinedB.you.id) selfEcho = true;
  });
  b.ws.send(JSON.stringify({ t: 'cursor', x: 100, y: 200 }));
  await new Promise((r) => setTimeout(r, 400));
  check('光标不会回弹给发送者自己', selfEcho === false);

  /* 9. 落盘：等待服务端写文件 */
  await new Promise((r) => setTimeout(r, 900));
  const meta = await fetch(`${BASE}/api/boards/${created.id}`).then((r) => r.json());
  check('白板落盘且便签计数正确', meta.noteCount === 1, `便签 ${meta.noteCount} 张`);

  /* 10. 新客户端加入应拿到完整快照 */
  const c = await connect();
  c.ws.send(JSON.stringify({ t: 'join', boardId: created.id, name: '小周', password: 'team-2024' }));
  const joinedC = await c.waitFor(isJoined);
  check('重连后快照完整', joinedC.snapshot.notes.length === 1 && joinedC.snapshot.edges.length === 1);

  /* 11. 会话落盘：只存哈希，不存明文令牌 */
  const sessionsRaw = await fs.promises
    .readFile(new URL('../data/sessions.json', import.meta.url), 'utf8')
    .catch(() => '{}');
  const sessionsObj = JSON.parse(sessionsRaw || '{}');
  const sessionValues = JSON.stringify(sessionsObj);
  check(
    '会话以哈希落盘，不含明文令牌',
    Object.keys(sessionsObj).length > 0 && !sessionValues.includes(joinedTk.token),
    `${Object.keys(sessionsObj).length} 条会话`,
  );

  /* 12. 删除白板：口令不对要拦住 */
  const delWrong = await fetch(`${BASE}/api/boards/${created.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong' }),
  });
  const stillThere = await fetch(`${BASE}/api/boards/${created.id}`).then((r) => r.ok);
  check('错误口令无法删除白板', delWrong.status === 403 && stillThere);

  /* 13. 删除白板：口令正确才放行 */
  const delRight = await fetch(`${BASE}/api/boards/${created.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'team-2024' }),
  }).then((r) => r.json());
  const gone = await fetch(`${BASE}/api/boards/${created.id}`).then((r) => r.status === 404);
  check('正确口令可删除白板', delRight.ok === true && gone);

  a.ws.close();
  b.ws.close();
  c.ws.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
  process.exit(failed.length ? 1 : 0);
};

run().catch((err) => {
  console.error('自测异常:', err);
  process.exit(1);
});
