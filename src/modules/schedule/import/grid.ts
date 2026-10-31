// 二维课表解析：表头检测 + 合并单元格 + 同格多课 + 连堂
import type { CellMerge, ParseOptions, ParseResult, ParsedCourse } from './types.ts';
import { normalizeText, looksTeacher } from './normalize.ts';
import { parsePeriodRange } from './metadata.ts';
import { parseCourseText } from './courseText.ts';

const CN_DAY: Record<string, number> = {
  日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
};

export interface GridLayout {
  headerRow: number;
  periodCol: number;
  dayCols: Map<number, number>;
}

/** 表头单元格 → 星期（0=周日）；返回 null 表示不是星期列 */
export function headerDay(cell: unknown): number | null {
  const s = normalizeText(cell).replace(/[()\s]/g, '');
  if (!s) return null;
  let m = s.match(/^(?:星期|周|礼拜)([一二三四五六日天])$/);
  if (m) return CN_DAY[m[1]] ?? null;
  m = s.match(/^(?:星期|周|礼拜)([1-7])$/);
  if (m) return Number(m[1]) === 7 ? 0 : Number(m[1]);
  if (/^[一二三四五六日天]$/.test(s)) return CN_DAY[s] ?? null;
  return null;
}

/** 找到“行=节次、列=星期”的二维课表布局 */
export function findGridLayout(rows: unknown[][]): GridLayout | null {
  let best: { row: number; cols: Map<number, number> } | null = null;
  const limit = Math.min(rows.length, 30);
  for (let r = 0; r < limit; r++) {
    const cols = new Map<number, number>();
    const seen = new Set<number>();
    rows[r].forEach((cell, col) => {
      const day = headerDay(cell);
      if (day == null || seen.has(day)) return;
      seen.add(day);
      cols.set(col, day);
    });
    if (cols.size >= 3 && (!best || cols.size > best.cols.size)) {
      best = { row: r, cols };
    }
  }
  if (!best) return null;

  const header = rows[best.row] ?? [];
  let periodCol = header.findIndex((cell) => /节次|节数|节|时间/.test(normalizeText(cell)));
  if (periodCol < 0) {
    periodCol = Math.max(0, Math.min(...best.cols.keys()) - 1);
  }
  return { headerRow: best.row, periodCol, dayCols: best.cols };
}

interface MergeInfo {
  rowspan: number;
  colspan: number;
  topLeft: boolean;
}

function expandMerges(
  rows: unknown[][],
  merges: CellMerge[],
): { matrix: string[][]; info: Map<string, MergeInfo> } {
  const matrix: string[][] = rows.map((row) => (row ?? []).map((cell) => normalizeText(cell)));
  const info = new Map<string, MergeInfo>();
  for (const merge of merges) {
    const { r, c } = merge.s;
    const er = Math.max(r, merge.e.r);
    const ec = Math.max(c, merge.e.c);
    const value = matrix[r]?.[c] ?? '';
    const rowspan = er - r + 1;
    const colspan = ec - c + 1;
    for (let rr = r; rr <= er; rr++) {
      if (!matrix[rr]) matrix[rr] = [];
      for (let cc = c; cc <= ec; cc++) {
        if (!matrix[rr][cc]) matrix[rr][cc] = value;
        info.set(`${rr}:${cc}`, {
          rowspan,
          colspan,
          topLeft: rr === r && cc === c,
        });
      }
    }
  }
  return { matrix, info };
}

/** 单元格内多门课：空行优先，其次按“周次行”推断分块 */
export function splitCellBlocks(text: string): string[] {
  const clean = normalizeText(text);
  if (!clean) return [];
  const byBlank = clean.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;

  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
  const weekLines = lines
    .map((line, idx) => (/周/.test(line) ? idx : -1))
    .filter((idx) => idx >= 0);
  if (weekLines.length < 2) return [clean];

  const starts = [0];
  for (let k = 1; k < weekLines.length; k++) {
    const idx = weekLines[k];
    const prev = lines[idx - 1] ?? '';
    const start = looksTeacher(prev) ? idx - 2 : idx - 1;
    const safe = Math.max(1, start);
    if (safe > starts[starts.length - 1]) starts.push(safe);
  }
  const blocks: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = starts[i + 1] ?? lines.length;
    const block = lines.slice(from, to).join('\n').trim();
    if (block) blocks.push(block);
  }
  return blocks.length > 0 ? blocks : [clean];
}

function dedupe(courses: ParsedCourse[]): ParsedCourse[] {
  const seen = new Set<string>();
  return courses.filter((c) => {
    const weeks = c.weekPattern.type === 'weeks'
      ? c.weekPattern.weeks.join(',')
      : c.weekPattern.type;
    const key = `${c.title}|${c.dayOfWeek}|${c.startMin}|${c.endMin}|${weeks}|${c.location ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 解析二维课表；不是网格返回 layout=none */
export function parseGridRows(
  rows: unknown[][],
  merges: CellMerge[],
  options: ParseOptions,
): ParseResult {
  const layout = findGridLayout(rows);
  if (!layout) return { courses: [], warnings: [], layout: 'none' };

  const { matrix, info } = expandMerges(rows, merges);
  const courses: ParsedCourse[] = [];
  const warnings: string[] = [];
  let currentPeriod: { start: number; end: number } | null = null;

  for (let r = layout.headerRow + 1; r < matrix.length; r++) {
    const periodCell = matrix[r]?.[layout.periodCol];
    const pr = parsePeriodRange(periodCell);
    if (pr) currentPeriod = pr;

    for (const [col, day] of layout.dayCols) {
      const cell = matrix[r]?.[col];
      if (!cell || !cell.trim()) continue;
      const merge = info.get(`${r}:${col}`);
      if (merge && !merge.topLeft) continue;
      const rowspan = merge?.rowspan ?? 1;
      const rowPeriods = currentPeriod ? currentPeriod.end - currentPeriod.start + 1 : 0;
      const periodStart = currentPeriod?.start;
      const periodEnd = currentPeriod
        ? currentPeriod.start + rowPeriods * rowspan - 1
        : undefined;
      const blocks = splitCellBlocks(cell);
      for (const block of blocks) {
        const parsed = parseCourseText(block, {
          totalWeeks: options.totalWeeks,
          periods: options.periods,
          day,
          periodStart,
          periodEnd,
          source: block,
        });
        if (!parsed) {
          warnings.push(`单元格无法识别：${normalizeText(block).slice(0, 40)}`);
          continue;
        }
        if (parsed.warnings) warnings.push(...parsed.warnings);
        courses.push(parsed);
      }
    }
  }

  if (courses.length === 0) {
    warnings.push('检测到网格结构，但单元格里没有识别到课程');
  }
  return { courses: dedupe(courses), warnings, layout: 'grid' };
}
