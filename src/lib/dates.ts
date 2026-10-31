// 日期工具：周几、日期键、分钟换算（纯函数，无副作用）
import { format } from 'date-fns';

// EXPORTS: WEEKDAY_NAMES, weekdayOf, toDateKey, minutesToClock, clockToMinutes, addDaysKey, diffDays

export const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function weekdayOf(d: Date): number {
  return d.getDay();
}

export function toDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

/** 把一天内的分钟数格式化为 "HH:mm"，如 510 -> "08:30" */
export function minutesToClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 把 "HH:mm" 解析为当天分钟数 */
export function clockToMinutes(clock: string): number {
  const [h, m] = clock.split(':').map((n) => Number(n) || 0);
  return h * 60 + m;
}

/** 返回 yyyy-MM-dd 相对偏移的日期键（offset 为天数） */
export function addDaysKey(base: Date, offset: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offset);
  return toDateKey(d);
}

/** 两个日期键相差的天数（b - a） */
export function diffDays(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00`).getTime();
  const tb = new Date(`${b}T00:00:00`).getTime();
  return Math.round((tb - ta) / 86400000);
}

/** 统一时长展示：分钟数 -> "Xh Ym"（0m / 90m / 1h / 1h 10m） */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  if (rest === 0) return `${h}h`;
  return `${h}h ${rest}m`;
}
