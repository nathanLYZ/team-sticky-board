import type { BoardTemplate, TemplateIconKey } from '../lib/templates';

const iconBase = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

/** 模板图标：色块里的小图形，用来区分不同模板 */
export function TemplateIcon({ icon }: { icon: TemplateIconKey }) {
  switch (icon) {
    case 'quad':
      return (
        <svg {...iconBase}>
          <rect x="2.5" y="2.5" width="4.6" height="4.6" rx="1" />
          <rect x="8.9" y="2.5" width="4.6" height="4.6" rx="1" />
          <rect x="2.5" y="8.9" width="4.6" height="4.6" rx="1" />
          <rect x="8.9" y="8.9" width="4.6" height="4.6" rx="1" />
        </svg>
      );
    case 'journey':
      return (
        <svg {...iconBase}>
          <circle cx="3" cy="8" r="1.7" />
          <circle cx="13" cy="8" r="1.7" />
          <path d="M4.8 8h6.4M9.4 6.2L11.2 8l-1.8 1.8" />
        </svg>
      );
    case 'swot':
      return (
        <svg {...iconBase}>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
          <path d="M8 2.5v11M2.5 8h11" />
        </svg>
      );
    case 'matrix':
      return (
        <svg {...iconBase}>
          <path d="M3 2.5v11h11" />
          <circle cx="6" cy="6" r="1.5" />
          <circle cx="10.5" cy="10.5" r="1.5" />
        </svg>
      );
    case 'score':
      return (
        <svg {...iconBase}>
          <rect x="3" y="2.5" width="10" height="11" rx="1.5" />
          <path d="M5.6 6h4.8M5.6 8.6h4.8M5.6 11.2h2.6" />
        </svg>
      );
    case 'mind':
      return (
        <svg {...iconBase}>
          <circle cx="8" cy="8" r="2.2" />
          <path d="M8 5.8V2.5M8 10.2v3.3M5.8 8H2.5M10.2 8h3.3" />
        </svg>
      );
    case 'check':
      return (
        <svg {...iconBase}>
          <path d="M2.5 4l1.6 1.6L6.8 2.9" />
          <path d="M8.6 4.2h4.9" />
          <path d="M2.5 10.4l1.6 1.6 2.7-2.7" />
          <path d="M8.6 10.6h4.9" />
        </svg>
      );
    case 'okr':
      return (
        <svg {...iconBase}>
          <circle cx="7" cy="9" r="4.5" />
          <circle cx="7" cy="9" r="1.4" />
          <path d="M10.6 5.4L13.5 2.5M10.8 2.5h2.7v2.7" />
        </svg>
      );
    default:
      return null;
  }
}

/** 顶栏「模板」按钮的图标 */
export function IconTemplate() {
  return (
    <svg {...iconBase}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M2.5 6.6h11M6.6 6.6v6.9" />
    </svg>
  );
}

export function IconPalette() {
  return (
    <svg {...iconBase}>
      <circle cx="4" cy="4.6" r="1.5" />
      <circle cx="8" cy="3.6" r="1.5" />
      <circle cx="12" cy="5.2" r="1.5" />
      <circle cx="4.6" cy="9" r="1.5" />
      <path d="M9.4 12.6l4-4 1.6 1.6-4 4z" />
    </svg>
  );
}

export function IconGrid() {
  return (
    <svg {...iconBase}>
      <rect x="2.5" y="2.5" width="4.6" height="4.6" rx="1" />
      <rect x="8.9" y="2.5" width="4.6" height="4.6" rx="1" />
      <rect x="2.5" y="8.9" width="4.6" height="4.6" rx="1" />
      <rect x="8.9" y="8.9" width="4.6" height="4.6" rx="1" />
    </svg>
  );
}

interface TemplateLibraryProps {
  templates: BoardTemplate[];
  noteCount: number;
  onApply: (tpl: BoardTemplate) => void;
  onTidyByColor: () => void;
  onTidyGrid: () => void;
  onClose: () => void;
}

/** 模板库面板：套模板 + 一键整理 */
export default function TemplateLibrary({
  templates,
  noteCount,
  onApply,
  onTidyByColor,
  onTidyGrid,
  onClose,
}: TemplateLibraryProps) {
  return (
    <div className="tpl-backdrop" onClick={onClose}>
      <div className="tpl-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tpl-head">
          <div className="tpl-head-text">
            <h2>模板库</h2>
            <p>一键生成结构化画布，不用从空白开始</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="关闭">
            ×
          </button>
        </div>

        <div className="tpl-list">
          {templates.map((tpl) => (
            <button key={tpl.id} type="button" className="tpl-item" onClick={() => onApply(tpl)}>
              <span className="tpl-icon" style={{ background: tpl.tone }}>
                <TemplateIcon icon={tpl.icon} />
              </span>
              <span className="tpl-item-text">
                <strong>{tpl.name}</strong>
                <span>{tpl.desc}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="tpl-tidy">
          <div className="tpl-tidy-label">一键整理</div>
          <div className="tpl-tidy-actions">
            <button type="button" className="tpl-tidy-btn" onClick={onTidyByColor} disabled={noteCount === 0}>
              <IconPalette />
              按颜色
            </button>
            <button type="button" className="tpl-tidy-btn" onClick={onTidyGrid} disabled={noteCount === 0}>
              <IconGrid />
              排整齐
            </button>
          </div>
        </div>

        <p className="tpl-tip">模板会在画布中心生成带占位文案的分区与便签，可直接改写。</p>
      </div>
    </div>
  );
}
