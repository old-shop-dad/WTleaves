// 课表 ↔ ICS（iCalendar）：导出当前学期全部课程，导入外部日历事件
import {
  firstMondayOf, parseDateKey, totalWeeksOf, weekNumberOn, weeksOf,
  type WeekPattern,
} from '../../lib/semester.ts';
import { coursesOnDate } from '../../lib/schedule/occurrences.ts';
import { toDateKey } from '../../lib/dates.ts';
import type { IScheduleOverride, IScheduleSlot, ISemester } from '../../db/types.ts';

export interface IcsCourse {
  title: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  location?: string;
  teacher?: string;
  weekPattern: WeekPattern;
  weeksText?: string;
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function unescapeIcs(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function localDateTime(date: Date, minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}00`;
}

function utcStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
}

/** 生成当前学期的 ICS 文本（含停课/调课/补课） */
export function buildScheduleIcs(input: {
  semester: ISemester;
  slots: IScheduleSlot[];
  overrides: IScheduleOverride[];
}): string {
  const { semester, slots, overrides } = input;
  const first = firstMondayOf(semester.startDate);
  if (!first) return '';
  const total = totalWeeksOf(semester);
  const end = parseDateKey(semester.endDate)
    ?? new Date(first.getFullYear(), first.getMonth(), first.getDate() + total * 7 - 1);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//StudyDesk//Schedule//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcs(`${semester.name} · StudyDesk`)}`,
  ];

  const cursor = new Date(first);
  let index = 0;
  while (cursor.getTime() <= end.getTime()) {
    const dateKey = toDateKey(cursor);
    const week = weekNumberOn(semester, cursor);
    if (week != null) {
      const courses = coursesOnDate({ dateKey, semester, slots, overrides });
      for (const course of courses) {
        index++;
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:studydesk-${semester.id}-${dateKey}-${course.slotId ?? 'x'}-${course.startMin}-${index}@studydesk`);
        lines.push(`DTSTAMP:${utcStamp(new Date())}`);
        lines.push(`DTSTART:${localDateTime(cursor, course.startMin)}`);
        lines.push(`DTEND:${localDateTime(cursor, Math.min(24 * 60, course.endMin))}`);
        lines.push(`SUMMARY:${escapeIcs(course.title)}`);
        if (course.location) lines.push(`LOCATION:${escapeIcs(course.location)}`);
        lines.push(`DESCRIPTION:${escapeIcs([
          `第 ${week} 周`,
          course.teacher ? `教师：${course.teacher}` : '',
          course.change === 'moved' ? '本周调课' : course.change === 'added' ? '本周补课' : '',
          '由 StudyDesk 导出',
        ].filter(Boolean).join('\n'))}`);
        lines.push('END:VEVENT');
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  lines.push('END:VCALENDAR');
  return lines.map((line) => `${line}\r\n`).join('');
}

function parseIcsDate(value: string): Date | null {
  const raw = value.trim();
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m;
  if (z) {
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
  }
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

function unfoldIcs(text: string): string {
  return text.replace(/\r?\n[ \t]/g, '');
}

/** 解析 ICS 中的 VEVENT；支持单次事件与 WEEKLY RRULE（COUNT / INTERVAL） */
export function parseIcsCourses(
  text: string,
  semester: Pick<ISemester, 'startDate' | 'totalWeeks'>,
): IcsCourse[] {
  const source = unfoldIcs(String(text ?? ''));
  const blocks = source.split(/BEGIN:VEVENT/i).slice(1);
  const total = Math.max(1, Math.round(semester.totalWeeks || 20));
  const out: IcsCourse[] = [];

  for (const rawBlock of blocks) {
    const block = rawBlock.split(/END:VEVENT/i)[0] ?? '';
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const get = (name: string): string | undefined => {
      const line = lines.find((l) => l.toUpperCase().startsWith(`${name}:`) || l.toUpperCase().startsWith(`${name};`));
      if (!line) return undefined;
      return line.slice(line.indexOf(':') + 1);
    };

    const title = unescapeIcs(get('SUMMARY') ?? '').trim();
    const dtStart = get('DTSTART');
    if (!title || !dtStart) continue;
    const start = parseIcsDate(dtStart);
    if (!start) continue;
    const dtEnd = get('DTEND');
    const end = dtEnd ? parseIcsDate(dtEnd) : null;
    const startMin = start.getHours() * 60 + start.getMinutes();
    const endMin = end ? end.getHours() * 60 + end.getMinutes() : Math.min(24 * 60, startMin + 45);
    if (endMin <= startMin) continue;

    const startWeek = weekNumberOn(semester, start);
    if (startWeek == null) continue;

    const rrule = get('RRULE') ?? '';
    const count = Math.max(1, Number(rrule.match(/COUNT=(\d+)/i)?.[1] ?? 1));
    const interval = Math.max(1, Number(rrule.match(/INTERVAL=(\d+)/i)?.[1] ?? 1));
    const weeks: number[] = [];
    for (let i = 0; i < count; i++) {
      const w = startWeek + i * interval;
      if (w >= 1 && w <= total) weeks.push(w);
    }
    if (weeks.length === 0) continue;

    const description = unescapeIcs(get('DESCRIPTION') ?? '');
    const teacher = description.match(/(?:教师|老师)\s*[:：]\s*([^\n]+)/)?.[1]?.trim();
    const pattern: WeekPattern = weeks.length >= total ? { type: 'all' } : { type: 'weeks', weeks };

    out.push({
      title,
      dayOfWeek: start.getDay(),
      startMin,
      endMin,
      location: unescapeIcs(get('LOCATION') ?? '').trim() || undefined,
      teacher,
      weekPattern: pattern,
      weeksText: weeks.length >= total ? '每周' : `${weeks.join(',')}周`,
    });
  }

  // 合并同一门课的多条 VEVENT（StudyDesk 导出的是逐周事件）
  const merged = new Map<string, { base: IcsCourse; weeks: Set<number> }>();
  for (const course of out) {
    const key = [
      course.title, course.dayOfWeek, course.startMin, course.endMin,
      course.location ?? '', course.teacher ?? '',
    ].join('|');
    const weeks = weeksOf(course.weekPattern, total);
    const hit = merged.get(key);
    if (hit) {
      for (const w of weeks) hit.weeks.add(w);
    } else {
      merged.set(key, { base: course, weeks: new Set(weeks) });
    }
  }

  return [...merged.values()].map(({ base, weeks }) => {
    const list = [...weeks].sort((a, b) => a - b);
    return {
      ...base,
      weekPattern: list.length >= total ? { type: 'all' } : { type: 'weeks', weeks: list },
      weeksText: list.length >= total ? '每周' : `${list.join(',')}周`,
    };
  });
}
