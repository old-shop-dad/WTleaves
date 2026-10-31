// 周次引擎：第 1 周 = 学期开始日期所在自然周的周一 ~ 周日
// 纯函数，无副作用；周次范围 1..totalWeeks，超出返回 null
// EXPORTS: WeekPattern, SemesterLike, SemesterState, parseDateKey, firstMondayOf,
//          totalWeeksOf, weekNumberOn, weekStartOf, weekRangeOf, weeksOf,
//          isWeekActive, formatWeekPattern, parseWeekText, semesterStateOn

export type WeekPattern =
  | { type: 'all' }
  | { type: 'odd'; maxWeek?: number }
  | { type: 'even'; maxWeek?: number }
  | { type: 'weeks'; weeks: number[] };

export interface SemesterLike {
  startDate: string;
  endDate?: string;
  totalWeeks?: number;
}

export type SemesterState = 'none' | 'notStarted' | 'ongoing' | 'ended';

export const DEFAULT_TOTAL_WEEKS = 20;
const DAY_MS = 86400000;

/** yyyy-MM-dd → 本地零点 Date；非法/空返回 null（不抛错） */
export function parseDateKey(key?: string | null): Date | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(y, mo, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo || date.getDate() !== d) return null;
  return date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

/** 学期开始日期所在自然周的周一 */
export function firstMondayOf(startDate: string): Date | null {
  const d = parseDateKey(startDate);
  if (!d) return null;
  const weekday = d.getDay() || 7; // 周日=7，周一=1
  return addDays(d, 1 - weekday);
}

/** 学期总周数：显式配置优先，否则按 endDate 推算，最后回退 20 */
export function totalWeeksOf(semester: SemesterLike | null | undefined): number {
  if (!semester) return DEFAULT_TOTAL_WEEKS;
  const explicit = Number(semester.totalWeeks);
  if (Number.isFinite(explicit) && explicit >= 1) return Math.min(60, Math.round(explicit));
  const first = firstMondayOf(semester.startDate);
  const end = parseDateKey(semester.endDate ?? '');
  if (first && end) {
    const weeks = Math.floor((startOfDay(end).getTime() - first.getTime()) / (7 * DAY_MS)) + 1;
    if (weeks >= 1) return Math.min(60, weeks);
  }
  return DEFAULT_TOTAL_WEEKS;
}

/** 某天属于第几周：开学前/学期结束后返回 null（不再返回 0 或负数） */
export function weekNumberOn(semester: SemesterLike | null | undefined, date: Date): number | null {
  if (!semester) return null;
  const first = firstMondayOf(semester.startDate);
  if (!first) return null;
  const d = startOfDay(date);
  const end = parseDateKey(semester.endDate ?? '');
  if (end && d.getTime() > end.getTime()) return null;
  const diff = Math.round((d.getTime() - first.getTime()) / DAY_MS);
  if (diff < 0) return null;
  const week = Math.floor(diff / 7) + 1;
  if (week > totalWeeksOf(semester)) return null;
  return week;
}

/** 第 n 周的周一（n 从 1 开始） */
export function weekStartOf(semester: SemesterLike | null | undefined, week: number): Date | null {
  if (!semester || !Number.isFinite(week)) return null;
  const first = firstMondayOf(semester.startDate);
  if (!first) return null;
  return addDays(first, (Math.round(week) - 1) * 7);
}

/** 第 n 周的周一 ~ 周日 */
export function weekRangeOf(
  semester: SemesterLike | null | undefined,
  week: number,
): { start: Date; end: Date } | null {
  const start = weekStartOf(semester, week);
  if (!start) return null;
  return { start, end: addDays(start, 6) };
}

/** 把周次规则展开为具体周次数组（限定在 1..totalWeeks） */
export function weeksOf(pattern: WeekPattern | null | undefined, totalWeeks: number): number[] {
  const total = Math.max(1, Math.round(totalWeeks || DEFAULT_TOTAL_WEEKS));
  if (!pattern) return [];
  if (pattern.type === 'all') {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (pattern.type === 'odd' || pattern.type === 'even') {
    const max = Math.min(total, Math.max(1, Math.round(pattern.maxWeek ?? total)));
    const wantOdd = pattern.type === 'odd';
    const out: number[] = [];
    for (let w = 1; w <= max; w++) {
      if ((w % 2 === 1) === wantOdd) out.push(w);
    }
    return out;
  }
  const seen = new Set<number>();
  for (const w of pattern.weeks) {
    const n = Math.round(Number(w));
    if (Number.isFinite(n) && n >= 1 && n <= total) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

/** 单周/双周期末是否仍然成立（修复旧实现无上界的问题） */
export function isWeekActive(
  pattern: WeekPattern | null | undefined,
  week: number,
  totalWeeks: number,
): boolean {
  if (!pattern) return false;
  if (!Number.isFinite(week)) return false;
  return weeksOf(pattern, totalWeeks).includes(Math.round(week));
}

function compressWeeks(weeks: number[]): string {
  if (weeks.length === 0) return '';
  const sorted = [...new Set(weeks)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const w = sorted[i];
    if (w === prev + 1) {
      prev = w;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    start = prev = w;
  }
  parts.push(start === prev ? String(start) : `${start}-${prev}`);
  return parts.join(',');
}

function isFullRange(weeks: number[], total: number): boolean {
  return weeks.length === total && weeks.every((w, i) => w === i + 1);
}

/** 规则 → 可读文案："每周" / "单周" / "1-16周(单)" / "1-8,10-16周" */
export function formatWeekPattern(pattern: WeekPattern | null | undefined, totalWeeks: number): string {
  const total = Math.max(1, Math.round(totalWeeks || DEFAULT_TOTAL_WEEKS));
  if (!pattern) return '每周';
  if (pattern.type === 'all') return '每周';
  if (pattern.type === 'odd' || pattern.type === 'even') {
    const max = Math.min(total, Math.max(1, Math.round(pattern.maxWeek ?? total)));
    const wantOdd = pattern.type === 'odd';
    const weeks = weeksOf(pattern, total);
    if (weeks.length === 0) return '无';
    const range = compressWeeks(weeks);
    // 覆盖到学期末时用更短的“单周/双周”
    if (max >= total) return wantOdd ? '单周' : '双周';
    return `${range}周${wantOdd ? '(单)' : '(双)'}`;
  }
  const weeks = weeksOf(pattern, total);
  if (weeks.length === 0) return '无';
  if (isFullRange(weeks, total)) return '每周';
  const oddFull = weeks.length === Math.ceil(total / 2) && weeks.every((w) => w % 2 === 1);
  const evenFull = weeks.length === Math.floor(total / 2) && weeks.every((w) => w % 2 === 0);
  if (oddFull) return '单周';
  if (evenFull) return '双周';
  const min = weeks[0];
  const max = weeks[weeks.length - 1];
  const expected = Math.floor((max - min) / 2) + 1;
  const everyOther = weeks.every((w, i) => w === min + i * 2) && weeks.length === expected;
  if (everyOther) {
    const range = min === max ? String(min) : `${min}-${max}`;
    return `${range}周${min % 2 === 1 ? '(单)' : '(双)'}`;
  }
  return `${compressWeeks(weeks)}周`;
}

/** 周次文本 → 规则；识别不出返回 null（调用方决定是否回退 all） */
export function parseWeekText(input: string, totalWeeks: number): WeekPattern | null {
  const total = Math.max(1, Math.round(totalWeeks || DEFAULT_TOTAL_WEEKS));
  let s = String(input ?? '').trim();
  if (!s) return null;
  // 全角数字/符号归一化
  s = s
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[，、]/g, ',')
    .replace(/[～~—–]/g, '-')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')');

  const brace = s.match(/\{([^{}]*)\}/);
  if (brace) s = brace[1];

  if (!/\d/.test(s) && /(全|每|所有)/.test(s) && !/(单|双)/.test(s)) {
    return { type: 'all' };
  }

  const odd = /单/.test(s);
  const even = /双/.test(s);
  const parity: 'odd' | 'even' | null = odd ? 'odd' : even ? 'even' : null;

  const weeks = new Set<number>();
  for (const m of s.matchAll(/(\d+)\s*(?:-\s*(\d+))?/g)) {
    const a = Number(m[1]);
    const b = m[2] != null ? Number(m[2]) : a;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const from = Math.max(1, Math.min(a, b));
    const to = Math.max(1, Math.max(a, b));
    for (let w = from; w <= to && w <= total; w++) weeks.add(w);
  }

  if (weeks.size === 0) {
    if (!parity) return null;
    for (let w = 1; w <= total; w++) {
      if ((w % 2 === 1) === (parity === 'odd')) weeks.add(w);
    }
  } else if (parity) {
    for (const w of [...weeks]) {
      if ((w % 2 === 1) !== (parity === 'odd')) weeks.delete(w);
    }
  }

  const list = [...weeks].sort((a, b) => a - b);
  if (list.length === 0) return null;
  if (isFullRange(list, total)) return { type: 'all' };
  return { type: 'weeks', weeks: list };
}

/** 某天的学期状态（今日页/课表页共用） */
export function semesterStateOn(
  semester: SemesterLike | null | undefined,
  date: Date,
): SemesterState {
  if (!semester) return 'none';
  const first = firstMondayOf(semester.startDate);
  if (!first) return 'none';
  const total = totalWeeksOf(semester);
  const lastDay = parseDateKey(semester.endDate ?? '') ?? addDays(first, total * 7 - 1);
  const d = startOfDay(date);
  if (d.getTime() < first.getTime()) return 'notStarted';
  if (d.getTime() > lastDay.getTime()) return 'ended';
  return weekNumberOn(semester, d) == null ? 'ended' : 'ongoing';
}
