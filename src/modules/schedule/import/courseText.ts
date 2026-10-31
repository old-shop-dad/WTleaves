// 单块课程文本 → ParsedCourse（网格单元格 / 扁平表一行共用）
import { periodRange, type Period } from '../../../lib/schedule/periods.ts';
import type { ParsedCourse } from './types.ts';
import { normalizeText, looksLocation, looksTeacher, splitLines } from './normalize.ts';
import { extractDay, extractExplicitFields, extractPeriods, extractTimeRange } from './metadata.ts';
import { extractWeeks } from './weeks.ts';

export interface BlockContext {
  totalWeeks: number;
  periods: Period[];
  day?: number;
  periodStart?: number;
  periodEnd?: number;
  source?: string;
}

function cleanLine(line: string): string {
  return line
    .replace(/[[\]]/g, ' ')
    .replace(/[(]\s*[)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseCourseText(input: string, ctx: BlockContext): ParsedCourse | null {
  const warnings: string[] = [];
  const raw = normalizeText(input);
  if (!raw) return null;

  const weekInfo = extractWeeks(raw, ctx.totalWeeks);
  if (!weekInfo.matched) warnings.push('未识别周次，按每周处理');

  const periodInfo = extractPeriods(weekInfo.rest);
  const timeInfo = extractTimeRange(periodInfo.rest);
  const dayInfo = ctx.day != null ? { day: ctx.day, rest: timeInfo.rest } : extractDay(timeInfo.rest);
  const fields = extractExplicitFields(dayInfo.rest);

  const lines = splitLines(fields.rest).map(cleanLine).filter(Boolean);
  if (lines.length === 0) return null;

  let teacher = fields.teacher;
  let location = fields.location;
  let title = '';

  const takeTitleLine = (line: string) => {
    const tokens = line.split(/\s+/).filter(Boolean);
    title = tokens.shift() ?? '';
    for (const token of tokens) {
      if (!location && looksLocation(token)) location = token;
      else if (!teacher && looksTeacher(token)) teacher = token;
    }
  };

  takeTitleLine(lines[0]);
  for (const line of lines.slice(1)) {
    if (!location && looksLocation(line)) location = line;
    else if (!teacher && looksTeacher(line)) teacher = line;
    else if (!location) location = line;
    else if (!teacher) teacher = line;
  }

  title = title.replace(/^[·•\-\s]+|[·•\-\s]+$/g, '').trim();
  if (!title || title.length < 2 || /^[\d\s\-.,:;]+$/.test(title)) return null;
  if (dayInfo.day == null || dayInfo.day < 0 || dayInfo.day > 6) return null;

  const startPeriod = periodInfo.start ?? ctx.periodStart;
  const endPeriod = periodInfo.end ?? ctx.periodEnd ?? startPeriod;
  let startMin = timeInfo.startMin;
  let endMin = timeInfo.endMin;

  if (startMin == null || endMin == null) {
    if (startPeriod != null) {
      const startP = periodRange(ctx.periods, startPeriod);
      const endP = periodRange(ctx.periods, endPeriod ?? startPeriod);
      if (startP && endP) {
        startMin = startP.startMin;
        endMin = endP.endMin;
      }
    }
  }

  if (startMin == null || endMin == null) {
    startMin = 8 * 60;
    endMin = 8 * 60 + 45;
    warnings.push('未识别具体时间，暂按第 1 节');
  }
  if (endMin <= startMin) {
    return {
      title,
      dayOfWeek: dayInfo.day,
      startMin,
      endMin: startMin + 45,
      location,
      teacher,
      weekPattern: weekInfo.pattern,
      weeksText: weekInfo.text || undefined,
      periodStart: startPeriod,
      periodEnd: endPeriod,
      source: ctx.source ?? raw,
      warnings: [...warnings, '结束时间早于开始时间，已按 45 分钟修正'],
    };
  }

  return {
    title,
    dayOfWeek: dayInfo.day,
    startMin,
    endMin,
    location,
    teacher,
    weekPattern: weekInfo.pattern,
    weeksText: weekInfo.text || undefined,
    periodStart: startPeriod,
    periodEnd: endPeriod,
    source: ctx.source ?? raw,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
