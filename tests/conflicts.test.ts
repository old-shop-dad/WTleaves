// 课表时间冲突检测纯函数测试
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  slotsTimeOverlap,
  findConflicts,
  findConflictsWith,
  describeWeeks,
} from '../src/lib/schedule/conflicts.ts';

function slot(id: number, dayOfWeek: number, weekPattern: unknown, startMin = 8 * 60, endMin = 9 * 60 + 40, title = `课程${id}`) {
  return {
    id,
    semesterId: 1,
    title,
    dayOfWeek,
    startMin,
    endMin,
    weekPattern,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: 0,
  };
}

const TOTAL = 16;

test('同一时间区间重叠判定', () => {
  assert.equal(slotsTimeOverlap(slot(1, 1, {}), slot(2, 1, {})), true); // 完全相同
  assert.equal(slotsTimeOverlap(slot(1, 1, {}, 8 * 60, 9 * 60), slot(2, 1, {}, 8 * 60 + 30, 10 * 60)), true); // 部分重叠
  assert.equal(slotsTimeOverlap(slot(1, 1, {}, 8 * 60, 9 * 60), slot(2, 1, {}, 9 * 60, 10 * 60)), false); // 首尾相接不重叠
  assert.equal(slotsTimeOverlap(slot(1, 1, {}), slot(2, 2, {})), false); // 不同天
});

test('每周课与每周课冲突', () => {
  const slots = [slot(1, 1, { type: 'all' }), slot(2, 1, { type: 'all' })];
  const conflicts = findConflicts(slots, TOTAL);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].overlapWeeks.length, TOTAL);
});

test('单周与双周不冲突（周次错开）', () => {
  const slots = [slot(1, 1, { type: 'odd' }), slot(2, 1, { type: 'even' })];
  assert.equal(findConflicts(slots, TOTAL).length, 0);
});

test('指定周次只在交集周冲突', () => {
  const slots = [
    slot(1, 1, { type: 'weeks', weeks: [1, 2, 3, 4] }),
    slot(2, 1, { type: 'weeks', weeks: [4, 5, 6] }),
  ];
  const conflicts = findConflicts(slots, TOTAL);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].overlapWeeks, [4]);
});

test('部分周次重叠 + 同日同段', () => {
  const slots = [
    slot(1, 3, { type: 'weeks', weeks: [1, 2, 3, 5, 7] }, 10 * 60, 11 * 60 + 40, '高数'),
    slot(2, 3, { type: 'weeks', weeks: [3, 4, 7] }, 10 * 60 + 30, 12 * 60, '英语'),
  ];
  const conflicts = findConflicts(slots, TOTAL);
  assert.equal(conflicts.length, 1);
  assert.deepEqual(conflicts[0].overlapWeeks, [3, 7]);
  assert.equal(conflicts[0].a.title, '高数');
  assert.equal(conflicts[0].b.title, '英语');
});

test('软删除的课程不参与冲突', () => {
  const slots = [slot(1, 1, { type: 'all' }), { ...slot(2, 1, { type: 'all' }), deletedAt: Date.now() }];
  assert.equal(findConflicts(slots, TOTAL).length, 0);
});

test('编辑时排除自身，不与自己冲突', () => {
  const slots = [slot(1, 1, { type: 'all' })];
  const conflicts = findConflictsWith(slots, { dayOfWeek: 1, startMin: 8 * 60, endMin: 9 * 60 + 40, weekPattern: { type: 'all' } }, 1, TOTAL);
  assert.equal(conflicts.length, 0);
});

test('新增课程与已有课程冲突检测', () => {
  const slots = [slot(1, 2, { type: 'all' }, 14 * 60, 15 * 60 + 40, '线代')];
  const candidate = { dayOfWeek: 2, startMin: 15 * 60, endMin: 16 * 60 + 40, weekPattern: { type: 'all' } };
  const conflicts = findConflictsWith(slots, candidate, undefined, TOTAL);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].a.title, '线代');
});

test('周次描述压缩为区间', () => {
  assert.equal(describeWeeks([1, 2, 3, 7, 9]), '1-3、7、9 周');
  assert.equal(describeWeeks([4]), '4 周');
  assert.equal(describeWeeks([]), '');
});
