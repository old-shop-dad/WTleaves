// 今日 DDL 分区：橙/红标签 + 任务名 + 勾选钮
import { useNavigate } from 'react-router-dom';
import { Check, ListChecks } from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';
import SectionHeader from '@/components/glass/SectionHeader';
import EmptyState from '@/components/glass/EmptyState';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { TodayDdl } from '@/db/aggregate/today';

interface DdlSectionProps {
  ddl: TodayDdl[];
  onToggle: (assignmentId: number) => void;
}

export default function DdlSection({ ddl, onToggle }: DdlSectionProps) {
  const navigate = useNavigate();
  return (
    <GlassCard className="p-4">
      <SectionHeader title="今日 DDL" onMore={() => navigate('/tasks')} />
      {ddl.length === 0 ? (
        <EmptyState
          title="没有待办截止"
          description="任务与截止日期都在掌控中"
          icon={<ListChecks className="h-6 w-6" />}
          actionLabel="去任务"
          onAction={() => navigate('/tasks')}
        />
      ) : (
        <ul className="space-y-1.5">
          {ddl.map((d) => {
            const overdue = d.overdueDays > 0;
            return (
              <li key={d.assignmentId} className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/50 dark:hover:bg-white/10">
                <button
                  type="button"
                  onClick={() => onToggle(d.assignmentId)}
                  title="标记完成"
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                    overdue
                      ? 'border-danger text-danger hover:bg-danger/10'
                      : 'border-warning text-warning hover:bg-warning/10',
                  )}
                >
                  <Check className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{d.title}</span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    overdue
                      ? 'bg-danger/12 text-danger'
                      : 'bg-warning/12 text-warning',
                  )}
                >
                  {overdue ? `已逾期 ${d.overdueDays} 天` : `今天 ${format(new Date(d.dueAt), 'HH:mm')}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
