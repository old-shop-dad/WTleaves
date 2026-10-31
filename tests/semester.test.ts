// 周次引擎回归测试：node --test tests/*.test.ts（Node 24 原生 TS）
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  firstMondayOf,
  weekNumberOn,
  weekStartOf,
  weeksOf,
  isWeekActive,
  parseWeekText,
  formatWeekPattern,
  semesterStateOn,
} from '../src/lib/semester.ts';

const sem = { startDate: '2026-09-01', endDate: '2026-12-20', totalWeeks: 16 };

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('第 1 周从学期开始日期所在自然周的周一开始', () => {
  assert.equal(key(firstMondayOf('2026-09-01') as Date), '2026-08-31');
  assert.equal(key(weekStartOf(sem, 1) as Date), '2026-08-31');
  assert.equal(key(weekStartOf(sem, 2) as Date), '2026-09-07');
});

test('周次按周一锚定，开学前/学期结束后返回 null', () => {
  assert.equal(weekNumberOn(sem, new Date(2026, 7, 30)), null); // 8/30 周日
  assert.equal(weekNumberOn(sem, new Date(2026, 7, 31)), 1); // 8/31 周一
  assert.equal(weekNumberOn(sem, new Date(2026, 8, 6)), 1); // 9/6 周日
  assert.equal(weekNumberOn(sem, new Date(2026, 8, 7)), 2); // 9/7 周一
  assert.equal(weekNumberOn(sem, new Date(2026, 11, 14)), 16);
  assert.equal(weekNumberOn(sem, new Date(2026, 11, 21)), null); // 第 17 周
});

test('单双周有学期上界', () => {
  assert.equal(isWeekActive({ type: 'odd' }, 15, 16), true);
  assert.equal(isWeekActive({ type: 'odd' }, 16, 16), false);
  assert.equal(isWeekActive({ type: 'odd' }, 17, 16), false);
  assert.equal(isWeekActive({ type: 'even' }, 16, 16), true);
  assert.equal(isWeekActive({ type: 'even' }, 18, 16), false);
});

test('周次文法：范围 / 单双 / 多段 / 花括号', () => {
  assert.deepEqual(weeksOf(parseWeekText('1-16周(单)', 16), 16), [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.deepEqual(weeksOf(parseWeekText('{2-16周(双)}', 16), 16), [2, 4, 6, 8, 10, 12, 14, 16]);
  assert.deepEqual(weeksOf(parseWeekText('1-8,10-16周', 16), 16), [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(weeksOf(parseWeekText('单周', 16), 16), [1, 3, 5, 7, 9, 11, 13, 15]);
  assert.deepEqual(weeksOf(parseWeekText('第7周', 16), 16), [7]);
  assert.equal(parseWeekText('', 16), null);
  assert.equal(parseWeekText('随便写', 16), null);
});

test('周次文案可读且可回读', () => {
  assert.equal(formatWeekPattern({ type: 'all' }, 16), '每周');
  assert.equal(formatWeekPattern({ type: 'odd' }, 16), '单周');
  const oddRange = formatWeekPattern({ type: 'weeks', weeks: [1, 3, 5, 7] }, 16);
  assert.equal(oddRange, '1-7周(单)');
  const multi = parseWeekText('1-8,10-16周', 16);
  assert.equal(formatWeekPattern(multi, 16), '1-8,10-16周');
});

test('学期状态：未开始 / 进行中 / 已结束', () => {
  assert.equal(semesterStateOn(sem, new Date(2026, 7, 20)), 'notStarted');
  assert.equal(semesterStateOn(sem, new Date(2026, 8, 10)), 'ongoing');
  assert.equal(semesterStateOn(sem, new Date(2027, 0, 10)), 'ended');
  assert.equal(semesterStateOn(null, new Date()), 'none');
});
