// 作息表（节次 ↔ 时间）：导入、周视图、分享图共用
// 默认按国内高校常见作息，可在设置页覆盖（settings key: schedule.periods）
// EXPORTS: Period, DEFAULT_PERIODS, PERIODS_SETTING_KEY, normalizePeriods,
//          periodRange, periodAt, formatPeriodRange, snapshotPeriods

export interface Period {
  slot: number;
  startMin: number;
  endMin: number;
}

export const PERIODS_SETTING_KEY = 'schedule.periods';

export const DEFAULT_PERIODS: Period[] = [
  { slot: 1, startMin: 8 * 60, endMin: 8 * 60 + 45 },
  { slot: 2, startMin: 8 * 60 + 55, endMin: 9 * 60 + 40 },
  { slot: 3, startMin: 10 * 60, endMin: 10 * 60 + 45 },
  { slot: 4, startMin: 10 * 60 + 55, endMin: 11 * 60 + 40 },
  { slot: 5, startMin: 14 * 60, endMin: 14 * 60 + 45 },
  { slot: 6, startMin: 14 * 60 + 55, endMin: 15 * 60 + 40 },
  { slot: 7, startMin: 16 * 60, endMin: 16 * 60 + 45 },
  { slot: 8, startMin: 16 * 60 + 55, endMin: 17 * 60 + 40 },
  { slot: 9, startMin: 19 * 60, endMin: 19 * 60 + 45 },
  { slot: 10, startMin: 19 * 60 + 55, endMin: 20 * 60 + 40 },
];

function isMinute(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 24 * 60;
}

/** 校验并排序外部传入的作息表；非法返回 null */
export function normalizePeriods(input: unknown): Period[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const out: Period[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const slot = Math.round(Number(o.slot));
    if (!Number.isFinite(slot) || slot < 1 || slot > 30) continue;
    if (!isMinute(o.startMin) || !isMinute(o.endMin)) continue;
    if (o.endMin <= o.startMin) continue;
    out.push({ slot, startMin: Math.round(o.startMin), endMin: Math.round(o.endMin) });
  }
  if (out.length === 0) return null;
  const seen = new Set<number>();
  return out
    .filter((p) => (seen.has(p.slot) ? false : (seen.add(p.slot), true)))
    .sort((a, b) => a.slot - b.slot);
}

/** 第 slot 节的时间范围（含起止），找不到返回 null */
export function periodRange(periods: Period[], slot: number): { startMin: number; endMin: number } | null {
  const hit = periods.find((p) => p.slot === Math.round(slot));
  return hit ? { startMin: hit.startMin, endMin: hit.endMin } : null;
}

/** 某个分钟时刻落在第几节（用于点击空白格预填 / 无节次课程映射）。超出作息范围返回 null */
export function periodAt(periods: Period[], minute: number): Period | null {
  const m = Math.round(minute);
  let nearest: Period | null = null;
  for (const p of periods) {
    if (m >= p.startMin && m < p.endMin) return p;
    if (m < p.startMin && (!nearest || p.startMin < nearest.startMin)) nearest = p;
  }
  return nearest;
}

/** "1-2节" / "3节" */
export function formatPeriodRange(startSlot: number, endSlot: number): string {
  const a = Math.round(startSlot);
  const b = Math.round(endSlot);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
  return a === b ? `${a}节` : `${Math.min(a, b)}-${Math.max(a, b)}节`;
}

/**
 * 从课程时间反推节次区间：取与课程时间重叠的节次范围。
 * 用于导入预览与分享图展示。
 */
export function snapshotPeriods(periods: Period[]): Period[] {
  return periods.map((p) => ({ ...p }));
}

/** 课程展示时间：优先按节次 + 当前作息换算；无节次课程映射到作息节次（起点对齐最近节次、保持原时长），
 *  超出作息覆盖范围（如晚间自定义课）回退课程绝对时间 */
export function courseTimeOf(
  course: {
    periodStart?: number;
    periodEnd?: number;
    startMin: number;
    endMin: number;
  },
  periods: Period[],
): { startMin: number; endMin: number; startSlot: number | null; endSlot: number | null } {
  const s = Math.round(Number(course.periodStart));
  const e = Math.round(Number(course.periodEnd));
  if (Number.isFinite(s) && Number.isFinite(e)) {
    const from = periodRange(periods, s);
    const to = periodRange(periods, e);
    // 起止节次都能在作息表里找到：按当前作息换算（改作息后自动同步）
    if (from && to) {
      return { startMin: from.startMin, endMin: to.endMin, startSlot: s, endSlot: e };
    }
  }
  // 无节次：映射到当前作息节次（改作息后跟随），仅当起点在作息覆盖范围内
  const p0 = periodAt(periods, course.startMin);
  if (p0 && periods.length > 0) {
    const span = Math.max(1, Math.round(course.endMin - course.startMin));
    return { startMin: p0.startMin, endMin: p0.startMin + span, startSlot: p0.slot, endSlot: null };
  }
  return {
    startMin: course.startMin,
    endMin: course.endMin,
    startSlot: Number.isFinite(s) ? s : null,
    endSlot: Number.isFinite(e) ? e : null,
  };
}
