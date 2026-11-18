import { useBoard } from '../lib/boardContext';
import type { Note } from '../types';

interface Point {
  x: number;
  y: number;
}

/** 计算连线在两个便签之间的起止点（贴着便签边缘） */
export function edgeGeometry(from: Note, to: Note): { p1: Point; p2: Point } {
  const fc = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
  const tc = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
  const dx = tc.x - fc.x;
  const dy = tc.y - fc.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { p1: { x: from.x + from.w, y: fc.y }, p2: { x: to.x, y: tc.y } };
    }
    return { p1: { x: from.x, y: fc.y }, p2: { x: to.x + to.w, y: tc.y } };
  }
  if (dy >= 0) {
    return { p1: { x: fc.x, y: from.y + from.h }, p2: { x: tc.x, y: to.y } };
  }
  return { p1: { x: fc.x, y: from.y }, p2: { x: tc.x, y: to.y + to.h } };
}

export default function EdgeLayer() {
  const { store, pendingLink } = useBoard();
  const notes = store.notes;

  return (
    <svg className="edge-layer">
      <defs>
        <marker id="arrow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b93a5" />
        </marker>
        <marker id="arrow-head-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#4f46e5" />
        </marker>
      </defs>

      {[...store.edges.values()].map((edge) => {
        const from = notes.get(edge.from);
        const to = notes.get(edge.to);
        if (!from || !to) return null;
        const { p1, p2 } = edgeGeometry(from, to);
        const d = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
        const active = store.selection?.kind === 'edge' && store.selection.id === edge.id;
        return (
          <g key={edge.id}>
            <path
              className="edge-hit"
              d={d}
              onPointerDown={(e) => {
                e.stopPropagation();
                store.select({ kind: 'edge', id: edge.id });
              }}
            />
            <path
              className={`edge${active ? ' is-active' : ''}`}
              d={d}
              markerEnd={`url(#${active ? 'arrow-head-active' : 'arrow-head'})`}
            />
          </g>
        );
      })}

      {pendingLink &&
        (() => {
          const from = notes.get(pendingLink.from);
          if (!from) return null;
          const p1 = { x: from.x + from.w, y: from.y + from.h / 2 };
          return (
            <path
              className="edge is-pending"
              d={`M ${p1.x} ${p1.y} L ${pendingLink.x} ${pendingLink.y}`}
              markerEnd="url(#arrow-head-active)"
            />
          );
        })()}
    </svg>
  );
}
