// 课程时间冲突检测（纯函数，可测试）
// 输入：同 semesterId 下的课程 slot 列表；输出：存在时间+周次重叠的课程对
import { isWeekActive } from '../semester';
import type { IScheduleSlot } from '@/db/types';

export interface ScheduleConflict {
  a: IScheduleSlot;
  b: IScheduleSlot;
  /** 重叠发生的周次（按周次逐个判断，单双周/指定周次均正确处理） */
  overlapWeeks: number[];
}

/** 两门课在同一周次是否时间重叠：同一天 + [startMin,endMin) 区间相交 */
export function slotsTimeOverlap(a: Pick<IScheduleSlot, 'dayOfWeek' | 'startMin' | 'endMin'>, b: Pick<IScheduleSlot, 'dayOfWeek' | 'startMin' | 'endMin'>): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

/** 检测列表内所有冲突对（O(n²)，课表规模通常 <50 节，足够快） */
export function findConflicts(slots: IScheduleSlot[], totalWeeks: number): ScheduleConflict[] {
  const active = slots.filter((s) => !s.deletedAt || s.deletedAt === 0);
  const out: ScheduleConflict[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      if (!slotsTimeOverlap(a, b)) continue;
      // 求重叠周次：逐周判断双方是否都在这周上课
      const overlapWeeks: number[] = [];
      for (let w = 1; w <= totalWeeks; w++) {
        if (isWeekActive(a.weekPattern, w, totalWeeks) && isWeekActive(b.weekPattern, w, totalWeeks)) {
          overlapWeeks.push(w);
        }
      }
      if (overlapWeeks.length > 0) out.push({ a, b, overlapWeeks });
    }
  }
  return out;
}

/** 检查某条新/改课程与已有课程是否冲突（排除自身，用于表单保存提示） */
export function findConflictsWith(
  slots: IScheduleSlot[],
  candidate: Pick<IScheduleSlot, 'dayOfWeek' | 'startMin' | 'endMin' | 'weekPattern'>,
  selfId: number | undefined,
  totalWeeks: number,
): ScheduleConflict[] {
  const active = slots.filter((s) => (!s.deletedAt || s.deletedAt === 0) && s.id !== selfId);
  const out: ScheduleConflict[] = [];
  for (const s of active) {
    if (!slotsTimeOverlap(s, candidate)) continue;
    const overlapWeeks: number[] = [];
    for (let w = 1; w <= totalWeeks; w++) {
      if (isWeekActive(s.weekPattern, w, totalWeeks) && isWeekActive(candidate.weekPattern, w, totalWeeks)) {
        overlapWeeks.push(w);
      }
    }
    if (overlapWeeks.length > 0) out.push({ a: s, b: candidate as IScheduleSlot, overlapWeeks });
  }
  return out;
}

/** 周次列表的简洁中文描述，如 "1-3、7-9 周" */
export function describeWeeks(weeks: number[]): string {
  if (weeks.length === 0) return '';
  const sorted = [...new Set(weeks)].sort((x, y) => x - y);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = cur;
    prev = cur;
  }
  const joined = parts.join('、');
  return joined.includes('-') ? `${joined} 周` : `${joined} 周`;
}
