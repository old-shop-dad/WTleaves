// 课表导入统一入口：优先网格，其次扁平表；附带 CSV 解析
import type { CellMerge, ParseOptions, ParseResult } from './types.ts';
import { parseGridRows } from './grid.ts';
import { parseFlatRows } from './flat.ts';

export * from './types.ts';
export { parseCourseText } from './courseText.ts';
export { parseGridRows, splitCellBlocks } from './grid.ts';
export { parseFlatRows, parseDayValue } from './flat.ts';

export function parseScheduleRows(
  rows: unknown[][],
  merges: CellMerge[],
  options: ParseOptions,
): ParseResult {
  const grid = parseGridRows(rows, merges, options);
  if (grid.layout === 'grid' && grid.courses.length > 0) return grid;

  const flat = parseFlatRows(rows, options);
  if (flat.courses.length > 0) {
    return {
      ...flat,
      warnings: [...grid.warnings, ...flat.warnings],
    };
  }

  return {
    courses: [],
    warnings: [...grid.warnings, ...flat.warnings, '没有识别到课程，请检查文件格式或改用 AI 解析'],
    layout: 'none',
  };
}

/** 简单 CSV 解析：支持引号、逗号/制表符/分号分隔 */
export function parseCsvRows(text: string): string[][] {
  const source = String(text ?? '').replace(/\r\n?/g, '\n');
  const lines = source.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const first = lines[0];
  const delimiter = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  return lines.map((line) => parseCsvLine(line, delimiter));
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        value += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(value.trim());
      value = '';
    } else {
      value += ch;
    }
  }
  out.push(value.trim());
  return out;
}

/** CSV 文本 → 课程（WakeUp / 教务导出常见的 “课程名称,星期,...” 表头） */
export function parseCsvText(text: string, options: ParseOptions): ParseResult {
  return parseScheduleRows(parseCsvRows(text), [], options);
}
