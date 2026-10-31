// 课表元数据提取：节次 / 时间 / 星期 / 教师 / 地点
import { normalizeText } from './normalize.ts';

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  十一: 11, 十二: 12,
};

export interface PeriodExtraction {
  start?: number;
  end?: number;
  rest: string;
}

export function parsePeriodNumber(input: unknown): number | null {
  const s = normalizeText(input).replace(/第|节/g, '').trim();
  if (!s) return null;
  const m = s.match(/\d+/);
  if (m) {
    const n = Number(m[0]);
    return Number.isFinite(n) && n >= 1 && n <= 30 ? n : null;
  }
  if (CN_NUM[s] != null) return CN_NUM[s];
  return null;
}

/** “1-2” / “第1-2节” / “一” → 节次区间 */
export function parsePeriodRange(input: unknown): { start: number; end: number } | null {
  const s = normalizeText(input).replace(/第|节/g, '').trim();
  if (!s) return null;
  const range = s.match(/(\d+)\s*-\s*(\d+)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a >= 1 && b >= 1 && a <= 30 && b <= 30) {
      return { start: Math.min(a, b), end: Math.max(a, b) };
    }
  }
  const single = parsePeriodNumber(s);
  return single == null ? null : { start: single, end: single };
}

/** 从文本中提取 “1-2节 / 第1,2节 / (3-4)” */
export function extractPeriods(input: string): PeriodExtraction {
  let rest = normalizeText(input);
  const range = rest.match(/(?:第)?\s*(\d+)\s*-\s*(\d+)\s*节/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    rest = rest.replace(range[0], ' ').replace(/\s+/g, ' ').trim();
    return { start: Math.min(a, b), end: Math.max(a, b), rest };
  }
  const list = rest.match(/(?:第)?\s*(\d+)\s*[,、和&+]\s*(\d+)\s*节/);
  if (list) {
    const nums = [Number(list[1]), Number(list[2])];
    rest = rest.replace(list[0], ' ').replace(/\s+/g, ' ').trim();
    return { start: Math.min(...nums), end: Math.max(...nums), rest };
  }
  const single = rest.match(/(?:第)?\s*(\d+)\s*节/);
  if (single) {
    const n = Number(single[1]);
    rest = rest.replace(single[0], ' ').replace(/\s+/g, ' ').trim();
    return { start: n, end: n, rest };
  }
  // 无“节”字：仅接受括号里的 1-2，避免把 “1-16周” 误当节次
  const bare = rest.match(/[(]\s*(\d+)\s*-\s*(\d+)\s*[)]/);
  if (bare) {
    const a = Number(bare[1]);
    const b = Number(bare[2]);
    rest = rest.replace(bare[0], ' ').replace(/\s+/g, ' ').trim();
    return { start: Math.min(a, b), end: Math.max(a, b), rest };
  }
  return { rest };
}

export interface TimeExtraction {
  startMin?: number;
  endMin?: number;
  rest: string;
}

export function clockToMin(clock: string): number {
  const [h, m] = clock.split(':').map((n) => Number(n) || 0);
  return h * 60 + m;
}

export function extractTimeRange(input: string): TimeExtraction {
  let rest = normalizeText(input);
  const m = rest.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
  if (!m) return { rest };
  const startMin = clockToMin(m[1]);
  const endMin = clockToMin(m[2]);
  rest = rest.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
  if (endMin <= startMin) return { rest };
  return { startMin, endMin, rest };
}

const CN_DAY: Record<string, number> = {
  日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
};

export interface DayExtraction {
  day?: number;
  rest: string;
}

/** 从文本中提取星期；兼容 周一/星期一/礼拜一/周1/1-7（7=周日） */
export function extractDay(input: string): DayExtraction {
  let rest = normalizeText(input);
  const m = rest.match(/(?:星期|周|礼拜)\s*([一二三四五六日天1-7])/);
  if (!m) return { rest };
  const token = m[1];
  const day = /^\d$/.test(token)
    ? (Number(token) === 7 ? 0 : Number(token))
    : CN_DAY[token];
  rest = rest.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
  return day == null ? { rest } : { day, rest };
}

export interface FieldsExtraction {
  teacher?: string;
  location?: string;
  rest: string;
}

/** 显式的“教师:”“地点:”字段优先 */
export function extractExplicitFields(input: string): FieldsExtraction {
  let rest = normalizeText(input);
  let teacher: string | undefined;
  let location: string | undefined;

  const t = rest.match(/(?:任课教师|授课教师|教师|老师)\s*:\s*([^\n/|,;]+)/);
  if (t) {
    teacher = t[1].trim();
    rest = rest.replace(t[0], ' ').replace(/\s+/g, ' ').trim();
  }
  const l = rest.match(/(?:上课地点|教学场地|地点|教室|场地|校区)\s*:\s*([^\n/|,;]+)/);
  if (l) {
    location = l[1].trim();
    rest = rest.replace(l[0], ' ').replace(/\s+/g, ' ').trim();
  }
  return { teacher, location, rest };
}
