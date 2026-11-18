import { useBoard } from '../lib/boardContext';

export default function CursorLayer() {
  const { store, cursors, view } = useBoard();

  return (
    <svg className="cursor-layer">
      {[...cursors.cursors.entries()].map(([id, cursor]) => {
        const member = store.members.get(id);
        const color = member?.color ?? '#8b93a5';
        const sx = cursor.x * view.scale + view.tx;
        const sy = cursor.y * view.scale + view.ty;
        return (
          <g key={id} transform={`translate(${sx}, ${sy})`}>
            <path
              d="M 0 0 L 0 17 L 4.4 13 L 7.6 20 L 10.8 18.4 L 7.6 11.6 L 13 11.6 Z"
              fill={color}
              stroke="#ffffff"
              strokeWidth="1.2"
            />
            <g transform="translate(12, 16)">
              <rect x="0" y="0" rx="5" ry="5" height="18" width={Math.max(34, (member?.name?.length ?? 2) * 12 + 12)} fill={color} />
              <text x="7" y="13" fill="#ffffff" fontSize="11" fontWeight="600">
                {member?.name ?? '成员'}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
