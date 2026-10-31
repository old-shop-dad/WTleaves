// 今日页金刚位：圆形浅青快捷操作（只渲染 V1 已上线动作）
import { useNavigate } from 'react-router-dom';
import { CalendarPlus, ListPlus, NotebookPen, Search } from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';

interface QuickActionsProps {
  onSearch?: () => void;
}

const ACTIONS = [
  { key: 'note', label: '记笔记', icon: NotebookPen, to: '/notes' },
  { key: 'task', label: '加任务', icon: ListPlus, to: '/tasks' },
  { key: 'course', label: '加课程', icon: CalendarPlus, to: '/schedule' },
] as const;

export default function QuickActions({ onSearch }: QuickActionsProps) {
  const navigate = useNavigate();
  return (
    <GlassCard className="mb-6 px-4 py-3">
      <div className="flex items-center justify-around sm:justify-start sm:gap-8">
        {ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => navigate(a.to)}
              className="group flex flex-col items-center gap-1.5"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/70 text-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-transform group-hover:scale-105 dark:bg-accent/40">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-xs text-foreground">{a.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={onSearch}
          className="group flex flex-col items-center gap-1.5"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/70 text-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-transform group-hover:scale-105 dark:bg-accent/40">
            <Search className="h-5 w-5" />
          </span>
          <span className="text-xs text-foreground">找入口</span>
        </button>
      </div>
    </GlassCard>
  );
}
