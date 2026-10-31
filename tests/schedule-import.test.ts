// 课表导入解析回归测试（Node 24 原生 TS）
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleRows, parseCsvText, splitCellBlocks } from '../src/modules/schedule/import/index.ts';
import { DEFAULT_PERIODS } from '../src/lib/schedule/periods.ts';

const options = { totalWeeks: 16, periods: DEFAULT_PERIODS };

function grid(rows: unknown[][], merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = []) {
  return parseScheduleRows(rows, merges, options);
}

test('网格课表：表头 + 周次 + 节次 + 教师地点', () => {
  const result = grid([
    ['节次', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
    ['1-2', '高等数学\n王老师\n[1-15周][1-2节]\n教3-201', '', '', '', '', '', ''],
  ]);
  assert.equal(result.layout, 'grid');
  assert.equal(result.courses.length, 1);
  const c = result.courses[0];
  assert.equal(c.title, '高等数学');
  assert.equal(c.dayOfWeek, 1);
  assert.equal(c.teacher, '王老师');
  assert.equal(c.location, '教3-201');
  assert.deepEqual(c.weekPattern, { type: 'weeks', weeks: Array.from({ length: 15 }, (_, i) => i + 1) });
  assert.equal(c.startMin, 8 * 60);
  assert.equal(c.endMin, 9 * 60 + 40);
});

test('网格课表：单双周花括号写法', () => {
  const result = grid([
    ['节次', '星期一', '星期二', '星期三'],
    ['3-4', '', '大学物理\n李老师\n{2-16周(双)}\n教1-101', ''],
  ]);
  const c = result.courses[0];
  assert.deepEqual(c.weekPattern, { type: 'weeks', weeks: [2, 4, 6, 8, 10, 12, 14, 16] });
  assert.equal(c.dayOfWeek, 2);
});

test('网格课表：合并单元格连堂只生成一条并跨节次', () => {
  const rows = [
    ['节次', '星期一', '星期二', '星期三'],
    ['1-2', '高等数学\n王老师\n[1-16周]\n教3-201', '', ''],
    ['3-4', '高等数学\n王老师\n[1-16周]\n教3-201', '', ''],
  ];
  const result = grid(rows, [{ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }]);
  assert.equal(result.courses.length, 1);
  assert.equal(result.courses[0].startMin, 8 * 60);
  assert.equal(result.courses[0].endMin, 11 * 60 + 40);
});

test('网格课表：同一格两门课按空行拆分', () => {
  const cell = '高等数学\n王老师\n[1-8周][1-2节]\n教3-201\n\n大学物理\n李老师\n[10-16周][1-2节]\n教1-101';
  assert.equal(splitCellBlocks(cell).length, 2);
  const result = grid([
    ['节次', '星期一', '星期二', '星期三'],
    ['1-2', cell, '', ''],
  ]);
  assert.equal(result.courses.length, 2);
  const titles = result.courses.map((c) => c.title).sort();
  assert.deepEqual(titles, ['大学物理', '高等数学']);
});

test('扁平表：中文表头别名', () => {
  const result = parseScheduleRows([
    ['课程名称', '星期', '开始时间', '结束时间', '周次', '地点', '教师'],
    ['线性代数', '周三', '14:00', '15:40', '1-8周', '教3-203', '张老师'],
  ], [], options);
  assert.equal(result.courses.length, 1);
  const c = result.courses[0];
  assert.equal(c.dayOfWeek, 3);
  assert.equal(c.startMin, 14 * 60);
  assert.deepEqual(c.weekPattern, { type: 'weeks', weeks: [1, 2, 3, 4, 5, 6, 7, 8] });
});

test('WakeUp CSV：开始/结束节数 + 星期 7 = 周日', () => {
  const csv = [
    '"课程名称","星期","开始节数","结束节数","老师","地点","周数"',
    '"高等数学","1","1","2","王老师","教3-201","1-16"',
    '"大学英语","7","3","4","李老师","文科楼405","1-16"',
  ].join('\n');
  const result = parseCsvText(csv, options);
  assert.equal(result.courses.length, 2);
  const english = result.courses.find((c) => c.title === '大学英语');
  assert.ok(english);
  assert.equal(english.dayOfWeek, 0);
  assert.equal(english.startMin, 10 * 60);
  assert.equal(english.endMin, 11 * 60 + 40);
});

test('解析失败不抛错，返回可展示的警告', () => {
  const result = parseScheduleRows([['乱七八糟'], ['没有课程']], [], options);
  assert.equal(result.courses.length, 0);
  assert.ok(result.warnings.length > 0);
});
