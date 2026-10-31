// 今日页 · 习惯打卡摘要：今日完成 x/y + 习惯格子（跳转 /habits）
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';
import { colorWithAlpha } from '@/lib/color';
import type { TodayHabit } from '@/db/aggregate/today';

interface HabitsSectionProps {
  habits: TodayHabit[];
  done: number;
  total: number;
}

export default function HabitsSection({ habits, done, total }: HabitsSectionProps) {
  const navigate = useNavigate();

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">习惯打卡</h2>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs tabular-nums text-primary">
          {done}/{total}
        </span>
        <button
          type="button"
          onClick={() => navigate('/habits')}
          className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          查看 <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      {total === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">还没有习惯，去添加一个吧</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {habits.slice(0, 6).map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => navigate('/habits')}
              className="flex flex-col items-center gap-1.5 rounded-xl py-2.5 transition-colors hover:bg-white/40 dark:hover:bg-white/[0.06]"
            >
              <span
                className="flex h-9 w-9 items-center justify-center rounded-xl text-lg"
                style={{ backgroundColor: h.done ? (h.color ?? '#4A90D9') : colorWithAlpha(h.color, '22') }}
              >
                {h.icon ?? '✅'}
              </span>
              <span className={`max-w-full truncate text-[11px] ${h.done ? 'text-foreground' : 'text-muted-foreground'}`}>
                {h.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
