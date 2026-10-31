// 任务页：列表 / 看板切换，类型筛选，子任务管理
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import GlassCard from '@/components/glass/GlassCard';
import EmptyState from '@/components/glass/EmptyState';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { assignmentRepo, subtaskRepo } from '@/db/repositories/assignments';
import { seedIfEmpty } from '@/data/seed';
import { toDateKey } from '@/lib/dates';
import { cn } from '@/lib/utils';
import TaskFormDialog from './TaskFormDialog';
import TaskCard from './TaskCard';
import TaskBoard from './TaskBoard';
import { TYPE_OPTIONS } from './task-meta';
import { ListTodo } from 'lucide-react';
import type { AssignmentStatus, AssignmentType, IAssignment, ISubtask } from '@/db/types';

interface TasksSnapshot {
  assignments: IAssignment[];
  subtasks: ISubtask[];
  now: number;
}

export default function TasksPage() {
  const [snapshot, setSnapshot] = useState<TasksSnapshot | null>(null);
  const [typeFilter, setTypeFilter] = useState<AssignmentType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AssignmentStatus | 'all'>('all');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IAssignment | null>(null);
  const [deleting, setDeleting] = useState<IAssignment | null>(null);
  const [showDone, setShowDone] = useState(false);

  const fetchData = useCallback(async (): Promise<TasksSnapshot> => {
    await seedIfEmpty();
    const [assignments, subtasks] = await Promise.all([assignmentRepo.list(), subtaskRepo.list()]);
    return { assignments, subtasks, now: Date.now() };
  }, []);

  const reload = useCallback(() => {
    fetchData()
      .then(setSnapshot)
      .catch(() => {});
  }, [fetchData]);

  useEffect(() => {
    reload();
  }, [reload]);

  const subtasksOf = useCallback(
    (a: IAssignment) => snapshot?.subtasks.filter((s) => s.assignmentId === a.id) ?? [],
    [snapshot],
  );

  const toggleStatus = useCallback(
    async (a: IAssignment) => {
      // K3：列表勾选循环 todo -> doing -> done -> todo，doing 可直接恢复
      const next: AssignmentStatus = a.status === 'todo' ? 'doing' : a.status === 'doing' ? 'done' : 'todo';
      // T3：进入 done 写 completedAt；离开 done 清空 completedAt
      const patch: Partial<IAssignment> = { status: next };
      if (next === 'done') patch.completedAt = Date.now();
      else patch.completedAt = undefined;
      await assignmentRepo.update(a.id as number, patch);
      reload();
    },
    [reload],
  );

  const moveStatus = useCallback(
    async (id: number, status: AssignmentStatus) => {
      const patch: Partial<IAssignment> = { status };
      if (status === 'done') patch.completedAt = Date.now();
      else patch.completedAt = undefined;
      await assignmentRepo.update(id, patch);
      reload();
    },
    [reload],
  );

  const addSubtask = useCallback(
    async (a: IAssignment, title: string) => {
      const existing = subtasksOf(a);
      // K6：sortOrder 用 max+1，删除子任务后不会重复
      const maxOrder = existing.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), -1);
      await subtaskRepo.create({
        assignmentId: a.id as number,
        title,
        done: false,
        sortOrder: maxOrder + 1,
      });
      reload();
    },
    [reload, subtasksOf],
  );

  const toggleSubtask = useCallback(
    async (s: ISubtask) => {
      await subtaskRepo.update(s.id as number, { done: !s.done });
      reload();
    },
    [reload],
  );

  const deleteSubtask = useCallback(
    async (s: ISubtask) => {
      await subtaskRepo.softDelete(s.id as number);
      reload();
    },
    [reload],
  );

  const confirmDelete = useCallback(async () => {
    if (deleting?.id != null) {
      // K4：级联软删子任务
      await assignmentRepo.deleteWithSubtasks(deleting.id);
      toast.success('任务已删除');
      setDeleting(null);
      reload();
    }
  }, [deleting, reload]);

  const filtered = useMemo(() => {
    const list = snapshot?.assignments ?? [];
    return list
      .filter((a) => (typeFilter === 'all' ? true : a.type === typeFilter))
      .filter((a) => (statusFilter === 'all' ? true : a.status === statusFilter));
  }, [snapshot, typeFilter, statusFilter]);

  const groups = useMemo(() => {
    const order: AssignmentStatus[] = ['todo', 'doing', 'done'];
    // K2：dueAt 可能为 undefined（无截止日期），排最后
    const byDue = (a: IAssignment, b: IAssignment) => (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY);
    return order.map((st) => ({
      status: st,
      items: filtered.filter((a) => a.status === st).sort(byDue),
    }));
  }, [filtered]);

  const openCount = useMemo(
    () => (snapshot?.assignments ?? []).filter((a) => a.status !== 'done').length,
    [snapshot],
  );

  // 阶段二：列表视图按 DDL 紧急度分档（逾期 / 今天 / 近3天 / 更远，已完成折叠）
  const ddlGroups = useMemo(() => {
    const list = filtered;
    const notDone = list.filter((a) => a.status !== 'done');
    const done = list.filter((a) => a.status === 'done');
    const byDue = (a: IAssignment, b: IAssignment) => (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY);
    const now = snapshot?.now ?? Date.now();
    const nowKey = toDateKey(new Date(now));
    const soonCut = now + 3 * 86400000;
    const overdue = notDone.filter((a) => a.dueAt != null && a.dueAt < now);
    const today = notDone.filter((a) => a.dueAt != null && a.dueAt >= now && toDateKey(new Date(a.dueAt)) === nowKey);
    const soon = notDone.filter(
      (a) => a.dueAt != null && a.dueAt > now && a.dueAt <= soonCut && toDateKey(new Date(a.dueAt)) !== nowKey,
    );
    const later = notDone.filter((a) => a.dueAt == null || a.dueAt > soonCut);
    return [
      { key: 'overdue', label: '已逾期', tint: 'text-danger', items: overdue.sort(byDue) },
      { key: 'today', label: '今天截止', tint: 'text-warning', items: today.sort(byDue) },
      { key: 'soon', label: '近 3 天', tint: 'text-foreground', items: soon.sort(byDue) },
      { key: 'later', label: '更远 / 无期限', tint: 'text-muted-foreground', items: later.sort(byDue) },
      {
        key: 'done', label: '已完成', tint: 'text-muted-foreground', collapsible: true,
        items: done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
      },
    ];
  }, [filtered, snapshot]);

  if (!snapshot) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载任务…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">任务</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {snapshot.assignments.length} 个任务 · {openCount} 个未完成
          </p>
        </div>
        <Button
          className="ml-auto"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> 添加任务
        </Button>
      </div>

      {/* 视图与筛选 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'board')}>
          <TabsList>
            <TabsTrigger value="list">列表</TabsTrigger>
            <TabsTrigger value="board">看板</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>全部</FilterChip>
          {TYPE_OPTIONS.map((t) => (
            <FilterChip key={t.value} active={typeFilter === t.value} onClick={() => setTypeFilter(t.value)}>
              {t.label}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>全部状态</FilterChip>
          <FilterChip active={statusFilter === 'todo'} onClick={() => setStatusFilter('todo')}>待办</FilterChip>
          <FilterChip active={statusFilter === 'doing'} onClick={() => setStatusFilter('doing')}>进行中</FilterChip>
          <FilterChip active={statusFilter === 'done'} onClick={() => setStatusFilter('done')}>已完成</FilterChip>
        </div>
      </div>

      {filtered.length === 0 ? (
        <GlassCard>
          <EmptyState
            title="没有符合条件的任务"
            description="调整筛选条件，或添加一个新任务"
            icon={<ListTodo className="h-6 w-6" />}
            actionLabel="添加任务"
            onAction={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          />
        </GlassCard>
      ) : view === 'board' ? (
        <TaskBoard
          assignments={filtered}
          subtasks={snapshot.subtasks}
          now={snapshot.now}
          onMove={(id, status) => void moveStatus(id, status)}
          onEdit={(a) => {
            setEditing(a);
            setFormOpen(true);
          }}
        />
      ) : (
        <div className="space-y-6">
          {ddlGroups.map((g) => {
            if (g.items.length === 0) return null;
            const hidden = g.collapsible && !showDone;
            return (
              <div key={g.key}>
                <button
                  type="button"
                  className="mb-2 flex w-full items-center gap-2 text-left"
                  onClick={() => g.collapsible && setShowDone((v) => !v)}
                >
                  <h2 className={`text-[13px] font-semibold ${g.tint}`}>
                    {g.label} · {g.items.length}
                  </h2>
                  {g.collapsible ? (
                    <span className="text-[11px] text-muted-foreground">{showDone ? '收起 ▲' : '展开 ▼'}</span>
                  ) : null}
                </button>
                {hidden ? null : (
                  <div className="space-y-2.5">
                    {g.items.map((a) => (
                      <TaskCard
                        key={a.id}
                        assignment={a}
                        subtasks={subtasksOf(a)}
                        now={snapshot.now}
                        onToggle={(x) => void toggleStatus(x)}
                        onEdit={(x) => {
                          setEditing(x);
                          setFormOpen(true);
                        }}
                        onDelete={(x) => setDeleting(x)}
                        onAddSubtask={(x, title) => void addSubtask(x, title)}
                        onToggleSubtask={(s) => void toggleSubtask(s)}
                        onDeleteSubtask={(s) => void deleteSubtask(s)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <TaskFormDialog
        key={editing?.id ?? 'new'}
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        onSaved={reload}
      />

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除任务</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{deleting?.title}」吗？关联子任务将一并保留但不可访问。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-[0_4px_12px_-6px_rgba(62,126,140,0.5)]'
          : 'border-white/60 bg-white/40 text-muted-foreground hover:text-foreground dark:border-white/10 dark:bg-white/[0.06]',
      )}
    >
      {children}
    </button>
  );
}
