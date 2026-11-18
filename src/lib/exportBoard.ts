import type { Edge, Note } from '../types';

/** 导出完整数据（含坐标与连线），用于备份或迁移 */
export function buildJsonExport(title: string, notes: Note[], edges: Edge[]): string {
  return JSON.stringify(
    {
      title,
      exportedAt: new Date().toISOString(),
      notes,
      edges,
    },
    null,
    2,
  );
}

function toMarkdownLine(raw: string): string {
  const t = raw.trim();
  if (/^[-*]\s+\[[ xX]\]/.test(t)) {
    // 注意：这里必须写成 \[(?:x|X)\]，写成 \[xX\] 匹配的是字面量 "[xX]"
    const checked = /\[(?:x|X)\]/.test(t);
    return `- [${checked ? 'x' : ' '}] ${t.replace(/^[-*]\s+\[[ xX]\]\s*/, '')}`;
  }
  if (/^#{1,3}\s+/.test(t)) return `### ${t.replace(/^#{1,3}\s+/, '')}`;
  if (/^[-*]\s+/.test(t)) return `- ${t.replace(/^[-*]\s+/, '')}`;
  return raw;
}

function noteLabel(note: Note | undefined): string {
  if (!note) return '?';
  const first = note.text.split('\n').find((line) => line.trim());
  return (first ?? '（空便签）').replace(/^#+\s*/, '').slice(0, 24);
}

/** 导出可读清单：待办用 checkbox，附带连线关系 */
export function buildMarkdownExport(title: string, notes: Note[], edges: Edge[]): string {
  const lines = [`# ${title}`, '', `> 导出时间：${new Date().toLocaleString('zh-CN')}`, ''];
  notes.forEach((note) => {
    lines.push(note.text.split('\n').map(toMarkdownLine).join('\n'), '');
  });
  if (edges.length) {
    lines.push('---', '', '## 连线关系', '');
    edges.forEach((edge) => {
      const from = notes.find((n) => n.id === edge.from);
      const to = notes.find((n) => n.id === edge.to);
      lines.push(`- ${noteLabel(from)} → ${noteLabel(to)}`);
    });
    lines.push('');
  }
  return lines.join('\n');
}
