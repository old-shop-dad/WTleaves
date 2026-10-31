// 扁平表解析：表头别名 + 组合列 + 多段拆分 + WakeUp CSV
import { formatWeekPattern, parseWeekText, type WeekPattern } from '../../../lib/semester.ts';
import { periodRange } from '../../../lib/schedule/periods.ts';
import type { ParseOptions, ParseResult, ParsedCourse } from './types.ts';
import { normalizeText } from './normalize.ts';
import { extractTimeRange, parsePeriodNumber } from './metadata.ts';
import { parseCourseText } from './courseText.ts';

type Field =
  | 'title' | 'teacher' | 'location' | 'day'
  | 'startPeriod' | 'endPeriod' | 'period' | 'weeks'
  | 'startTime' | 'endTime' | 'time' | 'combined';

const HEADER_ALIASES: Record<Exclude<Field, 'combined'>, string[]> = {
  title: ['课程名称', '课程名', '课程', '科目', '课名', '名称', '科目名称'],
  teacher: ['任课教师', '授课教师', '教师姓名', '上课教师', '主讲教师', '教师', '老师'],
  location: ['上课地点', '教室名称', '教学场地', '上课教室', '地点', '教室', '场地', '校区'],
  day: ['星期几', '星期数', '上课星期', '星期', '周几'],
  startPeriod: ['开始节数', '开始节次', '起始节次', '起始节'],
  endPeriod: ['结束节数', '结束节次', '终止节次', '结束节'],
  period: ['起止节次', '节次', '节数', '第几节'],
  weeks: ['起止周', '上课周次', '周数', '周次'],
  startTime: ['开始时间', '上课时间', '起始时间'],
  endTime: ['结束时间', '下课时间', '终止时间'],
  time: ['起止时间', '时间'],
};

export function parseDayValue(input: unknown): number | null {
  const s = normalizeText(input);
  if (!s) return null;
  if (/^[0-6]$/.test(s)) return Number(s);
  if (s === '7') return 0; // WakeUp CSV：1=周一 … 7=周日
  const m = s.match(/(?:星期|周|礼拜)\s*([一二三四五六日天1-7])/);
  if (m) {
    const t = m[1];
    if (/^\d$/.test(t)) return Number(t) === 7 ? 0 : Number(t);
    return { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }[t] ?? null;
  }
  if (/^[日天]$/.test(s)) return 0;
  if (/^[一二三四五六]$/.test(s)) return { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 }[s] ?? null;
  return null;
}

function findHeaderRow(rows: unknown[][]): number {
  const limit = Math.min(rows.length, 20);
  for (let r = 0; r < limit; r++) {
    let hits = 0;
    for (const cell of rows[r] ?? []) {
      const s = normalizeText(cell);
      if (!s) continue;
      for (const aliases of Object.values(HEADER_ALIASES)) {
        if (aliases.some((a) => s.includes(a))) {
          hits += 1;
          break;
        }
      }
    }
    if (hits >= 2) return r;
  }
  return -1;
}

function mapColumns(headerCells: unknown[]): Record<Field, number> {
  const map: Record<Field, number> = {
    title: -1, teacher: -1, location: -1, day: -1,
    startPeriod: -1, endPeriod: -1, period: -1, weeks: -1,
    startTime: -1, endTime: -1, time: -1, combined: -1,
  };
  const used = new Set<number>();
  headerCells.forEach((cell, idx) => {
    const s = normalizeText(cell);
    if (!s || used.has(idx)) return;
    // 组合列：星期+节次 / 星期节次
    if (/星期|周/.test(s) && /节|时间/.test(s) && s.length <= 10) {
      map.combined = idx;
      used.add(idx);
      return;
    }
    for (const field of ['title', 'teacher', 'location', 'day', 'startPeriod', 'endPeriod', 'period', 'weeks', 'startTime', 'endTime', 'time'] as const) {
      if (HEADER_ALIASES[field].some((a) => s.includes(a))) {
        map[field] = idx;
        used.add(idx);
        return;
      }
    }
  });
  return map;
}

function cell(cells: string[], idx: number): string {
  return idx >= 0 && idx < cells.length ? cells[idx] : '';
}

function weeksFromCell(value: string, totalWeeks: number): { pattern: WeekPattern; text: string } | null {
  if (!value) return null;
  const raw = /周/.test(value) ? value : `${value}周`;
  const pattern = parseWeekText(raw, totalWeeks);
  if (!pattern) return null;
  return { pattern, text: formatWeekPattern(pattern, totalWeeks) };
}

function withOverrides(
  course: ParsedCourse,
  cells: string[],
  map: Record<Field, number>,
  totalWeeks: number,
  options: ParseOptions,
): ParsedCourse {
  const next = { ...course };
  const dayVal = parseDayValue(cell(cells, map.day));
  if (next.dayOfWeek == null && dayVal != null) next.dayOfWeek = dayVal;

  const weeksVal = cell(cells, map.weeks);
  const w = weeksFromCell(weeksVal, totalWeeks);
  if (w && (next.weekPattern.type === 'all' || !next.weeksText)) {
    next.weekPattern = w.pattern;
    next.weeksText = w.text;
  }

  const startP = parsePeriodNumber(cell(cells, map.startPeriod));
  const endP = parsePeriodNumber(cell(cells, map.endPeriod)) ?? startP;
  const noTime = next.warnings?.some((w) => w.includes('未识别具体时间')) ?? false;
  if (startP != null && noTime) {
    const range = periodRange(options.periods, startP);
    const endRange = periodRange(options.periods, endP ?? startP);
    if (range) {
      next.periodStart = startP;
      next.periodEnd = endP ?? startP;
      next.startMin = range.startMin;
      next.endMin = endRange?.endMin ?? range.endMin;
    }
  }

  const timeVal = cell(cells, map.time);
  const startT = cell(cells, map.startTime);
  const endT = cell(cells, map.endTime);
  const mergedTime = startT && endT ? `${startT}-${endT}` : timeVal || startT;
  if (mergedTime) {
    const t = extractTimeRange(mergedTime);
    if (t.startMin != null && t.endMin != null) {
      next.startMin = t.startMin;
      next.endMin = t.endMin;
    }
  }

  const titleVal = cell(cells, map.title);
  if (titleVal) next.title = titleVal;
  const teacherVal = cell(cells, map.teacher);
  if (teacherVal) next.teacher = teacherVal;
  const locationVal = cell(cells, map.location);
  if (locationVal) next.location = locationVal;
  return next;
}

function dedupe(courses: ParsedCourse[]): ParsedCourse[] {
  const seen = new Set<string>();
  return courses.filter((c) => {
    const weeks = c.weekPattern.type === 'weeks' ? c.weekPattern.weeks.join(',') : c.weekPattern.type;
    const key = `${c.title}|${c.dayOfWeek}|${c.startMin}|${c.endMin}|${weeks}|${c.location ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 解析扁平表 / WakeUp CSV 二维数组 */
export function parseFlatRows(rows: unknown[][], options: ParseOptions): ParseResult {
  const headerRow = findHeaderRow(rows);
  const warnings: string[] = [];
  const courses: ParsedCourse[] = [];

  if (headerRow < 0) {
    // 无表头：每行按组合文本拆
    for (const row of rows) {
      const text = (row ?? []).map(normalizeText).filter(Boolean).join(' ');
      if (!text) continue;
      for (const segment of text.split(/[;\n]/).map((s) => s.trim()).filter(Boolean)) {
        const parsed = parseCourseText(segment, {
          totalWeeks: options.totalWeeks,
          periods: options.periods,
          source: segment,
        });
        if (parsed) courses.push(parsed);
      }
    }
    if (courses.length > 0) warnings.push('未检测到表头，已按每行组合文本解析，请检查预览');
    return { courses: dedupe(courses), warnings, layout: courses.length > 0 ? 'flat' : 'none' };
  }

  const map = mapColumns(rows[headerRow] ?? []);
  for (let r = headerRow + 1; r < rows.length; r++) {
    const cells = (rows[r] ?? []).map((c) => normalizeText(c));
    if (cells.every((c) => !c)) continue;
    const combined = cell(cells, map.combined);
    const segments = combined
      ? combined.split(/[;\n]/).map((s) => s.trim()).filter(Boolean)
      : [''];

    for (const segment of segments) {
      const rawDay = cell(cells, map.day);
      const dayText = rawDay
        ? (/星期|周|礼拜/.test(rawDay) ? rawDay : `周${rawDay}`)
        : '';
      const rawWeeks = cell(cells, map.weeks);
      const weeksText = rawWeeks ? (/周/.test(rawWeeks) ? rawWeeks : `${rawWeeks}周`) : '';
      const startP = parsePeriodNumber(cell(cells, map.startPeriod));
      const endP = parsePeriodNumber(cell(cells, map.endPeriod));
      const periodText = startP != null
        ? `第${startP}${endP != null && endP !== startP ? `-${endP}` : ''}节`
        : cell(cells, map.period);
      const locationText = cell(cells, map.location);
      const teacherText = cell(cells, map.teacher);
      const startT = cell(cells, map.startTime);
      const endT = cell(cells, map.endTime);
      const timeText = startT && endT ? `${startT}-${endT}` : cell(cells, map.time) || startT;

      const text = [
        segment,
        cell(cells, map.title),
        dayText,
        periodText,
        weeksText,
        timeText,
        locationText ? `地点:${locationText}` : '',
        teacherText ? `教师:${teacherText}` : '',
      ].filter(Boolean).join(' ');
      const parsed = parseCourseText(text, {
        totalWeeks: options.totalWeeks,
        periods: options.periods,
        source: text,
      });
      if (!parsed) {
        warnings.push(`第 ${r + 1} 行无法识别：${text.slice(0, 50)}`);
        continue;
      }
      const withCols = withOverrides(parsed, cells, map, options.totalWeeks, options);
      if (withCols.dayOfWeek == null || withCols.dayOfWeek < 0 || withCols.dayOfWeek > 6) {
        warnings.push(`第 ${r + 1} 行缺少有效星期：${text.slice(0, 50)}`);
        continue;
      }
      if (withCols.warnings) warnings.push(...withCols.warnings);
      courses.push(withCols);
    }
  }

  return { courses: dedupe(courses), warnings, layout: courses.length > 0 ? 'flat' : 'none' };
}
