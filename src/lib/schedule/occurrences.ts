// 某一天的实际课程：循环课 + 停课/调课/补课叠加（纯函数）
// 今日页与课表页共用，保证两处口径一致
// EXPORTS: CourseOccurrence, OccurrenceContext, coursesOnDate, originalDateOfMove

import type { IScheduleOverride, IScheduleSlot, ISemester, WeekPatternStore } from '@/db/types';
import {
  isWeekActive,
  parseDateKey,
  totalWeeksOf,
  weekNumberOn,
  weekStartOf,
} from '../semester.ts';

export interface CourseOccurrence {
  key: string;
  slotId?: number;
  overrideId?: number;
  title: string;
  startMin: number;
  endMin: number;
  periodStart?: number;
  periodEnd?: number;
  location?: string;
  teacher?: string;
  color?: string;
  weekPattern?: WeekPatternStore;
  change?: 'moved' | 'added';
}

export interface OccurrenceContext {
  dateKey: string;
  semester: Pick<ISemester, 'startDate' | 'endDate' | 'totalWeeks'> | null;
  slots: IScheduleSlot[];
  overrides: IScheduleOverride[];
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function slotIdOf(o: IScheduleOverride): number | null {
  return typeof o.slotId === 'number' && Number.isFinite(o.slotId) ? o.slotId : null;
}

/**
 * 调课的原上课日期：
 * 1) 显式 fromDate 优先（跨周调课）；
 * 2) 否则按调课目标日期所在周 + 原课程的 dayOfWeek 推导（同周调课）。
 */
export function originalDateOfMove(
  override: IScheduleOverride,
  base: IScheduleSlot | undefined,
  semester: OccurrenceContext['semester'],
): string | null {
  if (override.fromDate) return override.fromDate;
  if (!base || !semester) return null;
  const target = parseDateKey(override.date);
  if (!target) return null;
  const week = weekNumberOn(semester, target);
  if (week == null) return null;
  const monday = weekStartOf(semester, week);
  if (!monday) return null;
  const d = new Date(monday);
  d.setDate(monday.getDate() + ((base.dayOfWeek + 6) % 7));
  return keyOf(d);
}

/** 给定日期返回当天实际要上的课（已排序） */
export function coursesOnDate(ctx: OccurrenceContext): CourseOccurrence[] {
  const { dateKey, semester, slots, overrides } = ctx;
  const date = parseDateKey(dateKey);
  if (!date) return [];

  const total = totalWeeksOf(semester);
  const week = semester ? weekNumberOn(semester, date) : null;
  // 学期未开始/已结束：不展示循环课（补课记录仍按 date 展示）
  if (semester && week == null) {
    const extra = overrides
      .filter((o) => o.kind === 'added' && o.date === dateKey)
      .map<CourseOccurrence>((o) => ({
        key: `ov-${o.id}`,
        overrideId: o.id,
        title: o.title ?? '临时课',
        startMin: o.startMin ?? 0,
        endMin: o.endMin ?? 0,
        location: o.location,
        change: 'added',
      }));
    return extra.sort((a, b) => a.startMin - b.startMin);
  }

  const weekday = date.getDay();
  const byId = new Map<number, IScheduleSlot>();
  for (const s of slots) if (s.id != null) byId.set(s.id, s);

  const base = slots.filter((s) => {
    if (s.dayOfWeek !== weekday) return false;
    if (week != null) return isWeekActive(s.weekPattern, week, total);
    // 无学期时只显示“每周”课，周次规则无从判断
    return !s.weekPattern || s.weekPattern.type === 'all';
  });

  const offIds = new Set<number>();
  const movedFromIds = new Set<number>();
  for (const o of overrides) {
    const sid = slotIdOf(o);
    if (sid == null) continue;
    if (o.kind === 'off' && o.date === dateKey) offIds.add(sid);
    if (o.kind === 'move') {
      const from = originalDateOfMove(o, byId.get(sid), semester);
      if (from === dateKey) movedFromIds.add(sid);
    }
  }

  const list: CourseOccurrence[] = [];
  for (const s of base) {
    const sid = s.id as number;
    if (offIds.has(sid) || movedFromIds.has(sid)) continue;
    list.push({
      key: `slot-${sid}`,
      slotId: sid,
      title: s.title,
      startMin: s.startMin,
      endMin: s.endMin,
      periodStart: s.periodStart,
      periodEnd: s.periodEnd,
      location: s.location,
      teacher: s.teacher,
      color: s.color,
      weekPattern: s.weekPattern,
    });
  }

  for (const o of overrides) {
    if (o.kind !== 'move' || o.date !== dateKey) continue;
    const sid = slotIdOf(o);
    const s = sid != null ? byId.get(sid) : undefined;
    list.push({
      key: `ov-${o.id}`,
      slotId: sid ?? undefined,
      overrideId: o.id,
      title: o.title ?? s?.title ?? '调课',
      startMin: o.startMin ?? s?.startMin ?? 0,
      endMin: o.endMin ?? s?.endMin ?? 0,
      periodStart: s?.periodStart,
      periodEnd: s?.periodEnd,
      location: o.location ?? s?.location,
      teacher: s?.teacher,
      color: s?.color,
      weekPattern: s?.weekPattern,
      change: 'moved',
    });
  }

  for (const o of overrides) {
    if (o.kind !== 'added' || o.date !== dateKey) continue;
    list.push({
      key: `ov-${o.id}`,
      overrideId: o.id,
      title: o.title ?? '临时课',
      startMin: o.startMin ?? 0,
      endMin: o.endMin ?? 0,
      location: o.location,
      change: 'added',
    });
  }

  return list.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
}
