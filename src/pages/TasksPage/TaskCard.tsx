// 任务卡片：勾选完成、类型/优先级标识、截止状态、展开子任务（board 模式仅展示 + 点击编辑）
import { useState } from 'react';
import { format } from 'date-fns';
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { diffDays, toDateKey } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { TYPE_LABEL, PRIORITY_LABEL } from './task-meta';
import type { IAssignment, ISubtask } from '@/db/types';

interface TaskCardProps {
  assignment: IAssignment;
  subtasks: ISubtask[];
  now: number; // 数据快照时刻（逾期判定基准，由父组件在取数时确定）
  onToggle?: (a: IAssignment) => void;
  onEdit?: (a: IAssignment) => void;
  onDelete?: (a: IAssignment) => void;
  onAddSubtask?: (a: IAssignment, title: string) => void;
  onToggleSubtask?: (s: ISubtask) => void;
  onDeleteSubtask?: (s: ISubtask) => void;
  board?: boolean;
}

const PRIORITY_DOT: Record<IAssignment['priority'], string> = {
  high: 'bg-danger',
  medium: 'bg-warning',
  low: 'bg-muted-foreground',
};

export default function TaskCard({
  assignment, subtasks, now, onToggle, onEdit, onDelete,
  onAddSubtask, onToggleSubtask, onDeleteSubtask, board,
}: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [subtitle, setSubtitle] = useState('');
  const done = assignment.status === 'done';
  const dueAt = assignment.dueAt;
  const overdue = !done && dueAt != null && dueAt < now;
  const dueToday = !done && !overdue && dueAt != null && toDateKey(new Date(dueAt)) === toDateKey(new Date(now));

  const addSubtask = () => {
    if (!subtitle.trim()) return;
    onAddSubtask?.(assignment, subtitle.trim());
    setSubtitle('');
  };

  return (
    <div
      className={cn(
        'rounded-2xl border border-white/60 bg-white/55 p-3 shadow-[0_4px_14px_-10px_rgba(30,60,70,0.35)] backdrop-blur-xl transition-colors dark:border-white/10 dark:bg-white/[0.06]',
        done && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2.5">
        {!board ? (
          <button
            type="button"
            onClick={() => onToggle?.(assignment)}
            className={cn(
              'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
              done
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/40 text-transparent hover:border-primary hover:text-primary/40',
            )}
            title={done ? '标记未完成' : '标记完成'}
          >
            <Check className="h-3 w-3" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <button type="button" onClick={() => onEdit?.(assignment)} className="block w-full text-left">
            <p className={cn('truncate text-sm font-medium text-foreground', done && 'line-through')}>
              {assignment.title}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className={cn('rounded-full px-1.5 py-px font-medium', done ? 'bg-muted text-muted-foreground' : 'bg-accent/70 text-accent-foreground')}>
                {TYPE_LABEL[assignment.type]}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <span className={cn('h-1.5 w-1.5 rounded-full', PRIORITY_DOT[assignment.priority])} />
                {PRIORITY_LABEL[assignment.priority]}
              </span>
              <span
                className={cn(
                  'tabular-nums',
                  overdue ? 'font-medium text-danger' : dueToday ? 'font-medium text-warning' : 'text-muted-foreground',
                )}
              >
                {overdue
                  ? `已逾期 ${diffDays(toDateKey(new Date(dueAt as number)), toDateKey(new Date(now)))} 天`
                  : dueAt != null
                    ? `截止 ${format(new Date(dueAt), 'M月d日 HH:mm')}`
                    : '无截止日期'}
              </span>
            </p>
          </button>
          {!board ? (
            <div className="mt-2 flex items-center gap-1">
              {subtasks.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mr-1 flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10"
                  title={expanded ? '收起子任务' : '展开子任务'}
                >
                  <span className="flex h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted/70">
                    <span
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${subtasks.length ? Math.round((subtasks.filter((s) => s.done).length / subtasks.length) * 100) : 0}%` }}
                    />
                  </span>
                  <span className="tabular-nums">
                    {subtasks.filter((s) => s.done).length}/{subtasks.length}
                  </span>
                  {subtasks.every((s) => s.done) ? (
                    <span className="text-primary">全部完成 ✓</span>
                  ) : null}
                  {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10"
                >
                  {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  子任务 {subtasks.length}
                </button>
              )}
              <button
                type="button"
                onClick={() => onEdit?.(assignment)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10"
                title="编辑"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete?.(assignment)}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger"
                title="删除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {!board && expanded ? (
        <div className="mt-2 space-y-1.5 border-t border-white/40 pt-2 dark:border-white/10">
          {subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/50 dark:hover:bg-white/10">
              <button
                type="button"
                onClick={() => onToggleSubtask?.(s)}
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                  s.done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 text-transparent',
                )}
                title={s.done ? '取消完成' : '完成'}
              >
                <Check className="h-2.5 w-2.5" />
              </button>
              <span className={cn('min-w-0 flex-1 truncate text-xs text-foreground', s.done && 'line-through opacity-60')}>
                {s.title}
              </span>
              <button
                type="button"
                onClick={() => onDeleteSubtask?.(s)}
                className="rounded p-0.5 text-muted-foreground hover:text-danger"
                title="删除子任务"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-1.5 pt-1">
            <Input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
              placeholder="添加子任务…"
              className="h-8 text-xs"
            />
            <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={addSubtask}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
