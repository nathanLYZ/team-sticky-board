import { useCallback, useEffect, useState } from 'react';
import type { BoardMeta } from '../types';
import { formatTime } from '../lib/util';

export default function Home() {
  const [boards, setBoards] = useState<BoardMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState(() => localStorage.getItem('tsb.nickname') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const loadBoards = useCallback(() => {
    fetch('/api/boards')
      .then((res) => res.json())
      .then((data) => setBoards(data.boards ?? []))
      .catch(() => setError('无法读取白板列表，请确认服务端已启动'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  const createBoard = async () => {
    if (!title.trim()) {
      setError('给白板起个名字吧');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '创建失败');
      if (nickname.trim()) localStorage.setItem('tsb.nickname', nickname.trim());
      window.location.hash = `#/b/${data.id}`;
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  };

  return (
    <div className="home">
      <header className="home-hero">
        <div className="gate-brand">
          <span className="brand-mark" />
          协作白板
        </div>
        <h1>
          团队一起用的<span className="accent">便签白板</span>
        </h1>
        <p>
          整理工作、记录待办、规划产品逻辑。多人同时在线，改动实时同步，光标可见，
          不怕覆盖别人的内容。
        </p>
      </header>

      <main className="home-main">
        <section className="panel create-panel">
          <h2>新建白板</h2>
          <label className="field">
            <span>白板名称</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：本周迭代规划"
              onKeyDown={(e) => {
                if (e.key === 'Enter') createBoard();
              }}
            />
          </label>
          <label className="field">
            <span>白板口令（可选）</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="团队内部共享，防止外人误入"
            />
          </label>
          <label className="field">
            <span>你的昵称</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="队友看到的名字"
            />
          </label>
          {error && <div className="gate-error">{error}</div>}
          <button type="button" className="primary-btn" onClick={createBoard} disabled={creating}>
            {creating ? '创建中…' : '创建并进入'}
          </button>
        </section>

        <section className="panel list-panel">
          <div className="panel-head">
            <h2>最近的白板</h2>
            <button type="button" className="text-btn" onClick={loadBoards}>
              刷新
            </button>
          </div>
          {loading ? (
            <p className="muted">加载中…</p>
          ) : boards.length === 0 ? (
            <p className="muted">还没有白板，先在左侧创建一个吧。</p>
          ) : (
            <ul className="board-list">
              {boards.map((board) => (
                <li key={board.id}>
                  <button
                    type="button"
                    className="board-list-item"
                    onClick={() => {
                      window.location.hash = `#/b/${board.id}`;
                    }}
                  >
                    <span className="board-list-title">
                      {board.title}
                      {board.hasPassword && <span className="lock">锁定</span>}
                    </span>
                    <span className="board-list-meta">
                      {board.noteCount} 张便签 · {formatTime(board.updatedAt)}更新
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="home-foot">
        内容保存在你的服务器上，不上传第三方。
      </footer>
    </div>
  );
}
