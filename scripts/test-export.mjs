/**
 * 导出逻辑自测（无需启动服务）：
 *   node scripts/test-export.mjs
 */
import { buildJsonExport, buildMarkdownExport } from '../src/lib/exportBoard.ts';

const notes = [
  {
    id: 'n1',
    x: 0,
    y: 0,
    w: 220,
    h: 160,
    text: '# 迭代目标\n- [ ] 登录流程重构\n- [x] 支付回调联调\n- 负责人:小林\n**优先级**:高',
    color: 'amber',
    z: 1,
    createdBy: 'a',
    updatedBy: 'a',
    updatedAt: 1,
  },
  {
    id: 'n2',
    x: 300,
    y: 0,
    w: 220,
    h: 160,
    text: '阿远的便签',
    color: 'sky',
    z: 2,
    createdBy: 'b',
    updatedBy: 'b',
    updatedAt: 2,
  },
];
const edges = [{ id: 'e1', from: 'n1', to: 'n2' }];

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const md = buildMarkdownExport('Q4 规划', notes, edges);
check('Markdown 标题正确', md.startsWith('# Q4 规划'));
check('待办渲染为 checkbox', md.includes('- [ ] 登录流程重构'));
check('已完成项打勾', md.includes('- [x] 支付回调联调'));
check('列表项转换', md.includes('- 负责人:小林'));
check('连线关系输出', md.includes('迭代目标 → 阿远的便签'));

const json = JSON.parse(buildJsonExport('Q4 规划', notes, edges));
check('JSON 含标题', json.title === 'Q4 规划');
check('JSON 含便签与连线', json.notes.length === 2 && json.edges.length === 1);
check('JSON 含导出时间', typeof json.exportedAt === 'string');

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} 项通过`);
process.exit(failed ? 1 : 0);
