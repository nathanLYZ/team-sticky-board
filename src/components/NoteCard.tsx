import type { Note } from '../types';
import { parseNoteText, renderInline, toggleCheckbox } from '../lib/noteText';
import { useBoard } from '../lib/boardContext';
import { NOTE_COLORS } from '../types';
import { uid } from '../lib/util';
import { useCallback, useEffect, useRef, useState } from 'react';

interface DragState {
  mode: 'move' | 'resize';
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  ow: number;
  oh: number;
  sent: number;
  pointerId: number;
}

export default function NoteCard({ note }: { note: Note }) {
  const { store, view, toWorld, setPendingLink, editingNoteId, setEditingNoteId, tool, spaceHeld, openNoteMenu } = useBoard();
  const drag = useRef<DragState | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  // 拖拽期间挂在 window 上的兜底监听器，结束时统一摘掉
  const cleanupRef = useRef<(() => void) | null>(null);
  // 编辑中的草稿：state 供受控 textarea 绑定，ref 供提交时读取最新值
  const [draft, setDraft] = useState(note.text);
  const draftRef = useRef(note.text);
  const startTextRef = useRef(note.text);
  const wasEditing = useRef(false);

  const selected = store.selection?.kind === 'note' && store.selection.id === note.id;
  const isEditing = editingNoteId === note.id;

  /* 进入编辑：载入当前内容 */
  useEffect(() => {
    if (isEditing) {
      setDraft(note.text);
      draftRef.current = note.text;
      startTextRef.current = note.text;
      const area = areaRef.current;
      if (area) {
        area.focus();
        area.setSelectionRange(area.value.length, area.value.length);
        area.style.height = 'auto';
        area.style.height = `${area.scrollHeight}px`;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  /* 退出编辑：提交草稿（点画布、Esc、切换便签都会走到这里） */
  useEffect(() => {
    if (wasEditing.current && !isEditing) {
      const next = draftRef.current;
      if (next !== startTextRef.current) {
        store.dispatch({ kind: 'note.update', id: note.id, patch: { text: next } });
      }
      draftRef.current = startTextRef.current;
    }
    wasEditing.current = isEditing;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const beginDrag = (e: React.PointerEvent, mode: 'move' | 'resize') => {
    // 只响应左键：右键要弹菜单，不能顺带把便签拖走、把层级顶到最上面
    if (e.button !== 0) return;
    // 平移工具 / 画笔工具 / 按住空格时，便签不拦截指针，交给画布统一处理
    if (tool === 'pan' || tool === 'draw' || spaceHeld) return;
    if (isEditing) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]')) return;
    e.stopPropagation();
    // 统一把指针捕获到便签本体上：移动和缩放都能持续收到 move 事件
    noteRef.current?.setPointerCapture(e.pointerId);
    drag.current = {
      mode,
      sx: e.clientX,
      sy: e.clientY,
      ox: note.x,
      oy: note.y,
      ow: note.w,
      oh: note.h,
      sent: 0,
      pointerId: e.pointerId,
    };
    store.draggingNoteId = note.id;
    store.select({ kind: 'note', id: note.id });
    if (note.z !== store.nextZ() - 1) {
      store.sendOnly({ kind: 'note.update', id: note.id, patch: { z: store.nextZ() } });
    }
    // 兜底：即使元素上的 pointerup 丢失（指针移出窗口等），也要结束拖拽
    const onUp = () => endDrag();
    const onCancel = () => endDrag();
    const onBlur = () => {
      // 窗口失焦 ≠ 拖拽结束：指针如果还被便签捕获着，就说明用户仍在拖
      const d = drag.current;
      const el = noteRef.current;
      if (d && el && typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(d.pointerId)) {
        return;
      }
      endDrag();
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onBlur);
    cleanupRef.current = () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const scale = view.scale;
    const dx = (e.clientX - d.sx) / scale;
    const dy = (e.clientY - d.sy) / scale;
    const now = Date.now();
    if (d.mode === 'move') {
      const patch = { x: d.ox + dx, y: d.oy + dy };
      store.applyLocal({ kind: 'note.update', id: note.id, patch });
      if (now - d.sent > 60) {
        d.sent = now;
        store.broadcast({ kind: 'note.update', id: note.id, patch });
      }
    } else {
      const patch = { w: Math.max(160, d.ow + dx), h: Math.max(110, d.oh + dy) };
      store.applyLocal({ kind: 'note.update', id: note.id, patch });
      if (now - d.sent > 60) {
        d.sent = now;
        store.broadcast({ kind: 'note.update', id: note.id, patch });
      }
    }
  };

  /** 结束拖拽：提交最终位置/尺寸，并摘掉 window 上的兜底监听器 */
  const endDrag = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    cleanupRef.current?.();
    cleanupRef.current = null;
    store.draggingNoteId = null;
    const current = store.notes.get(note.id);
    if (!current) return;
    if (d.mode === 'move') {
      store.dispatch(
        { kind: 'note.update', id: note.id, patch: { x: current.x, y: current.y } },
        { kind: 'note.update', id: note.id, patch: { x: d.ox, y: d.oy } },
      );
    } else {
      store.dispatch(
        { kind: 'note.update', id: note.id, patch: { w: current.w, h: current.h } },
        { kind: 'note.update', id: note.id, patch: { w: d.ow, h: d.oh } },
      );
    }
  }, [note.id, store]);

  const commitEdit = () => {
    if (!isEditing) return;
    setEditingNoteId(null);
  };

  const startLink = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const { x, y } = toWorld(e.clientX, e.clientY);
    setPendingLink({ from: note.id, x, y });

    const move = (ev: PointerEvent) => {
      const p = toWorld(ev.clientX, ev.clientY);
      setPendingLink({ from: note.id, x: p.x, y: p.y });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const targetId = el?.closest('[data-note-id]')?.getAttribute('data-note-id');
      setPendingLink(null);
      if (targetId && targetId !== note.id) {
        const exists = [...store.edges.values()].some((e2) => e2.from === note.id && e2.to === targetId);
        if (!exists) {
          store.dispatch({ kind: 'edge.create', edge: { id: uid('e'), from: note.id, to: targetId } });
        }
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const segments = parseNoteText(isEditing ? draft : note.text);

  return (
    <div
      ref={noteRef}
      className={`note note-${note.color}${selected ? ' is-selected' : ''}${isEditing ? ' is-editing' : ''}`}
      style={{
        left: note.x,
        top: note.y,
        width: note.w,
        minHeight: note.h,
        zIndex: selected ? 999999 : note.z,
      }}
      data-note-id={note.id}
      onPointerDown={(e) => beginDrag(e, 'move')}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onContextMenu={(e) => {
        if (tool === 'draw') return;
        e.preventDefault();
        e.stopPropagation();
        store.select({ kind: 'note', id: note.id });
        openNoteMenu(note.id, e.clientX, e.clientY);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditingNoteId(note.id);
      }}
    >
      {selected && !isEditing && (
        <div
          className="note-actions"
          data-no-drag
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.preventDefault()} // 不让色板按钮抢走焦点，否则空格会变成「重新触发这个色板」
        >
          <div className="note-swatches">
            {NOTE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`swatch swatch-${color}${note.color === color ? ' is-active' : ''}`}
                title={`换色 ${color}`}
                onClick={() => store.dispatch({ kind: 'note.update', id: note.id, patch: { color } })}
              />
            ))}
          </div>
          <button
            type="button"
            className="note-action-btn"
            title="删除便签"
            onClick={() => store.dispatch({ kind: 'note.delete', id: note.id })}
          >
            ×
          </button>
        </div>
      )}

      {isEditing ? (
        <textarea
          ref={areaRef}
          className="note-editor"
          data-no-drag
          value={draft}
          placeholder="写点什么…  支持 # 标题、- 列表、- [ ] 待办"
          onChange={(e) => {
            draftRef.current = e.target.value;
            setDraft(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
              // 取消编辑：丢弃草稿
              draftRef.current = startTextRef.current;
              setDraft(startTextRef.current);
              setEditingNoteId(null);
              return;
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              commitEdit();
            }
          }}
        />
      ) : (
        <div className="note-body">
          {segments.length === 0 || (segments.length === 1 && segments[0].text === '') ? (
            <span className="note-placeholder">双击写点什么…</span>
          ) : (
            segments.map((seg) => {
              if (seg.type === 'check') {
                return (
                  <label key={seg.line} className="note-check" onPointerDown={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={seg.checked}
                      readOnly
                      onChange={() => {
                        const next = toggleCheckbox(note.text, seg.line);
                        store.dispatch({ kind: 'note.update', id: note.id, patch: { text: next } });
                      }}
                    />
                    <span className={seg.checked ? 'is-done' : ''}>{renderInline(seg.text)}</span>
                  </label>
                );
              }
              if (seg.type === 'heading') {
                return (
                  <div key={seg.line} className="note-heading">
                    {renderInline(seg.text)}
                  </div>
                );
              }
              if (seg.type === 'bullet') {
                return (
                  <div key={seg.line} className="note-bullet">
                    {renderInline(seg.text)}
                  </div>
                );
              }
              if (seg.type === 'quote') {
                return (
                  <div key={seg.line} className="note-quote">
                    {renderInline(seg.text)}
                  </div>
                );
              }
              return (
                <div key={seg.line} className="note-line">
                  {renderInline(seg.text)}
                </div>
              );
            })
          )}
        </div>
      )}

      <button
        type="button"
        className="note-link-handle"
        data-no-drag
        title="拖到另一张便签建立连线"
        onPointerDown={startLink}
      />
      <div className="note-resize" data-no-drag onPointerDown={(e) => beginDrag(e, 'resize')} />
    </div>
  );
}
