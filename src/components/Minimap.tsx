import { useMemo } from 'react';
import type { Note, Stroke } from '../types';
import { NOTE_COLOR_MAP } from '../types';

interface MinimapProps {
  notes: Note[];
  strokes: Stroke[];
  view: { tx: number; ty: number; scale: number };
  canvasSize: { width: number; height: number };
  onJump: (worldX: number, worldY: number) => void;
}

const W = 190;
const H = 124;
const PAD = 10;

/** 右下角缩略图：一眼看清所有便签在哪，并标出当前视野 */
export default function Minimap({ notes, strokes, view, canvasSize, onJump }: MinimapProps) {
  const geom = useMemo(() => {
    // 内容包围盒
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    notes.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    });
    strokes.forEach((s) => {
      s.points.forEach((p) => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    });
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 800;
      maxY = 600;
    }
    // 当前视野也要算进去
    const vw = canvasSize.width / view.scale;
    const vh = canvasSize.height / view.scale;
    const vx = -view.tx / view.scale;
    const vy = -view.ty / view.scale;
    minX = Math.min(minX, vx);
    minY = Math.min(minY, vy);
    maxX = Math.max(maxX, vx + vw);
    maxY = Math.max(maxY, vy + vh);

    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
    const offX = (W - spanX * scale) / 2 - minX * scale;
    const offY = (H - spanY * scale) / 2 - minY * scale;
    return { scale, offX, offY };
  }, [notes, strokes, view, canvasSize]);

  const toMini = (x: number, y: number) => ({ x: x * geom.scale + geom.offX, y: y * geom.scale + geom.offY });

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - geom.offX) / geom.scale;
    const wy = (my - geom.offY) / geom.scale;
    onJump(wx, wy);
  };

  const viewport = {
    x: (-view.tx / view.scale) * geom.scale + geom.offX,
    y: (-view.ty / view.scale) * geom.scale + geom.offY,
    w: (canvasSize.width / view.scale) * geom.scale,
    h: (canvasSize.height / view.scale) * geom.scale,
  };

  return (
    <div className="minimap" title="缩略图：点击可跳转">
      <svg width={W} height={H} onClick={handleClick} role="presentation">
        <rect x={0} y={0} width={W} height={H} fill="#fff" />
        {strokes.map((s) => {
          if (s.points.length < 2) return null;
          const d = s.points.map((p, i) => {
            const m = toMini(p.x, p.y);
            return `${i === 0 ? 'M' : 'L'}${m.x.toFixed(1)},${m.y.toFixed(1)}`;
          }).join(' ');
          return <path key={s.id} d={d} stroke={s.color} strokeWidth={Math.max(1, s.width * geom.scale)} fill="none" strokeLinecap="round" />;
        })}
        {notes.map((n) => {
          const p = toMini(n.x, n.y);
          return (
            <rect
              key={n.id}
              x={p.x}
              y={p.y}
              width={Math.max(2, n.w * geom.scale)}
              height={Math.max(2, n.h * geom.scale)}
              fill={NOTE_COLOR_MAP[n.color]?.bg ?? '#ffe4a3'}
              stroke={NOTE_COLOR_MAP[n.color]?.border ?? '#efc75c'}
              strokeWidth={1}
            />
          );
        })}
        <rect
          x={viewport.x}
          y={viewport.y}
          width={viewport.w}
          height={viewport.h}
          fill="rgba(79,70,229,0.08)"
          stroke="#4f46e5"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}
