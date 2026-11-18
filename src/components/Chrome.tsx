import { useEffect, useRef, useState } from 'react';
import type { BoardStore } from '../lib/store';
import type { Tool } from '../types';
import { IconTemplate } from './TemplateLibrary';

const svgBase = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const IconPlus = () => (
  <svg {...svgBase}>
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);

export const IconUndo = () => (
  <svg {...svgBase}>
    <path d="M3 7.5h7a3 3 0 0 1 0 6H6.5" />
    <path d="M6 4.5 3 7.5l3 3" />
  </svg>
);

export const IconRedo = () => (
  <svg {...svgBase}>
    <path d="M13 7.5H6a3 3 0 0 0 0 6h3.5" />
    <path d="M10 4.5l3 3-3 3" />
  </svg>
);

export const IconTrash = () => (
  <svg {...svgBase}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.6 4.5l.6 8.2h5.6l.6-8.2M6.8 7v3.6M9.2 7v3.6" />
  </svg>
);

export const IconFit = () => (
  <svg {...svgBase}>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
  </svg>
);

export const IconZoomIn = () => (
  <svg {...svgBase}>
    <circle cx="7" cy="7" r="4" />
    <path d="M10.2 10.2 14 14M5.2 7h3.6M7 5.2v3.6" />
  </svg>
);

export const IconZoomOut = () => (
  <svg {...svgBase}>
    <circle cx="7" cy="7" r="4" />
    <path d="M10.2 10.2 14 14M5.2 7h3.6" />
  </svg>
);

export const IconDownload = () => (
  <svg {...svgBase}>
    <path d="M8 2.5v7M5 7l3 3 3-3M3 13h10" />
  </svg>
);

export const IconKeyboard = () => (
  <svg {...svgBase}>
    <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
    <path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M4 9.5h8" />
  </svg>
);

export const IconUsers = () => (
  <svg {...svgBase}>
    <circle cx="6" cy="5.4" r="2.2" />
    <path d="M2.4 13c0-2 1.6-3.4 3.6-3.4S9.6 11 9.6 13" />
    <path d="M10.6 3.6a2.2 2.2 0 0 1 0 4.2M11.2 13c0-1.3-.4-2.4-1-3.2" />
  </svg>
);

export const IconBack = () => (
  <svg {...svgBase}>
    <path d="M9.5 3 4.5 8l5 5" />
  </svg>
);

export const IconLink = () => (
  <svg {...svgBase}>
    <path d="M6.5 9.5 9.5 6.5" />
    <path d="M7.5 4.5 9 3a2.8 2.8 0 0 1 4 4l-1.5 1.5M8.5 11.5 7 13a2.8 2.8 0 0 1-4-4l1.5-1.5" />
  </svg>
);

export const IconCheck = () => (
  <svg {...svgBase}>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </svg>
);

export const IconCursor = () => (
  <svg {...svgBase}>
    <path d="M4 3l7 14 2-5 5-2L4 3z" />
  </svg>
);

export const IconHand = () => (
  <svg {...svgBase}>
    <path d="M6 8V4.8a1 1 0 0 1 2 0V8m0-1.2a1 1 0 0 1 2 0V8m0-.8a1 1 0 0 1 2 0V9m0-1.4a1 1 0 0 1 2 0V11a4 4 0 0 1-4 4H9.5A4.5 4.5 0 0 1 5 10.5V9.4a1 1 0 0 1 1-1z" />
  </svg>
);

export const IconPen = () => (
  <svg {...svgBase}>
    <path d="M3 13l1-3 7.5-7.5a1.8 1.8 0 0 1 2.5 2.5L6.5 12.5l-3.5.5z" />
  </svg>
);

export const IconNote = () => (
  <svg {...svgBase}>
    <path d="M4 3.5h8a1 1 0 0 1 1 1V10l-3.5 3.5H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
    <path d="M9.5 13.5V10H13" />
  </svg>
);

/* --------------------------- 顶栏 --------------------------- */

interface TopBarProps {
  store: BoardStore;
  onRename: (title: string) => void;
  onExport: (kind: 'json' | 'markdown') => void;
  onTemplates: () => void;
  onLeave: () => void;
}

export function TopBar({ store, onRename, onExport, onTemplates, onLeave }: TopBarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(store.title);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shareInputRef = useRef<HTMLInputElement>(null);
  const members = [...store.members.values()];
  const statusText = store.status === 'online' ? '已连接' : store.status === 'connecting' ? '连接中…' : '已断开';

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  /* 分享给同事：必须给内网地址，本机的 localhost 同事是打不开的 */
  const openShare = async () => {
    let url = `${location.origin}/#/b/${store.boardId}`;
    try {
      const info = await fetch('/api/server').then((r) => r.json());
      if (info?.ip) url = `http://${info.ip}:${info.port}/#/b/${store.boardId}`;
    } catch {
      /* 拿不到就退回当前地址 */
    }
    setShareUrl(url);
    setCopied(false);
    setShareOpen(true);
    requestAnimationFrame(() => {
      shareInputRef.current?.focus();
      shareInputRef.current?.select();
    });
  };

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    } catch {
      // 剪贴板不可用（非安全上下文等）：选中链接让用户自己 ⌘C
      shareInputRef.current?.focus();
      shareInputRef.current?.select();
    }
  };

  const commit = () => {
    const next = draft.trim();
    if (next && next !== store.title) onRename(next);
    else setDraft(store.title);
    setEditing(false);
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="icon-btn" title="返回首页" onClick={onLeave}>
          <IconBack />
        </button>
        <div className="brand">
          <span className="brand-mark" />
          协作白板
        </div>
        {editing ? (
          <input
            ref={inputRef}
            className="board-title-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraft(store.title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="board-title"
            title="点击重命名"
            onClick={() => {
              setDraft(store.title);
              setEditing(true);
            }}
          >
            {store.title}
          </button>
        )}
      </div>

      <div className="topbar-right">
        <div className="member-bar" title={`在线 ${members.length} 人`}>
          {members.slice(0, 6).map((member) => (
            <span key={member.id} className="avatar" style={{ background: member.color }} title={member.name}>
              {member.name.slice(0, 1)}
            </span>
          ))}
          {members.length > 6 && <span className="avatar avatar-more">+{members.length - 6}</span>}
          {members.length === 0 && <span className="member-count">0 人在线</span>}
        </div>
        <span className={`status-dot status-${store.status}`} title={statusText}>
          {statusText}
        </span>
        <div className="topbar-actions">
          <button type="button" className="ghost-btn" onClick={onTemplates} title="从模板库一键生成结构化画布">
            <IconTemplate />
            模板
          </button>
          <button type="button" className="ghost-btn" onClick={openShare} title="复制白板链接（内网地址），发给同事">
            <IconLink />
            分享链接
          </button>
          {shareOpen && (
            <div className="share-pop">
              <div className="share-pop-title">把链接发给同事</div>
              <input
                ref={shareInputRef}
                className="share-pop-input"
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <div className="share-pop-actions">
                <button type="button" className="ghost-btn" onClick={() => setShareOpen(false)}>
                  关闭
                </button>
                <button type="button" className="share-pop-btn" onClick={copyShare}>
                  {copied ? '已复制' : '复制链接'}
                </button>
              </div>
              <div className="share-pop-hint">
                同事打开后填昵称 + 白板口令即可加入；口令单独发给他们。
              </div>
            </div>
          )}
          <button type="button" className="ghost-btn" onClick={() => onExport('json')}>
            <IconDownload />
            导出 JSON
          </button>
          <button type="button" className="ghost-btn" onClick={() => onExport('markdown')}>
            <IconDownload />
            导出 Markdown
          </button>
        </div>
      </div>
    </header>
  );
}

/* --------------------------- 左侧工具栏 --------------------------- */

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  tool: Tool;
  onTool: (tool: Tool) => void;
  onNew: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onFit: () => void;
  onHelp: () => void;
}

export function Toolbar({
  canUndo,
  canRedo,
  hasSelection,
  tool,
  onTool,
  onNew,
  onUndo,
  onRedo,
  onDelete,
  onFit,
  onHelp,
}: ToolbarProps) {
  return (
    <aside className="toolbar">
      <button type="button" className="tool-btn is-primary" title="新建便签 (N)" onClick={onNew}>
        <IconPlus />
      </button>
      <span className="tool-divider" />
      <button
        type="button"
        className={`tool-btn${tool === 'note' ? ' is-active' : ''}`}
        title="便签工具 (N)：点画布空白处就建便签，再点一次回到选择工具"
        onClick={() => onTool(tool === 'note' ? 'select' : 'note')}
      >
        <IconNote />
      </button>
      <button
        type="button"
        className={`tool-btn${tool === 'select' ? ' is-active' : ''}`}
        title="选择工具 (V)"
        onClick={() => onTool('select')}
      >
        <IconCursor />
      </button>
      <button
        type="button"
        className={`tool-btn${tool === 'pan' ? ' is-active' : ''}`}
        title="抓手平移 (P)：拖拽平移画布，再点一次回到选择工具"
        onClick={() => onTool(tool === 'pan' ? 'select' : 'pan')}
      >
        <IconHand />
      </button>
      <button
        type="button"
        className={`tool-btn${tool === 'draw' ? ' is-active' : ''}`}
        title="画笔 (C)：自由画线，再点一次回到选择工具"
        onClick={() => onTool(tool === 'draw' ? 'select' : 'draw')}
      >
        <IconPen />
      </button>
      <span className="tool-divider" />
      <button type="button" className="tool-btn" title="撤销 (⌘Z)" onClick={onUndo} disabled={!canUndo}>
        <IconUndo />
      </button>
      <button type="button" className="tool-btn" title="重做 (⇧⌘Z)" onClick={onRedo} disabled={!canRedo}>
        <IconRedo />
      </button>
      <button
        type="button"
        className="tool-btn"
        title="删除选中 (Delete)"
        onClick={onDelete}
        disabled={!hasSelection}
      >
        <IconTrash />
      </button>
      <span className="tool-divider" />
      <button type="button" className="tool-btn" title="适应内容 (F)" onClick={onFit}>
        <IconFit />
      </button>
      <button type="button" className="tool-btn" title="快捷键说明" onClick={onHelp}>
        <IconKeyboard />
      </button>
    </aside>
  );
}

/* --------------------------- 缩放控制 --------------------------- */

export function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  return (
    <div className="zoom-controls">
      <button type="button" className="tool-btn" title="缩小" onClick={onZoomOut}>
        <IconZoomOut />
      </button>
      <button type="button" className="zoom-level" title="适应内容" onClick={onFit}>
        {Math.round(scale * 100)}%
      </button>
      <button type="button" className="tool-btn" title="放大" onClick={onZoomIn}>
        <IconZoomIn />
      </button>
    </div>
  );
}

/* --------------------------- 帮助面板 --------------------------- */

const SHORTCUTS: Array<[string, string]> = [
  ['新建便签', 'N / 双击空白处'],
  ['编辑便签', '双击便签 / Enter'],
  ['删除选中', 'Delete'],
  ['撤销 / 重做', '⌘Z / ⇧⌘Z'],
  ['复制便签', '⌘D'],
  ['适应内容', 'F'],
  ['切换工具', 'V 选择 / N 便签 / P 抓手 / C 画笔'],
  ['缩放', '滚轮 / ⌘ + 滚轮 / + -'],
  ['平移画布', '空格 + 拖拽 / 抓手工具 / Shift + 滚轮'],
  ['便签更多操作', '右键便签'],
  ['建立连线', '拖动便签右侧圆点'],
  ['取消选择', 'Esc'],
];

export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="help-backdrop" onClick={onClose}>
      <div className="help-panel" onClick={(e) => e.stopPropagation()}>
        <div className="help-head">
          <h2>使用说明</h2>
          <button type="button" className="icon-btn" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="help-desc">
          画布上任意位置双击即可新建便签；便签支持 <code># 标题</code>、<code>- 列表</code>、
          <code>- [ ] 待办勾选</code>、<code>**加粗**</code>；拖动便签右侧圆点到另一张便签可建立箭头连线。
        </p>
        <table className="help-table">
          <tbody>
            {SHORTCUTS.map(([label, key]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>
                  <kbd>{key}</kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="help-tip">提示：白板内容会自动保存到服务器，刷新页面不会丢失。</p>
      </div>
    </div>
  );
}
