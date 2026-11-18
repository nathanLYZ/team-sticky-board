import { useEffect, useMemo, useRef, useState } from 'react';
import { Connection, connectionUrl } from '../lib/connection';
import { BoardStore, CursorStore } from '../lib/store';
import Board from './Board';

interface BoardSessionProps {
  boardId: string;
}

const NICKNAME_KEY = 'tsb.nickname';
const tokenKey = (boardId: string) => `tsb.token.${boardId}`;

function readToken(boardId: string): string {
  try {
    return sessionStorage.getItem(tokenKey(boardId)) ?? '';
  } catch {
    return '';
  }
}

function writeToken(boardId: string, token: string) {
  try {
    if (token) sessionStorage.setItem(tokenKey(boardId), token);
    else sessionStorage.removeItem(tokenKey(boardId));
  } catch {
    /* 隐私模式下可能不可用，忽略即可 */
  }
}

export default function BoardSession({ boardId }: BoardSessionProps) {
  const conn = useMemo(() => new Connection(connectionUrl()), []);
  const store = useMemo(() => new BoardStore(), []);
  const cursors = useMemo(() => new CursorStore(), []);

  const [meta, setMeta] = useState<{ title: string; hasPassword: boolean } | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState(() => localStorage.getItem(NICKNAME_KEY) ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'form' | 'joining' | 'ready'>('form');
  const [newTitle, setNewTitle] = useState('');

  const nameRef = useRef(name);
  const passwordRef = useRef(password);
  const submittedRef = useRef(false);
  const phaseRef = useRef(phase);
  const tokenRef = useRef(readToken(boardId));
  nameRef.current = name;
  passwordRef.current = password;
  phaseRef.current = phase;

  /* 读取白板信息 */
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/boards/${boardId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setMissing(true);
          return null;
        }
        if (!res.ok) throw new Error('读取白板信息失败');
        return res.json();
      })
      .then((data) => {
        if (!data || cancelled) return;
        setMeta({ title: data.title, hasPassword: data.hasPassword });
      })
      .catch(() => {
        if (!cancelled) setError('无法连接服务端，请确认后端已启动');
      });
    return () => {
      cancelled = true;
    };
  }, [boardId]);

  /* WebSocket 连接与消息处理 */
  useEffect(() => {
    store.setSender((op) => {
      conn.send({ t: 'op', op });
    });

    const offOpen = conn.onOpen(() => {
      if (submittedRef.current) {
        conn.send({
          t: 'join',
          boardId,
          name: nameRef.current.trim() || '匿名',
          password: passwordRef.current,
          token: tokenRef.current,
        });
      }
    });

    const offJoined = conn.on('joined', (msg: any) => {
      store.setSnapshot(msg.snapshot, msg.you?.id ?? '');
      store.setMembers(msg.members ?? []);
      cursors.clear();
      if (msg.token) {
        tokenRef.current = msg.token;
        writeToken(boardId, msg.token);
      }
      setPhase('ready');
      setError(null);
    });

    const offError = conn.on('error', (msg: any) => {
      submittedRef.current = false;
      setPhase('form');
      setError(msg?.message ?? '加入失败');
      // 令牌失效（服务端重启等）就清掉，退回要求输入口令
      if (msg?.code === 'wrong_password' && tokenRef.current) {
        tokenRef.current = '';
        writeToken(boardId, '');
      }
    });

    const offOp = conn.on('op', (msg: any) => {
      if (msg?.op) store.applyRemote(msg.op);
    });

    const offPresence = conn.on('presence', (msg: any) => {
      store.setMembers(msg.members ?? []);
      const alive = new Set((msg.members ?? []).map((m: any) => m.id));
      cursors.cursors.forEach((_c, id) => {
        if (!alive.has(id)) cursors.remove(id);
      });
    });

    const offCursor = conn.on('cursor', (msg: any) => {
      if (msg?.id) cursors.set(msg.id, msg.x, msg.y);
    });

    const offStatus = conn.onStatus((status) => {
      store.setStatus(status);
    });

    // 已有会话令牌：刷新页面后直接重连，不需要再输口令
    if (tokenRef.current) {
      submittedRef.current = true;
      setPhase('joining');
    }

    conn.connect();

    return () => {
      offOpen();
      offJoined();
      offError();
      offOp();
      offPresence();
      offCursor();
      offStatus();
      conn.close();
    };
  }, [boardId, conn, store, cursors]);

  const join = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('请先填写你的昵称，队友需要知道是谁在改');
      return;
    }
    if (meta?.hasPassword && !password) {
      setError('该白板设置了口令，请输入口令');
      return;
    }
    localStorage.setItem(NICKNAME_KEY, trimmed);
    submittedRef.current = true;
    setError(null);
    setPhase('joining');
    conn.send({
      t: 'join',
      boardId,
      name: trimmed,
      password,
      token: tokenRef.current,
    });
  };

  const createMissing = async () => {
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() || '新建白板', password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '创建失败');
      window.location.hash = `#/b/${data.id}`;
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (phase === 'ready') {
    return (
      <Board
        store={store}
        cursors={cursors}
        conn={conn}
        onLeave={() => {
          window.location.hash = '#/';
        }}
      />
    );
  }

  return (
    <div className="gate-page">
      <div className="gate-card">
        <div className="gate-brand">
          <span className="brand-mark" />
          协作白板
        </div>
        <h1 className="gate-title">{missing ? '白板不存在' : meta?.title ?? '加入白板'}</h1>
        <p className="gate-desc">
          {missing
            ? '这个链接对应的白板已被删除，可以直接用同名新建一个。'
            : meta?.hasPassword
              ? '该白板由创建者设置了口令，输入后即可进入。'
              : '输入昵称即可进入，队友会看到你的光标和实时改动。'}
        </p>

        {missing ? (
          <div className="gate-form">
            <label className="field">
              <span>白板名称</span>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="例如：Q4 产品规划"
              />
            </label>
            <label className="field">
              <span>设置口令（可选）</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="团队内部共享的口令"
              />
            </label>
            <button type="button" className="primary-btn" onClick={createMissing}>
              新建并进入
            </button>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                window.location.hash = '#/';
              }}
            >
              返回首页
            </button>
          </div>
        ) : (
          <div className="gate-form">
            <label className="field">
              <span>你的昵称</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：小林"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') join();
                }}
              />
            </label>
            {meta?.hasPassword && (
              <label className="field">
                <span>白板口令</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="口令"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') join();
                  }}
                />
              </label>
            )}
            {error && <div className="gate-error">{error}</div>}
            <button type="button" className="primary-btn" onClick={join} disabled={phase === 'joining'}>
              {phase === 'joining' ? '正在进入…' : '进入白板'}
            </button>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                window.location.hash = '#/';
              }}
            >
              返回首页
            </button>
          </div>
        )}
        {error && missing && <div className="gate-error">{error}</div>}
      </div>
    </div>
  );
}
