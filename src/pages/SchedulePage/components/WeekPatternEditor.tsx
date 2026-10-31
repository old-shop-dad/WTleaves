// 周次选择器：1..N 周点选 + 全选/清空/单周/双周，实时显示格式化文案
import { cn } from '@/lib/utils';
import { formatWeekPattern } from '@/lib/semester';
import { weeksToPattern } from './weekPattern';

interface WeekPatternEditorProps {
  totalWeeks: number;
  value: number[];
  onChange: (weeks: number[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function WeekPatternEditor({
  totalWeeks,
  value,
  onChange,
  disabled,
  compact,
}: WeekPatternEditorProps) {
  const total = Math.max(1, Math.min(60, Math.round(totalWeeks || 20)));
  const selected = new Set(value);
  const pattern = weeksToPattern(value, total);
  const summary = value.length === 0 ? '未选择周次' : formatWeekPattern(pattern, total);

  const toggle = (week: number) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(week)) next.delete(week);
    else next.add(week);
    onChange([...next].sort((a, b) => a - b));
  };

  const setRange = (kind: 'all' | 'none' | 'odd' | 'even') => {
    if (disabled) return;
    if (kind === 'none') return onChange([]);
    const next: number[] = [];
    for (let w = 1; w <= total; w++) {
      if (kind === 'all' || (kind === 'odd' ? w % 2 === 1 : w % 2 === 0)) next.push(w);
    }
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn('text-xs', value.length === 0 ? 'text-destructive' : 'text-muted-foreground')}>
          {summary} · 共 {value.length} 周
        </span>
        <div className="flex flex-wrap gap-1">
          {([
            ['all', '全选'],
            ['odd', '单周'],
            ['even', '双周'],
            ['none', '清空'],
          ] as const).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              disabled={disabled}
              onClick={() => setRange(kind)}
              className="rounded-md border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className={cn('grid gap-1', compact ? 'grid-cols-8' : 'grid-cols-10')}>
        {Array.from({ length: total }, (_, i) => i + 1).map((week) => {
          const active = selected.has(week);
          return (
            <button
              key={week}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => toggle(week)}
              className={cn(
                'h-7 rounded-md text-[11px] font-medium tabular-nums transition-colors disabled:opacity-50',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {week}
            </button>
          );
        })}
      </div>
    </div>
  );
}
