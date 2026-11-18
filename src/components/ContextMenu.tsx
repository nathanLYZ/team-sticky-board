import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Note, NoteColor } from '../types';
import { NOTE_COLORS } from '../types';

interface ContextMenuProps {
  x: number;
  y: number;
  note: Note;
  onClose: () => void;
  onColor: (color: NoteColor) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

/** 便签右键菜单：换颜色 / 编辑 / 复制 / 删除 */
export default function ContextMenu({
  x,
  y,
  note,
  onClose,
  onColor,
  onEdit,
  onDuplicate,
  onDelete,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // 贴着右键位置弹出，但别跑到屏幕外面去：贴边时向内收
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxX = window.innerWidth - r.width - 8;
    const maxY = window.innerHeight - r.height - 8;
    const nx = Math.max(8, Math.min(x, maxX));
    const ny = Math.max(8, Math.min(y, maxY));
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);

  // 点外面或按 Esc 关闭
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div className="ctx-menu" ref={ref} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      <div className="ctx-title">{note.text.trim().slice(0, 18) || '空白便签'}</div>
      <div className="ctx-row ctx-colors">
        {NOTE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`swatch swatch-${color}${note.color === color ? ' is-active' : ''}`}
            title={`换成 ${color}`}
            onClick={() => onColor(color)}
          />
        ))}
      </div>
      <div className="ctx-sep" />
      <button type="button" className="ctx-item" onClick={onEdit}>
        编辑文字
      </button>
      <button type="button" className="ctx-item" onClick={onDuplicate}>
        复制便签
      </button>
      <div className="ctx-sep" />
      <button type="button" className="ctx-item is-danger" onClick={onDelete}>
        删除便签
      </button>
    </div>
  );
}
