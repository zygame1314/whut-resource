#!/usr/bin/env node
// 检索链路冒烟测试：只测确定性逻辑，不依赖网络 / D1 / 模型。
// 数据取自线上真实文件快照，用于防止针对单条 query 的过拟合。
import assert from 'node:assert/strict';
import {
  buildFtsMatchQuery,
  parseTimeConstraint,
  applyTimeConstraint,
  filterByRelevance,
  mergeScopeFirst
} from '../functions/utils.js';

const NOW = '2026/10/25 05:00:00';
let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push({ name, message: error.message });
  }
}

let seq = 0;
const file = (name, key) => ({ id: ++seq, name, key, is_directory: 0 });
const dir = (key, name) => ({ id: ++seq, name: name || key.split('/').filter(Boolean).pop(), key: `${key}/`, is_directory: 1 });

// 线上真实快照：0.课程资料/形势与政策/
const XS = {
  '2025-2026-1': [
    file('2025-2026-1 形策PPT.pdf', '0.课程资料/形势与政策/2025-2026-1/2025-2026-1 形策PPT.pdf'),
    file('【毫厘】2025-2026-1 形式与政策-精简版本.pdf', '0.课程资料/形势与政策/2025-2026-1/【毫厘】2025-2026-1 形式与政策-精简版本.pdf')
  ],
  '2025-2026-2': [
    file('2025-2026-2 形势与政策 复习题.pdf', '0.课程资料/形势与政策/2025-2026-2/2025-2026-2 形势与政策 复习题.pdf'),
    file('2025-2026-2 形势与政策 客观题.pdf', '0.课程资料/形势与政策/2025-2026-2/2025-2026-2 形势与政策 客观题.pdf')
  ],
  '2026-2027-1': [
    file('2026-2027-1 形势与政策 PPT汇总.pdf', '0.课程资料/形势与政策/2026-2027-1/2026-2027-1 形势与政策 PPT汇总.pdf')
  ]
};
const xsAll = Object.values(XS).flat();

// 线上真实快照：0.课程资料/高等数学A/2.高等数学A上期末真题/（目录名无年份）
const GS_FINAL = [
  '2019-2020-1-高等数学A上（A卷）试题及解析【CWA】.pdf',
  '2023-2024-1-高等数学A上（A卷）试题及解析【CWA】.pdf',
  '2024-2025-1-高等数学A上（A卷）试题及解析【CWA】.pdf',
  '2024-2025-1-高等数学A上（A卷）双语 试题及解析（译）【CWA】.pdf',
  '2025-2026-1-高等数学A上（A卷）试题及解析【CWA】.pdf'
].map(name => file(name, `0.课程资料/高等数学A/2.高等数学A上期末真题/${name}`));

// ---------- 时间约束解析 ----------
test('解析「2026第二学期」为自然年第二学期', () => {
  const parsed = parseTimeConstraint('2026', '请问有这学期的形式与政策资料吗，2026第二学期的', NOW);
  assert.equal(parsed.semester, 2);
  assert.deepEqual(parsed.years, [2026]);
});

test('显式学期优先于「这学期」', () => {
  assert.equal(parseTimeConstraint('2026', '这学期的，2026第二学期的', NOW).semester, 2);
});

test('只有「这学期」时按 10 月推成第 1 学期', () => {
  assert.equal(parseTimeConstraint('2026', '这学期的形势与政策', NOW).semester, 1);
});

test('无年份无学期返回 null', () => {
  assert.equal(parseTimeConstraint('张', '张老师的线代课件', NOW), null);
});

// ---------- 时间过滤 ----------
test('2026 第二学期只留 2025-2026-2', () => {
  const kept = applyTimeConstraint(xsAll, '2026', '2026第二学期', NOW);
  assert.deepEqual(kept.map(row => row.name).sort(), [
    '2025-2026-2 形势与政策 复习题.pdf',
    '2025-2026-2 形势与政策 客观题.pdf'
  ].sort());
});

test('2026 第一学期留两个 -1 学期', () => {
  const kept = applyTimeConstraint(xsAll, '2026', '2026第一学期', NOW);
  assert.equal(kept.length, 3);
  assert.ok(kept.every(row => row.key.includes('-1')));
});

test('只写 2026 保留所有覆盖该年的学年', () => {
  const kept = applyTimeConstraint(xsAll, '2026', '2026年的形势与政策', NOW);
  assert.equal(kept.length, xsAll.length);
});

test('严格口径筛空时回退宽松口径', () => {
  const rows = [file('2026-2027-2 形势与政策.pdf', '0.课程资料/形势与政策/2026-2027-2/2026-2027-2 形势与政策.pdf')];
  const kept = applyTimeConstraint(rows, '2026', '2026第二学期', NOW);
  assert.equal(kept && kept.length, 1, '宽松回退应保留覆盖 2026 的第 2 学期文件');
});

test('年份完全不覆盖时返回 null', () => {
  assert.equal(applyTimeConstraint(xsAll, '2021', '2021第二学期', NOW), null);
});

test('老师名不触发时间过滤', () => {
  assert.equal(applyTimeConstraint(xsAll, '张', '张老师的资料', NOW).length, xsAll.length);
});

test('无学年标记的文件在指定学期时被排除', () => {
  const rows = [file('空白论文纸(1).pdf', '0.课程资料/形势与政策/空白论文纸(1).pdf')];
  assert.equal(applyTimeConstraint(rows, '2026', '2026第二学期', NOW), null);
});

// ---------- 无年份目录的子项过滤 ----------
test('目录名无年份时按子项筛年份', () => {
  const kept = applyTimeConstraint(GS_FINAL, '2024', '2024年的高数上期末试卷', NOW);
  assert.deepEqual(kept.map(row => row.name).sort(), [
    '2023-2024-1-高等数学A上（A卷）试题及解析【CWA】.pdf',
    '2024-2025-1-高等数学A上（A卷）双语 试题及解析（译）【CWA】.pdf',
    '2024-2025-1-高等数学A上（A卷）试题及解析【CWA】.pdf'
  ]);
});

test('目录名无年份 + 第二学期且全是 -1 时筛空', () => {
  assert.equal(applyTimeConstraint(GS_FINAL, '2024', '2024第二学期', NOW), null);
});

// ---------- FTS 查询构造 ----------
test('中文 AND 用空格连接', () => {
  assert.equal(buildFtsMatchQuery('高数'), '高 数');
  assert.equal(buildFtsMatchQuery('小雅答答答脚本'), '小 雅 答 答 答 脚 本');
});

test('中文 OR 用 OR 连接', () => {
  assert.equal(buildFtsMatchQuery('高数', 'OR'), '高 OR 数');
});

test('ASCII 词保持 phrase，OR 模式不重复', () => {
  assert.equal(buildFtsMatchQuery('2024'), '"2 0 2 4"');
  assert.equal(buildFtsMatchQuery('2024', 'OR'), buildFtsMatchQuery('2024'));
});

// ---------- 结果合并 ----------
test('目录级合并补齐 relevance，避免二次过滤被清空', () => {
  const scope = {
    mode: 'directory',
    path: '0.课程资料/形势与政策/2025-2026-2',
    directory: dir('0.课程资料/形势与政策/2025-2026-2'),
    children: XS['2025-2026-2']
  };
  const merged = mergeScopeFirst(scope, []);
  assert.equal(merged.length, 3);
  assert.ok(merged.every(row => Number(row.relevance) > 0));
  assert.equal(filterByRelevance(merged).length, 3);
});

test('无年份目录返回 directory=null 时不回捞原始结果', () => {
  const scope = {
    mode: 'directory',
    path: '0.课程资料/高等数学A/2.高等数学A上期末真题',
    directory: null,
    children: [GS_FINAL[3]]
  };
  const merged = mergeScopeFirst(scope, GS_FINAL);
  assert.deepEqual(merged.map(row => row.name), [GS_FINAL[3].name]);
});

test('文件名级合并保留命中项的原始分数', () => {
  const base = XS['2025-2026-2'].map((row, i) => ({ ...row, relevance: 0.5 + i * 0.1, similarity_score: 0.5 + i * 0.1 }));
  const scope = { mode: 'name', matchedIds: [base[0].id], files: [] };
  const merged = mergeScopeFirst(scope, base);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].relevance, 0.5);
});

// ---------- 相关度过滤 ----------
test('多课程场景关闭相对阈值', () => {
  const rows = [{ relevance: 0.9 }, { relevance: 0.35 }];
  assert.equal(filterByRelevance(rows).length, 1);
  assert.equal(filterByRelevance(rows, { relativeRatio: 0 }).length, 2);
});

// ---------- 输出 ----------
if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} 项失败 / ${passed + failures.length} 项`);
  for (const item of failures) {
    console.error(`  - ${item.name}\n    ${item.message}`);
  }
  process.exit(1);
}
console.log(`✓ 检索链路冒烟测试全部通过（${passed} 项）`);
