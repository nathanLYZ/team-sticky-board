import type { NoteColor } from '../types';

/** 模板图标种类（面板里画在色块上的小图形） */
export type TemplateIconKey = 'quad' | 'journey' | 'swot' | 'matrix' | 'score' | 'mind' | 'check' | 'okr';

/** 模板里的一张便签，坐标相对模板中心 */
export interface TemplateNoteSpec {
  text: string;
  color: NoteColor;
  dx: number;
  dy: number;
  w?: number;
  h?: number;
}

export interface BoardTemplate {
  id: string;
  name: string;
  desc: string;
  icon: TemplateIconKey;
  /** 图标底色 */
  tone: string;
  notes: TemplateNoteSpec[];
  /** 连线：两个便签在 notes 数组里的下标 */
  edges?: Array<[number, number]>;
}

const W = 210;
const H = 150;

/**
 * 内置模板库。
 * 每个模板都是一组「相对中心」的便签 + 连线，应用时以画布中心为原点展开。
 */
export const TEMPLATES: BoardTemplate[] = [
  {
    id: 'retro-quadrant',
    name: '复盘四象限',
    desc: '把一次项目复盘拆成四个可填的象限',
    icon: 'quad',
    tone: '#3b6ef5',
    notes: [
      { text: '做得好的\n- \n- ', color: 'lime', dx: -230, dy: -170 },
      { text: '做得不好的\n- \n- ', color: 'rose', dx: 20, dy: -170 },
      { text: '意外的收获\n- \n- ', color: 'sky', dx: -230, dy: 20 },
      { text: '下次要改进\n- \n- ', color: 'violet', dx: 20, dy: 20 },
    ],
  },
  {
    id: 'user-journey',
    name: '用户旅程',
    desc: '按五阶段梳理用户从认知到复购的路径',
    icon: 'journey',
    tone: '#1fbf6b',
    notes: [
      { text: '认知\n用户怎么知道我们的？', color: 'sky', dx: -460, dy: 0, w: 180 },
      { text: '考虑\n在犹豫什么？', color: 'sky', dx: -230, dy: 0, w: 180 },
      { text: '购买\n第一次下单卡在哪？', color: 'lime', dx: 0, dy: 0, w: 180 },
      { text: '使用\n上手顺不顺？', color: 'lime', dx: 230, dy: 0, w: 180 },
      { text: '复购\n为什么再回来？', color: 'violet', dx: 460, dy: 0, w: 180 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ],
  },
  {
    id: 'swot',
    name: 'SWOT 分析',
    desc: '用四格看清优势劣势机会与威胁',
    icon: 'swot',
    tone: '#8b5cf6',
    notes: [
      { text: '优势 Strengths\n我们比别人强在哪', color: 'lime', dx: -230, dy: -170 },
      { text: '劣势 Weaknesses\n我们哪里弱', color: 'rose', dx: 20, dy: -170 },
      { text: '机会 Opportunities\n可以抓住什么', color: 'sky', dx: -230, dy: 20 },
      { text: '威胁 Threats\n什么会伤害我们', color: 'violet', dx: 20, dy: 20 },
    ],
  },
  {
    id: 'priority-matrix',
    name: '优先级矩阵',
    desc: '按价值与成本给需求排出先后顺序',
    icon: 'matrix',
    tone: '#f59e0b',
    notes: [
      { text: '优先做\n高价值 · 低成本', color: 'lime', dx: -230, dy: -170 },
      { text: '排期做\n高价值 · 高成本', color: 'amber', dx: 20, dy: -170 },
      { text: '顺手做\n低价值 · 低成本', color: 'sky', dx: -230, dy: 20 },
      { text: '先不做\n低价值 · 高成本', color: 'slate', dx: 20, dy: 20 },
    ],
  },
  {
    id: 'topic-scorecard',
    name: '选题评分卡',
    desc: '一页打分管住选题的价值与可行性',
    icon: 'score',
    tone: '#ef4444',
    notes: [
      { text: '选题：____', color: 'violet', dx: 0, dy: -230, w: 240, h: 100 },
      { text: '价值（1-5）\n用户有多需要', color: 'sky', dx: -330, dy: 0, w: 170, h: 130 },
      { text: '成本（1-5）\n要做多久', color: 'rose', dx: -110, dy: 0, w: 170, h: 130 },
      { text: '风险（1-5）\n哪里不确定', color: 'amber', dx: 110, dy: 0, w: 170, h: 130 },
      { text: '排期（1-5）\n什么时候要', color: 'lime', dx: 330, dy: 0, w: 170, h: 130 },
      { text: '总分：__ / 20\n结论：____', color: 'violet', dx: 0, dy: 230, w: 240, h: 110 },
    ],
  },
  {
    id: 'mind-map',
    name: '思维导图',
    desc: '从一个中心主题向外发散出四条分支',
    icon: 'mind',
    tone: '#38bdf8',
    notes: [
      { text: '中心主题\n____', color: 'violet', dx: 0, dy: 0, w: 200, h: 120 },
      { text: '分支 1\n____', color: 'sky', dx: -330, dy: -160, w: 190, h: 120 },
      { text: '分支 2\n____', color: 'lime', dx: 330, dy: -160, w: 190, h: 120 },
      { text: '分支 3\n____', color: 'amber', dx: -330, dy: 160, w: 190, h: 120 },
      { text: '分支 4\n____', color: 'rose', dx: 330, dy: 160, w: 190, h: 120 },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
  },
  {
    id: 'review-checklist',
    name: '需求评审清单',
    desc: '一页过会：目标、价值、指标、风险一次看完',
    icon: 'check',
    tone: '#7c5cff',
    notes: [
      { text: '需求：____\n一句话说清要做什么', color: 'violet', dx: 0, dy: -250, w: 260, h: 110 },
      { text: '目标用户\n谁会用？什么场景？', color: 'sky', dx: -230, dy: 0 },
      { text: '核心价值\n解决什么问题？', color: 'lime', dx: 20, dy: 0 },
      { text: '衡量指标\n怎么算做成了？', color: 'amber', dx: -230, dy: 200 },
      { text: '上线风险\n有什么坑？', color: 'rose', dx: 20, dy: 200 },
      { text: '结论\n做 / 再想想 / 不做', color: 'slate', dx: 0, dy: 400, w: 240, h: 100 },
    ],
  },
  {
    id: 'okr',
    name: 'OKR 目标拆解',
    desc: '一个目标拆成三条可衡量的关键结果',
    icon: 'okr',
    tone: '#0ea5e9',
    notes: [
      { text: 'O 目标\n____', color: 'violet', dx: 0, dy: -220, w: 240, h: 120 },
      { text: 'KR1\n____', color: 'sky', dx: -280, dy: 60 },
      { text: 'KR2\n____', color: 'lime', dx: 0, dy: 60 },
      { text: 'KR3\n____', color: 'amber', dx: 280, dy: 60 },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  },
];

export const TEMPLATE_NOTE_W = W;
export const TEMPLATE_NOTE_H = H;
