// 某天课程叠加测试：循环规则 + 停课 / 调课 / 补课
import test from 'node:test';
import assert from 'node:assert/strict';
import { coursesOnDate } from '../src/lib/schedule/occurrences.ts';

const sem = { startDate: '2026-09-07', endDate: '2026-12-20', totalWeeks: 16 };

function slot(id: number, dayOfWeek: number, weekPattern: unknown, startMin = 8 * 60, endMin = 9 * 60 + 40) {
  return {
    id,
    semesterId: 1,
    title: `课程${id}`,
    dayOfWeek,
    startMin,
    endMin,
    weekPattern,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: 0,
  };
}

test('每周课在每一周都出现', () => {
  const slots = [slot(1, 1, { type: 'all' })];
  assert.equal(coursesOnDate({ dateKey: '2026-09-07', semester: sem, slots, overrides: [] }).length, 1);
  assert.equal(coursesOnDate({ dateKey: '2026-10-12', semester: sem, slots, overrides: [] }).length, 1);
});

test('指定周次只在该周出现', () => {
  const slots = [slot(1, 1, { type: 'weeks', weeks: [2, 4] })];
  assert.equal(coursesOnDate({ dateKey: '2026-09-07', semester: sem, slots, overrides: [] }).length, 0);
  assert.equal(coursesOnDate({ dateKey: '2026-09-14', semester: sem, slots, overrides: [] }).length, 1);
});

test('停课只影响指定日期', () => {
  const slots = [slot(1, 1, { type: 'all' })];
  const overrides = [{ id: 9, date: '2026-09-07', semesterId: 1, kind: 'off', slotId: 1 }];
  assert.equal(coursesOnDate({ dateKey: '2026-09-07', semester: sem, slots, overrides }).length, 0);
  assert.equal(coursesOnDate({ dateKey: '2026-09-14', semester: sem, slots, overrides }).length, 1);
});

test('调课从原日期移到新日期', () => {
  const slots = [slot(1, 1, { type: 'all' })];
  const overrides = [{
    id: 10,
    date: '2026-09-08',
    fromDate: '2026-09-07',
    semesterId: 1,
    kind: 'move',
    slotId: 1,
    startMin: 10 * 60,
    endMin: 11 * 60 + 40,
  }];
  assert.equal(coursesOnDate({ dateKey: '2026-09-07', semester: sem, slots, overrides }).length, 0);
  const moved = coursesOnDate({ dateKey: '2026-09-08', semester: sem, slots, overrides });
  assert.equal(moved.length, 1);
  assert.equal(moved[0].change, 'moved');
  assert.equal(moved[0].startMin, 10 * 60);
});

test('补课只出现在指定日期', () => {
  const slots: unknown[] = [];
  const overrides = [{
    id: 11,
    date: '2026-09-09',
    semesterId: 1,
    kind: 'added',
    title: '临时补课',
    startMin: 19 * 60,
    endMin: 20 * 60 + 40,
  }];
  assert.equal(coursesOnDate({ dateKey: '2026-09-09', semester: sem, slots, overrides }).length, 1);
  assert.equal(coursesOnDate({ dateKey: '2026-09-10', semester: sem, slots, overrides }).length, 0);
});

test('学期开始前不展示循环课', () => {
  const slots = [slot(1, 1, { type: 'all' })];
  assert.equal(coursesOnDate({ dateKey: '2026-09-01', semester: sem, slots, overrides: [] }).length, 0);
});
