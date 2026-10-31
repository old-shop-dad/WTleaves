// 通用月历组件：液态玻璃风格，支持受控/非受控月份、选中日期、自定义每天内容
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

interface MonthCalendarProps {
  /** 受控年份（不传则内部管理） */
  year?: number;
  /** 受控月份 0-11（不传则内部管理） */
  month?: number;
  /** 受控月份变化回调 */
  onMonthChange?: (year: number, month: number) => void;
  /** 选中日期 YYYY-MM-DD */
  selectedDate?: string | null;
  /** 点击日期回调 */
  onSelectDate: (date: string) => void;
  /** 自定义每天格子内容（如课程数、收支） */
  renderDay?: (date: string) => React.ReactNode;
  className?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

export default function MonthCalendar({
  year,
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
  renderDay,
  className,
}: MonthCalendarProps) {
  const now = new Date();
  const [innerYear, setInnerYear] = useState(now.getFullYear());
  const [innerMonth, setInnerMonth] = useState(now.getMonth());

  const y = year ?? innerYear;
  const m = month ?? innerMonth;

  const setViewMonth = (ny: number, nm: number) => {
    if (onMonthChange) onMonthChange(ny, nm);
    else {
      setInnerYear(ny);
      setInnerMonth(nm);
    }
  };

  const prev = () => {
    const d = new Date(y, m - 1, 1);
    setViewMonth(d.getFullYear(), d.getMonth());
  };
  const next = () => {
    const d = new Date(y, m + 1, 1);
    setViewMonth(d.getFullYear(), d.getMonth());
  };

  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());

  // 当月第一天星期几（0=周日），转为周一开头的偏移
  const firstDay = new Date(y, m, 1).getDay();
  const leadingBlanks = (firstDay + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevMonthDays = new Date(y, m, 0).getDate();

  // 构建 42 格（6 行 × 7 列）
  const cells: Array<{ date: string; day: number; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const dayNum = i - leadingBlanks + 1;
    if (dayNum < 1) {
      // 上月末尾
      const pd = prevMonthDays + dayNum;
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      cells.push({ date: dateKey(py, pm, pd), day: pd, inMonth: false });
    } else if (dayNum > daysInMonth) {
      // 下月开头
      const nd = dayNum - daysInMonth;
      const nm = m === 11 ? 0 : m + 1;
      const ny = m === 11 ? y + 1 : y;
      cells.push({ date: dateKey(ny, nm, nd), day: nd, inMonth: false });
    } else {
      cells.push({ date: dateKey(y, m, dayNum), day: dayNum, inMonth: true });
    }
  }

  return (
    <div className={cn('rounded-3xl border border-white/50 bg-white/45 p-4 shadow-[0_8px_24px_-12px_rgba(30,60,70,0.25)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]', className)}>
      {/* 月份切换 */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={prev}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[15px] font-semibold text-foreground">
          {y} 年 {m + 1} 月
        </span>
        <button
          type="button"
          onClick={next}
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* 星期表头 */}
      <div className="grid grid-cols-7 gap-1">
        {WEEK_LABELS.map((w) => (
          <div key={w} className="py-1 text-center text-[11px] font-medium text-muted-foreground">
            {w}
          </div>
        ))}
      </div>

      {/* 日期格子 */}
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const isSelected = cell.date === selectedDate;
          const isToday = cell.date === todayKey;
          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onSelectDate(cell.date)}
              className={cn(
                'flex min-h-[52px] flex-col items-center justify-start rounded-xl px-1 py-1.5 transition-all',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : isToday
                    ? 'bg-primary/10 ring-1 ring-primary/40'
                    : 'hover:bg-white/60 dark:hover:bg-white/10',
                !cell.inMonth && !isSelected && 'opacity-40',
              )}
            >
              <span
                className={cn(
                  'text-[13px] font-semibold tabular-nums',
                  isSelected ? 'text-primary-foreground' : isToday ? 'text-primary' : 'text-foreground',
                )}
              >
                {cell.day}
              </span>
              {renderDay && (
                <div className={cn('mt-0.5 w-full text-center', isSelected ? 'text-primary-foreground/90' : '')}>
                  {renderDay(cell.date)}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
