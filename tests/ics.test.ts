// ICS 导出/导入测试
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScheduleIcs, parseIcsCourses } from '../src/modules/schedule/ics.ts';

const semester = {
  id: 1,
  name: '2026 秋季学期',
  startDate: '2026-09-07',
  endDate: '2026-12-27',
  totalWeeks: 16,
  isCurrent: true,
};

function slot(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    semesterId: 1,
    title: '高等数学',
    dayOfWeek: 1,
    startMin: 8 * 60,
    endMin: 9 * 60 + 40,
    location: '教3-201',
    teacher: '王老师',
    weekPattern: { type: 'all' },
    createdAt: 0,
    updatedAt: 0,
    deletedAt: 0,
    ...overrides,
  };
}

test('ICS 导出包含 VEVENT 与课程摘要', () => {
  const ics = buildScheduleIcs({ semester, slots: [slot()], overrides: [] });
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(ics.includes('SUMMARY:高等数学'));
  assert.ok(ics.includes('DTSTART:20260907T080000'));
});

test('ICS 导入按同一门课合并周次', () => {
  const ics = buildScheduleIcs({ semester, slots: [slot()], overrides: [] });
  const courses = parseIcsCourses(ics, semester);
  assert.equal(courses.length, 1);
  assert.equal(courses[0].title, '高等数学');
  assert.deepEqual(courses[0].weekPattern, { type: 'all' });
});

test('ICS 导入支持扁平事件与 RRULE COUNT', () => {
  const single = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:大学物理',
    'DTSTART:20260908T100000',
    'DTEND:20260908T114000',
    'LOCATION:教1-101',
    'DESCRIPTION:教师：李老师',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const one = parseIcsCourses(single, semester);
  assert.equal(one.length, 1);
  assert.equal(one[0].dayOfWeek, 2);
  assert.deepEqual(one[0].weekPattern, { type: 'weeks', weeks: [1] });

  const rrule = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'SUMMARY:大学英语',
    'DTSTART:20260909T140000',
    'DTEND:20260909T154000',
    'RRULE:FREQ=WEEKLY;COUNT=4;INTERVAL=2',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const four = parseIcsCourses(rrule, semester);
  assert.equal(four.length, 1);
  assert.deepEqual(four[0].weekPattern, { type: 'weeks', weeks: [1, 3, 5, 7] });
});
