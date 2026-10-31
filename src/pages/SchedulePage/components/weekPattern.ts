// 周次列表 ↔ WeekPattern 互转（与组件分离，兼顾 fast-refresh）
import { formatWeekPattern, weeksOf, type WeekPattern } from '@/lib/semester';

export function weeksToPattern(weeks: number[], totalWeeks: number): WeekPattern {
  const total = Math.max(1, totalWeeks);
  const unique = [...new Set(weeks)].filter((w) => w >= 1 && w <= total).sort((a, b) => a - b);
  if (unique.length === 0) return { type: 'weeks', weeks: [] };
  if (unique.length === total) return { type: 'all' };
  const odd = unique.filter((w) => w % 2 === 1);
  const even = unique.filter((w) => w % 2 === 0);
  if (odd.length === unique.length && unique.length > 0 && unique.length === Math.ceil(total / 2)) {
    return { type: 'odd', maxWeek: total };
  }
  if (even.length === unique.length && unique.length > 0 && unique.length === Math.floor(total / 2)) {
    return { type: 'even', maxWeek: total };
  }
  return { type: 'weeks', weeks: unique };
}

export function patternToWeeks(pattern: WeekPattern | undefined | null, totalWeeks: number): number[] {
  return weeksOf(pattern, totalWeeks);
}

export function weeksSummary(pattern: WeekPattern, totalWeeks: number): string {
  return formatWeekPattern(pattern, totalWeeks);
}
