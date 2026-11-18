import type { ReactNode } from 'react';

export type Segment =
  | { type: 'text'; line: number; text: string }
  | { type: 'heading'; line: number; text: string }
  | { type: 'bullet'; line: number; text: string }
  | { type: 'quote'; line: number; text: string }
  | { type: 'check'; line: number; text: string; checked: boolean };

/**
 * 便签正文支持极简 Markdown：
 *   # 标题   - 列表项   - [ ] 待办   > 引用   **加粗**
 */
export function parseNoteText(text: string): Segment[] {
  return text.split('\n').map((raw, line) => {
    const trimmed = raw.trim();
    if (/^[-*]\s+\[[ xX]\]\s*/.test(trimmed)) {
      return {
        type: 'check',
        line,
        checked: /^\s*[-*]\s+\[[xX]\]/.test(trimmed),
        text: trimmed.replace(/^[-*]\s+\[[ xX]\]\s*/, ''),
      } as Segment;
    }
    if (/^#{1,3}\s+/.test(trimmed)) {
      return { type: 'heading', line, text: trimmed.replace(/^#{1,3}\s+/, '') } as Segment;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      return { type: 'bullet', line, text: trimmed.replace(/^[-*]\s+/, '') } as Segment;
    }
    if (/^>\s?/.test(trimmed)) {
      return { type: 'quote', line, text: trimmed.replace(/^>\s?/, '') } as Segment;
    }
    return { type: 'text', line, text: raw } as Segment;
  });
}

export function toggleCheckbox(text: string, line: number): string {
  const lines = text.split('\n');
  const raw = lines[line];
  if (raw === undefined) return text;
  const matched = /^(\s*[-*]\s+\[)([ xX])(\])/.exec(raw);
  if (!matched) return text;
  const nextMark = matched[2] === ' ' ? 'x' : ' ';
  lines[line] = raw.replace(/^(\s*[-*]\s+\[)([ xX])(\])/, `${matched[1]}${nextMark}${matched[3]}`);
  return lines.join('\n');
}

/** 行内 **加粗** / `代码` */
export function renderInline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(
        <code key={key++} className="inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
