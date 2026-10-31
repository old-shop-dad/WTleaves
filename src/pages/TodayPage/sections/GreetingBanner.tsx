// 今日页顶部：问候横幅（玻璃卡 + 青渐变）+ 统计（搜索框已移除）
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Settings2 } from 'lucide-react';
import StatChip from '@/components/glass/StatChip';
import { WEEKDAY_NAMES, formatDuration } from '@/lib/dates';
import type { TodayStats } from '@/db/aggregate/today';

interface GreetingBannerProps {
  today: Date;
  courseCount: number;
  ddlCount: number;
  stats: TodayStats;
}

function greetingOf(hour: number): string {
  if (hour >= 5 && hour < 11) return '早上好';
  if (hour >= 11 && hour < 14) return '中午好';
  if (hour >= 14 && hour < 18) return '下午好';
  if (hour >= 18 && hour < 23) return '晚上好';
  return '夜深了';
}

/** CSS 圆环完成度概览（无新依赖） */
function CompletionRing({ done, total, extraLabel }: { done: number; total: number; extraLabel: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const ring = total > 0 ? `${pct * 3.6}deg` : '0deg';
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(rgba(255,255,255,0.95) ${ring}, rgba(255,255,255,0.25) 0deg)`,
        }}
        title={extraLabel}
      >
        <div className="flex h-[46px] w-[46px] flex-col items-center justify-center rounded-full bg-[#4B8B99]/90">
          <span className="text-sm font-bold leading-none text-white">{total > 0 ? `${pct}%` : '—'}</span>
          <span className="mt-0.5 text-[9px] leading-none text-white/75">今日完成度</span>
        </div>
      </div>
    </div>
  );
}

export default function GreetingBanner({ today, courseCount, ddlCount, stats }: GreetingBannerProps) {
  const navigate = useNavigate();
  // 实时时钟：每分钟更新，确保问候语随时间段变化（修复：一直显示早上好）
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const greeting = greetingOf(now.getHours());

  return (
    <div className="mb-6">
      <div className="mb-4 flex items-center justify-end">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          title="设置"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/60 bg-white/50 text-muted-foreground backdrop-blur-xl transition-colors hover:text-foreground dark:border-white/10 dark:bg-white/[0.06]"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5B9AA8] to-[#3E7E8C] p-5 text-white shadow-[0_16px_40px_-16px_rgba(62,126,140,0.6)] sm:p-6 dark:from-[#4E8B99] dark:to-[#3E7E8C]">
        <div className="pointer-events-none absolute -top-16 -right-10 h-52 w-52 rounded-full bg-white/15 blur-2xl" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="min-w-[200px]">
            <h1 className="text-2xl font-bold tracking-tight">
              {greeting}，今天是 {format(today, 'M月d日')} {WEEKDAY_NAMES[today.getDay()]}
            </h1>
            <p className="mt-1 text-sm text-white/85">
              今日有 {courseCount} 节课 · {ddlCount} 个截止任务
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {/* 完成度概览环：今日已完成 /（今日截止任务 + 今日打卡） */}
            <CompletionRing
              done={stats.doneCount}
              total={ddlCount + stats.habitTotal}
              extraLabel={`${stats.doneCount}/${ddlCount + stats.habitTotal} 今日完成`}
            />
            <div className="flex gap-2.5">
              <StatChip label="专注" value={formatDuration(stats.focusMin)} />
              <StatChip label="完成" value={String(stats.doneCount)} unit="项" />
              <StatChip
                label="打卡"
                value={`${stats.habitDone}/${stats.habitTotal}`}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
