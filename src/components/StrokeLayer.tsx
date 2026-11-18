import type { Stroke } from '../types';

interface StrokeLayerProps {
  strokes: Stroke[];
  /** 正在画、还没提交的一笔 */
  current: Stroke | null;
}

function toPath(points: Array<{ x: number; y: number }>): string {
  if (!points.length) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

/** 自由画笔的笔画层（与便签同处世界坐标） */
export default function StrokeLayer({ strokes, current }: StrokeLayerProps) {
  const all = current ? [...strokes, current] : strokes;
  return (
    <svg className="stroke-layer">
      {all.map((s) => (
        <path
          key={s.id}
          className={`stroke${current?.id === s.id ? ' is-current' : ''}`}
          d={toPath(s.points)}
          stroke={s.color}
          strokeWidth={s.width}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
