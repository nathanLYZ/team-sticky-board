/**
 * 模拟第二个用户「阿远」：加入白板 → 建便签 → 移动光标 → 保持在线。
 * 用法：node scripts/mock-user.mjs <boardId> [昵称]
 */
import WebSocket from 'ws';

const boardId = process.argv[2] ?? 'a43rrsg93g';
const name = process.argv[3] ?? '阿远';

const ws = new WebSocket('ws://localhost:8787/ws');
const noteId = `mock-${Date.now().toString(36)}`;

ws.on('open', () => {
  ws.send(JSON.stringify({ t: 'join', boardId, name, password: '' }));
  setTimeout(() => {
    ws.send(
      JSON.stringify({
        t: 'op',
        op: {
          kind: 'note.create',
          note: {
            id: noteId,
            x: 620,
            y: 120,
            w: 240,
            h: 170,
            text: '# 阿远的便签\n- [ ] 联调支付回调\n- [x] 输出接口文档\n**负责人**:阿远',
            color: 'sky',
            z: 5,
            createdBy: 'mock',
            updatedBy: 'mock',
            updatedAt: Date.now(),
          },
        },
      }),
    );
    console.log(`[mock] 已加入 ${boardId}，便签 ${noteId} 已发送`);
  }, 400);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.t === 'joined') console.log(`[mock] 加入成功，在线成员 ${msg.members.length} 人`);
  if (msg.t === 'error') console.log('[mock] 错误:', msg.message);
});

/* 光标缓慢来回移动，让对端看到实时光标 */
let t = 0;
const timer = setInterval(() => {
  t += 0.08;
  ws.send(
    JSON.stringify({
      t: 'cursor',
      x: 500 + Math.cos(t) * 180,
      y: 320 + Math.sin(t * 1.3) * 120,
    }),
  );
}, 60);

setTimeout(() => {
  clearInterval(timer);
  ws.close();
  process.exit(0);
}, 120000);
