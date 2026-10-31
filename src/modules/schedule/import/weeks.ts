// 周次文本提取：从混合文本中剥离并解析周次
import { formatWeekPattern, parseWeekText, type WeekPattern } from '../../../lib/semester.ts';
import { normalizeText } from './normalize.ts';

export interface WeekExtraction {
  pattern: WeekPattern;
  text: string;
  rest: string;
  matched: boolean;
}

const WEEK_RE =
  /(?:第)?\s*\d+(?:\s*-\s*\d+)?(?:\s*,\s*\d+(?:\s*-\s*\d+)?)*\s*周\s*(?:[(]?\s*(单|双)\s*[)])?/;

/** 从一段课表文本中提取周次（花括号优先 → 主表达式 → 单/双周） */
export function extractWeeks(input: string, totalWeeks: number): WeekExtraction {
  let rest = normalizeText(input);
  if (!rest) return { pattern: { type: 'all' }, text: '', rest, matched: false };

  const brace = rest.match(/\{([^{}]*)\}/);
  if (brace) {
    const inner = normalizeText(brace[1]);
    const pattern = parseWeekText(inner, totalWeeks);
    rest = rest.replace(brace[0], ' ').replace(/\s+/g, ' ').trim();
    if (pattern) {
      return { pattern, text: formatWeekPattern(pattern, totalWeeks), rest, matched: true };
    }
  }

  const m = rest.match(WEEK_RE);
  if (m) {
    const raw = normalizeText(m[0]);
    const pattern = parseWeekText(raw, totalWeeks);
    if (pattern) {
      rest = rest.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
      return { pattern, text: formatWeekPattern(pattern, totalWeeks), rest, matched: true };
    }
  }

  const oddEven = rest.match(/(单|双)周/);
  if (oddEven) {
    const pattern = parseWeekText(oddEven[0], totalWeeks);
    rest = rest.replace(oddEven[0], ' ').replace(/\s+/g, ' ').trim();
    if (pattern) {
      return { pattern, text: formatWeekPattern(pattern, totalWeeks), rest, matched: true };
    }
  }

  return { pattern: { type: 'all' }, text: '', rest, matched: false };
}

export function describeWeeks(pattern: WeekPattern, totalWeeks: number): string {
  return formatWeekPattern(pattern, totalWeeks);
}
