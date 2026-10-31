// 课表导入：解析结果类型
import type { WeekPattern } from '../../../lib/semester.ts';

export interface ParsedCourse {
  title: string;
  dayOfWeek: number; // 0=周日 1=周一 … 6=周六
  startMin: number;
  endMin: number;
  location?: string;
  teacher?: string;
  weekPattern: WeekPattern;
  weeksText?: string;
  periodStart?: number;
  periodEnd?: number;
  source?: string;
  warnings?: string[];
  error?: string;
}

export interface ParseOptions {
  totalWeeks: number;
  periods: Array<{ slot: number; startMin: number; endMin: number }>;
}

/** xlsx !merges 的简化结构 */
export interface CellMerge {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

export interface ParseResult {
  courses: ParsedCourse[];
  warnings: string[];
  layout: 'grid' | 'flat' | 'none';
}

export interface ConvertOptions extends ParseOptions {
  /** 单元格/行的原始来源，便于预览定位 */
  source?: string;
}
