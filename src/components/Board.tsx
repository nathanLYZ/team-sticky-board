import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { BoardStore, CursorStore } from '../lib/store';
import type { Connection } from '../lib/connection';
import { BoardContext, type PendingLink, type View } from '../lib/boardContext';
import { clamp, downloadFile, uid } from '../lib/util';
import { buildJsonExport, buildMarkdownExport } from '../lib/exportBoard';
import { findFreeSpot } from '../lib/placement';
import { TEMPLATES, type BoardTemplate } from '../lib/templates';
import { layoutByColor, layoutGrid } from '../lib/layout';
import type { Note, NoteColor, Stroke, Tool } from '../types';
import NoteCard from './NoteCard';
import EdgeLayer from './EdgeLayer';
import CursorLayer from './CursorLayer';
import ContextMenu from './ContextMenu';
import Minimap from './Minimap';
import ShortcutBar from './ShortcutBar';
import StrokeLayer from './StrokeLayer';
import TemplateLibrary from './TemplateLibrary';
import { HelpPanel, Toolbar, TopBar, ZoomControls } from './Chrome';

interface BoardProps {
  store: BoardStore;
  cursors: CursorStore;
  conn: Connection;
  onLeave: () => void;
}

export default function Board({ store, cursors, conn, onLeave }: BoardProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [view, setViewState] = useState<View>({ tx: 120, ty: 100, scale: 1 });
  const viewRef = useRef<View>(view);
  const panRef = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null);
  const cursorSentAt = useRef(0);
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  /** 模板库面板 */
  const [templateOpen, setTemplateOpen] = useState(false);
  /** 当前工具：选择 / 便签 / 平移 / 画笔 */
  const [tool, setTool] = useState<Tool>('select');
  /** 按住空格 → 临时平移 */
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** 便签右键菜单 */
  const [noteMenu, setNoteMenu] = useState<{ x: number; y: number; noteId: string } | null>(null);
  /** 正在画的笔画 */
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const drawingRef = useRef<Stroke | null>(null);
  /** 画布尺寸（缩略图要用） */
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });

  useSyncExternalStore(store.subscribe, store.getVersion);
  useSyncExternalStore(cursors.subscribe, cursors.getVersion);

  const setView = useCallback((updater: (v: View) => View) => {
    const next = updater(viewRef.current);
    viewRef.current = next;
    setViewState(next);
  }, []);

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    return { x: (clientX - left - v.tx) / v.scale, y: (clientY - top - v.ty) / v.scale };
  }, []);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      setView((v) => {
        const scale = clamp(v.scale * factor, 0.2, 2.5);
        const mx = clientX - (rect?.left ?? 0);
        const my = clientY - (rect?.top ?? 0);
        const wx = (mx - v.tx) / v.scale;
        const wy = (my - v.ty) / v.scale;
        return { scale, tx: mx - wx * scale, ty: my - wy * scale };
      });
    },
    [setView],
  );

  const zoomAtCenter = useCallback(
    (factor: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      zoomAt((rect?.left ?? 0) + (rect?.width ?? 0) / 2, (rect?.top ?? 0) + (rect?.height ?? 0) / 2, factor);
    },
    [zoomAt],
  );

  const createNote = useCallback(
    (worldX: number, worldY: number) => {
      // 若目标位置已被占用，自动挪到旁边的空位，避免新便签把旧便签完全盖住
      const { x, y } = findFreeSpot(store.notes.values(), worldX - 110, worldY - 70, 220, 160);
      const note: Note = {
        id: uid('n'),
        x,
        y,
        w: 220,
        h: 160,
        text: '',
        color: 'amber',
        z: store.nextZ(),
        createdBy: store.selfId,
        updatedBy: store.selfId,
        updatedAt: Date.now(),
      };
      store.dispatch({ kind: 'note.create', note });
      store.select({ kind: 'note', id: note.id });
      setEditingNoteId(note.id);
    },
    [store],
  );

  const createNoteAtCenter = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = (rect?.left ?? 0) + (rect?.width ?? 0) / 2;
    const cy = (rect?.top ?? 0) + (rect?.height ?? 0) / 2;
    const w = toWorld(cx, cy);
    createNote(w.x, w.y);
  }, [createNote, toWorld]);

  const deleteSelection = useCallback(() => {
    const sel = store.selection;
    if (!sel) return;
    if (sel.kind === 'note') store.dispatch({ kind: 'note.delete', id: sel.id });
    else store.dispatch({ kind: 'edge.delete', id: sel.id });
  }, [store]);

  const duplicateNote = useCallback(() => {
    const sel = store.selection;
    if (sel?.kind !== 'note') return;
    duplicateNoteById(sel.id);
  }, [store]);

  /** 按 id 复制一张便签（右键菜单用） */
  const duplicateNoteById = useCallback(
    (id: string) => {
      const note = store.notes.get(id);
      if (!note) return;
      // 副本默认错开一点，但也要避开其它便签，否则会整个压在原便签底下看不见
      const { x, y } = findFreeSpot(store.notes.values(), note.x + 36, note.y + 36, note.w, note.h);
      const copy: Note = {
        ...note,
        id: uid('n'),
        x,
        y,
        z: store.nextZ(),
        createdBy: store.selfId,
        updatedBy: store.selfId,
        updatedAt: Date.now(),
      };
      store.dispatch({ kind: 'note.create', note: copy });
      store.select({ kind: 'note', id: copy.id });
    },
    [store],
  );

  const fitToContent = useCallback(() => {
    const notes = store.sortedNotes();
    const rect = canvasRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 1200;
    const height = rect?.height ?? 800;
    if (!notes.length) {
      setView(() => ({ tx: 120, ty: 100, scale: 1 }));
      return;
    }
    const minX = Math.min(...notes.map((n) => n.x));
    const minY = Math.min(...notes.map((n) => n.y));
    const maxX = Math.max(...notes.map((n) => n.x + n.w));
    const maxY = Math.max(...notes.map((n) => n.y + n.h));
    const pad = 80;
    const scale = clamp(
      Math.min((width - pad * 2) / Math.max(1, maxX - minX), (height - pad * 2) / Math.max(1, maxY - minY)),
      0.2,
      1.4,
    );
    setView(() => ({
      scale,
      tx: (width - (maxX - minX) * scale) / 2 - minX * scale,
      ty: (height - (maxY - minY) * scale) / 2 - minY * scale,
    }));
  }, [setView, store]);

  /**
   * 套用模板：在画布中心生成一组带占位文案的便签 + 连线。
   * 走的是普通 op，所以队友会同步看到、刷新也不会丢。
   */
  const applyTemplate = useCallback(
    (tpl: BoardTemplate) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      const cx = (rect?.left ?? 0) + (rect?.width ?? 0) / 2;
      const cy = (rect?.top ?? 0) + (rect?.height ?? 0) / 2;
      const origin = toWorld(cx, cy);
      const created: string[] = [];
      tpl.notes.forEach((spec) => {
        const note: Note = {
          id: uid('n'),
          x: origin.x + spec.dx,
          y: origin.y + spec.dy,
          w: spec.w ?? 210,
          h: spec.h ?? 150,
          text: spec.text,
          color: spec.color,
          z: store.nextZ(),
          createdBy: store.selfId,
          updatedBy: store.selfId,
          updatedAt: Date.now(),
        };
        store.dispatch({ kind: 'note.create', note });
        created.push(note.id);
      });
      (tpl.edges ?? []).forEach(([a, b]) => {
        if (!created[a] || !created[b]) return;
        store.dispatch({ kind: 'edge.create', edge: { id: uid('e'), from: created[a], to: created[b] } });
      });
      setTemplateOpen(false);
      // 等便签渲染完再重新取景，让整个模板正好落在视野里
      requestAnimationFrame(() => fitToContent());
    },
    [store, toWorld, fitToContent],
  );

  /** 一键整理：按颜色分组 / 全部排成网格。整个动作算一步撤销。 */
  const tidy = useCallback(
    (mode: 'color' | 'grid') => {
      const notes = store.sortedNotes();
      if (!notes.length) return;
      const positions = mode === 'color' ? layoutByColor(notes) : layoutGrid(notes);
      if (!positions.length) return;
      store.dispatch({ kind: 'notes.layout', positions });
      setTemplateOpen(false);
      requestAnimationFrame(() => fitToContent());
    },
    [store, fitToContent],
  );

  /* 首次进入画布时自动「适应内容」：便签铺在画布各处时，
     固定初始视口会把靠右的便签挡在屏幕外，看起来就像只有一张。 */
  const didAutoFit = useRef(false);
  useEffect(() => {
    if (didAutoFit.current) return;
    didAutoFit.current = true;
    // 等一帧再量画布尺寸，避免布局未完成时算出错误的缩放
    const raf = requestAnimationFrame(() => fitToContent());
    return () => cancelAnimationFrame(raf);
  }, [fitToContent]);

  /* 画布尺寸（缩略图需要） */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setCanvasSize({ width: r.width, height: r.height });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 滚轮：直接缩放（以指针位置为中心），Shift + 滚轮横向平移 */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.shiftKey) {
        setView((v) => ({ ...v, tx: v.tx - e.deltaY }));
        return;
      }
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setView, zoomAt]);

  /* 空格：按住时临时进入平移 */
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    const onBlur = () => setSpaceHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  /* 快捷键 */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && key === 'y') {
        if (typing) return;
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod && key === 'd') {
        if (typing) return;
        e.preventDefault();
        duplicateNote();
        return;
      }
      if (typing) {
        if (e.key === 'Escape') target?.blur();
        return;
      }
      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          deleteSelection();
          break;
        case 'n':
        case 'N':
          // 必须阻止默认行为，否则字符会被输入到刚创建并获得焦点的便签里
          e.preventDefault();
          setTool('note');
          createNoteAtCenter();
          break;
        case 'v':
        case 'V':
          e.preventDefault();
          setTool('select');
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          // 再按一次同一个键 = 取消选择，回到选择工具（和工具栏按钮一致）
          setTool((t) => (t === 'pan' ? 'select' : 'pan'));
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          setTool((t) => (t === 'draw' ? 'select' : 'draw'));
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          fitToContent();
          break;
        case 'Enter': {
          const sel = store.selection;
          if (sel?.kind === 'note') {
            e.preventDefault();
            setEditingNoteId(sel.id);
          }
          break;
        }
        case 'Escape':
          store.select(null);
          setPendingLink(null);
          setEditingNoteId(null);
          break;
        case '=':
        case '+':
          e.preventDefault();
          zoomAtCenter(1.2);
          break;
        case '-':
        case '_':
          e.preventDefault();
          zoomAtCenter(1 / 1.2);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [createNoteAtCenter, deleteSelection, duplicateNote, fitToContent, store, zoomAtCenter]);

  const exportBoard = useCallback(
    (kind: 'json' | 'markdown') => {
      const notes = store.sortedNotes();
      const edges = [...store.edges.values()];
      if (kind === 'json') {
        downloadFile(
          `${store.title || '白板'}.json`,
          buildJsonExport(store.title, notes, edges),
        );
        return;
      }
      downloadFile(
        `${store.title || '白板'}.md`,
        buildMarkdownExport(store.title, notes, edges),
        'text/markdown',
      );
    },
    [store],
  );

  /** 打开便签右键菜单 */
  const openNoteMenu = useCallback((noteId: string, clientX: number, clientY: number) => {
    setNoteMenu({ noteId, x: clientX, y: clientY });
  }, []);

  const ctxValue = useMemo(
    () => ({
      store,
      cursors,
      conn,
      view,
      setView,
      zoomAt,
      toWorld,
      createNote,
      pendingLink,
      setPendingLink,
      editingNoteId,
      setEditingNoteId,
      tool,
      spaceHeld,
      openNoteMenu,
    }),
    [
      store,
      cursors,
      conn,
      view,
      setView,
      zoomAt,
      toWorld,
      createNote,
      pendingLink,
      editingNoteId,
      tool,
      spaceHeld,
      openNoteMenu,
    ],
  );

  /** 开始平移 */
  const startPan = (e: React.PointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    panRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      tx: viewRef.current.tx,
      ty: viewRef.current.ty,
    };
    window.addEventListener('pointerup', endPan, { once: true });
    window.addEventListener('pointercancel', endPan, { once: true });
    window.addEventListener('blur', endPan, { once: true });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const onNote = target.closest('.note');

    // 平移工具 / 按住空格：任何位置拖拽都是平移画布
    if (tool === 'pan' || spaceHeld) {
      e.preventDefault();
      startPan(e);
      return;
    }

    // 画笔：在空白处按下开始画一笔
    if (tool === 'draw') {
      if (onNote && !spaceHeld) return; // 便签内部不画，避免误触
      const p = toWorld(e.clientX, e.clientY);
      const stroke: Stroke = {
        id: uid('s'),
        points: [p],
        color: '#1f2430',
        width: 3,
        createdBy: store.selfId,
        updatedAt: Date.now(),
      };
      drawingRef.current = stroke;
      setDrawing(stroke);
      canvasRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (onNote) return;
    if (tool === 'note') {
      const w = toWorld(e.clientX, e.clientY);
      createNote(w.x, w.y);
      return;
    }

    // 选择工具：空白处拖拽 = 平移画布
    startPan(e);
    store.select(null);
    setEditingNoteId(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    // 正在画笔画
    const stroke = drawingRef.current;
    if (stroke) {
      const p = toWorld(e.clientX, e.clientY);
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return; // 抽稀
      const next: Stroke = { ...stroke, points: [...stroke.points, p] };
      drawingRef.current = next;
      setDrawing(next);
      return;
    }

    const pan = panRef.current;
    if (pan) {
      setView((v) => ({
        ...v,
        tx: pan.tx + (e.clientX - pan.sx),
        ty: pan.ty + (e.clientY - pan.sy),
      }));
    }
    const now = Date.now();
    if (now - cursorSentAt.current > 45) {
      cursorSentAt.current = now;
      const w = toWorld(e.clientX, e.clientY);
      conn.send({ t: 'cursor', x: w.x, y: w.y });
    }
  };

  /** 结束这一笔：交给服务端同步给所有人 */
  const finishStroke = () => {
    const stroke = drawingRef.current;
    if (!stroke) return;
    drawingRef.current = null;
    setDrawing(null);
    if (stroke.points.length > 1) {
      store.dispatch({ kind: 'stroke.create', stroke });
    }
  };

  const endPan = () => {
    panRef.current = null;
    window.removeEventListener('pointerup', endPan);
    window.removeEventListener('pointercancel', endPan);
    window.removeEventListener('blur', endPan);
  };

  const onPointerUp = () => {
    finishStroke();
    endPan();
  };

  /** 缩略图点击 → 把视野移到该世界坐标 */
  const jumpTo = useCallback(
    (worldX: number, worldY: number) => {
      setView((v) => ({
        ...v,
        tx: canvasSize.width / 2 - worldX * v.scale,
        ty: canvasSize.height / 2 - worldY * v.scale,
      }));
    },
    [canvasSize, setView],
  );

  const onDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.note')) return;
    const w = toWorld(e.clientX, e.clientY);
    createNote(w.x, w.y);
  };

  return (
    <BoardContext.Provider value={ctxValue}>
      <div className="board">
        <TopBar
          store={store}
          onRename={(title) => store.dispatch({ kind: 'board.update', patch: { title } })}
          onExport={exportBoard}
          onTemplates={() => setTemplateOpen(true)}
          onLeave={onLeave}
        />

        <div className="canvas-wrap">
          <div
            className={`canvas tool-${tool}${spaceHeld ? ' is-panning' : ''}`}
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onDoubleClick={onDoubleClick}
            onContextMenu={(e) => {
              // 空白处右键不弹系统菜单
              if (!(e.target as HTMLElement).closest('.note')) e.preventDefault();
            }}
          >
            <div
              className="world"
              style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}
            >
              <EdgeLayer />
              <StrokeLayer
                strokes={[...store.strokes.values()]}
                current={drawing}
              />
              {store.sortedNotes().map((note) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
            <CursorLayer />
          </div>

          <Toolbar
            canUndo={store.undoStack.length > 0}
            canRedo={store.redoStack.length > 0}
            hasSelection={store.selection !== null}
            tool={tool}
            onTool={setTool}
            onNew={createNoteAtCenter}
            onUndo={() => store.undo()}
            onRedo={() => store.redo()}
            onDelete={deleteSelection}
            onFit={fitToContent}
            onHelp={() => setHelpOpen(true)}
          />

          <ZoomControls
            scale={view.scale}
            onZoomIn={() => zoomAtCenter(1.2)}
            onZoomOut={() => zoomAtCenter(1 / 1.2)}
            onFit={fitToContent}
          />

          <Minimap
            notes={store.sortedNotes()}
            strokes={[...store.strokes.values()]}
            view={view}
            canvasSize={canvasSize}
            onJump={jumpTo}
          />

          <ShortcutBar />
        </div>

        {noteMenu && (() => {
          const note = store.notes.get(noteMenu.noteId);
          if (!note) return null;
          return (
            <ContextMenu
              x={noteMenu.x}
              y={noteMenu.y}
              note={note}
              onClose={() => setNoteMenu(null)}
              onColor={(color: NoteColor) => {
                store.dispatch({ kind: 'note.update', id: note.id, patch: { color } });
                setNoteMenu(null);
              }}
              onEdit={() => {
                setNoteMenu(null);
                store.select({ kind: 'note', id: note.id });
                setEditingNoteId(note.id);
              }}
              onDuplicate={() => {
                setNoteMenu(null);
                duplicateNoteById(note.id);
              }}
              onDelete={() => {
                setNoteMenu(null);
                store.dispatch({ kind: 'note.delete', id: note.id });
              }}
            />
          );
        })()}

        {templateOpen && (
          <TemplateLibrary
            templates={TEMPLATES}
            noteCount={store.notes.size}
            onApply={applyTemplate}
            onTidyByColor={() => tidy('color')}
            onTidyGrid={() => tidy('grid')}
            onClose={() => setTemplateOpen(false)}
          />
        )}

        {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      </div>
    </BoardContext.Provider>
  );
}
