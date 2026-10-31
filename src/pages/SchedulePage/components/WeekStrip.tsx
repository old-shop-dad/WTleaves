// 周次快捷条：1..N 周胶囊，当前周标记，选中周高亮
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface WeekStripProps {
  totalWeeks: number;
  currentWeek: number | null;
  selectedWeek: number;
  onSelect: (week: number) => void;
}

export default function WeekStrip({ totalWeeks, currentWeek, selectedWeek, onSelect }: WeekStripProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [selectedWeek]);

  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">周次</span>
      <div className="flex flex-1 gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Array.from({ length: totalWeeks }, (_, i) => i + 1).map((week) => {
          const active = week === selectedWeek;
          const isCurrent = week === currentWeek;
          return (
            <button
              key={week}
              ref={active ? activeRef : undefined}
              type="button"
              onClick={() => onSelect(week)}
              aria-pressed={active}
              className={cn(
                'relative h-8 min-w-9 shrink-0 rounded-full px-2 text-xs font-medium tabular-nums transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              title={isCurrent ? `第 ${week} 周（本周）` : `第 ${week} 周`}
            >
              {week}
              {isCurrent && (
                <span
                  className={cn(
                    'absolute left-1/2 top-0.5 h-1 w-1 -translate-x-1/2 rounded-full',
                    active ? 'bg-primary-foreground' : 'bg-primary',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
