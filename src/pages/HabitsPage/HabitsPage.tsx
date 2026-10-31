// 习惯打卡页：今日打卡网格 + 本周计数 + 添加/编辑/删除习惯
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import GlassCard from '@/components/glass/GlassCard';
import EmptyState from '@/components/glass/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { habitLogRepo, habitRepo } from '@/db/repositories/lifestyle';
import { seedIfEmpty } from '@/data/seed';
import { toDateKey } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { IHabit } from '@/db/types';

const WEEKDAYS = [
  { key: 1, label: '一' },
  { key: 2, label: '二' },
  { key: 3, label: '三' },
  { key: 4, label: '四' },
  { key: 5, label: '五' },
  { key: 6, label: '六' },
  { key: 7, label: '日' },
];

const ICONS = ['📖', '💧', '🏃', '📚', '🌙', '🧘', '🎯', '✍️', '🥗', '🧹', '🎨', '💪'];
const COLORS = ['#4A90D9', '#5BAE6F', '#F2903D', '#8B74C8', '#4FB3C4', '#E5B93E', '#E0616A', '#6BA75A'];

interface HabitsSnapshot {
  habits: IHabit[];
  logs: Array<{ id?: number; habitId: number; date: string; done: boolean }>;
}

export default function HabitsPage() {
  const [snapshot, setSnapshot] = useState<HabitsSnapshot | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IHabit | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 7]);
  const [deleting, setDeleting] = useState<IHabit | null>(null);
  // 防连点锁：同一习惯同一时刻只允许一次 toggle 在途
  const togglingRef = useRef<Set<number>>(new Set());

  const fetchData = useCallback(async (): Promise<HabitsSnapshot> => {
    await seedIfEmpty();
    const [habits, logs] = await Promise.all([habitRepo.list(), habitLogRepo.list()]);
    return { habits, logs };
  }, []);

  const reload = useCallback(() => {
    fetchData()
      .then(setSnapshot)
      .catch(() => {});
  }, [fetchData]);

  useEffect(() => {
    reload();
  }, [reload]);

  // H6：每分钟 tick 一次，跨午夜后 today / 周口径自动重算（不再固化在挂载时刻）
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClockTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  // H2：内部统一 1-7 口径（1=周一 … 7=周日），表单选择器与打卡判断同口径，与 today.ts 聚合一致
  const today = toDateKey(new Date());
  const todayNum = (() => {
    const d = new Date().getDay();
    return d === 0 ? 7 : d;
  })();

  const doneToday = useMemo(
    () => new Set(snapshot?.logs.filter((l) => l.date === today && l.done).map((l) => l.habitId) ?? []),
    [snapshot, today],
  );

  // H4：自然周（周一 ~ 周日），与 FocusPage 相同的周一为一周起始算法
  const weekKeys = useMemo(() => {
    // 以 today 为基准而不是每次 new Date()，每分钟 tick 触发重渲染时 today 一起刷新
    const start = new Date(`${today}T00:00:00`);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const keys: string[] = [];
    for (let i = 0; i < 7; i++) {
      keys.push(toDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)));
    }
    return keys;
  }, [today]);

  // H3：连续打卡天数——从今天往前数，每天 done:true 则 +1，遇空缺天停止
  const calcStreak = useCallback(
    (habitId: number): number => {
      const logs = snapshot?.logs ?? [];
      const doneDates = new Set(logs.filter((l) => l.habitId === habitId && l.done).map((l) => l.date));
      let streak = 0;
      const cur = new Date();
      cur.setHours(0, 0, 0, 0);
      while (doneDates.has(toDateKey(cur))) {
        streak += 1;
        cur.setDate(cur.getDate() - 1);
      }
      return streak;
    },
    [snapshot],
  );

  const weekCount = useCallback(
    (habitId: number): number => {
      const logs = snapshot?.logs ?? [];
      return weekKeys.filter((k) => logs.some((l) => l.habitId === habitId && l.date === k && l.done)).length;
    },
    [snapshot, weekKeys],
  );

  const toggleHabit = useCallback(
    async (habitId: number) => {
      // 同步连点（同一 JS tick 内多次调用）直接拦截，避免基于旧 snapshot 重复 create
      if (togglingRef.current.has(habitId)) return;
      togglingRef.current.add(habitId);
      try {
        const log = (snapshot?.logs ?? []).find((l) => l.habitId === habitId && l.date === today);
        if (!log) {
          // 今天还没有 log：创建打卡记录
          await habitLogRepo.create({ habitId, date: today, done: true });
        } else if (log.done) {
          // H7：取消打卡直接删除该条 log，而不是改 done:false（避免并发重复记录）
          if (log.id != null) await habitLogRepo.hardDelete(log.id);
        } else {
          if (log.id != null) await habitLogRepo.update(log.id, { done: true });
        }
        reload();
      } finally {
        togglingRef.current.delete(habitId);
      }
    },
    [snapshot, today, reload],
  );

  const openCreate = useCallback(() => {
    setEditing(null);
    setName('');
    setIcon(ICONS[0]);
    setColor(COLORS[0]);
    setDays([1, 2, 3, 4, 5, 6, 7]);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((h: IHabit) => {
    setEditing(h);
    setName(h.name);
    setIcon(h.icon ?? ICONS[0]);
    setColor(h.color ?? COLORS[0]);
    setDays(h.daysOfWeek.length ? h.daysOfWeek : [1, 2, 3, 4, 5, 6, 7]);
    setFormOpen(true);
  }, []);

  const submit = useCallback(async () => {
    if (!name.trim()) {
      toast.error('请填写习惯名称');
      return;
    }
    // H5：daysOfWeek 为空会变成“永不该打卡”的死习惯，阻止提交
    if (days.length === 0) {
      toast.error('请至少选择一天');
      return;
    }
    const payload = { name: name.trim(), icon, color, daysOfWeek: days };
    if (editing?.id != null) {
      await habitRepo.update(editing.id, payload);
      toast.success('习惯已更新');
    } else {
      await habitRepo.create(payload);
      toast.success('习惯已添加');
    }
    setFormOpen(false);
    reload();
  }, [name, icon, color, days, editing, reload]);

  const confirmDelete = useCallback(async () => {
    if (!deleting?.id) return;
    await habitRepo.softDelete(deleting.id);
    toast.success('习惯已删除');
    setDeleting(null);
    reload();
  }, [deleting, reload]);

  if (!snapshot) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载习惯…
      </div>
    );
  }

  const total = snapshot.habits.length;
  const done = snapshot.habits.filter((h) => doneToday.has(h.id as number)).length;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">习惯打卡</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            今日完成 {done}/{total} 个习惯
          </p>
        </div>
        <Button className="ml-auto" onClick={openCreate}>
          <Plus className="h-4 w-4" /> 添加习惯
        </Button>
      </div>

      {total === 0 ? (
        <GlassCard>
          <EmptyState
            title="还没有习惯"
            description="添加每日想坚持的小习惯，逐日打卡"
            icon={<Check className="h-6 w-6" />}
            actionLabel="添加习惯"
            onAction={openCreate}
          />
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.habits.map((h) => {
            const hId = h.id as number;
            const isDone = doneToday.has(hId);
            const dow = h.daysOfWeek?.length ? h.daysOfWeek : [1, 2, 3, 4, 5, 6, 7];
            const isScheduled = dow.includes(todayNum);
            return (
              <GlassCard key={h.id} className="group p-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl"
                    style={{ backgroundColor: `${h.color ?? COLORS[0]}22` }}
                  >
                    {h.icon ?? '✅'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-foreground">{h.name}</p>
                    <p className="text-xs text-muted-foreground">
                      本周完成 {weekCount(hId)} 天 · 连续 {calcStreak(hId)} 天
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEdit(h)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10"
                      title="编辑习惯"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(h)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                      title="删除习惯"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleHabit(hId)}
                  disabled={!isScheduled}
                  title={isScheduled ? undefined : '今天不在该习惯的打卡周期内'}
                  className={cn(cn_toggle(isDone), !isScheduled && 'opacity-50 cursor-not-allowed')}
                >
                  <span
                    className={cn_circle(isDone)}
                    style={isDone ? { backgroundColor: h.color ?? COLORS[0] } : undefined}
                  >
                    {isDone ? <Check className="h-4 w-4 text-white" /> : null}
                  </span>
                  <span className="text-sm">{isDone ? '已完成' : isScheduled ? '点击打卡' : '今日休息'}</span>
                </button>
                {/* 阶段三：近 90 天迷你热力图（自绘，无新依赖） */}
                <div className="mt-3">
                  <MiniHeatmap habitId={hId} logs={snapshot.logs} color={h.color ?? COLORS[0]} />
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {/* 添加 / 编辑习惯 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑习惯' : '添加习惯'}</DialogTitle>
            <DialogDescription>设置习惯名称、图标、颜色与打卡周期</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="habit-name">名称</Label>
              <Input id="habit-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：背单词" />
            </div>
            <div className="space-y-1.5">
              <Label>图标</Label>
              <div className="flex flex-wrap gap-1.5">
                {ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={cn_icon(ic === icon)}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>颜色</Label>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn_color(c === color, c)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>打卡周期</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((w) => {
                  const on = days.includes(w.key);
                  return (
                    <button
                      key={w.key}
                      type="button"
                      onClick={() => setDays((d) => (on ? d.filter((x) => x !== w.key) : [...d, w.key]))}
                      className={cn_week(on)}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>取消</Button>
            <Button onClick={() => void submit()}>{editing ? '保存' : '添加'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除习惯</AlertDialogTitle>
            <AlertDialogDescription>确定删除「{deleting?.name}」吗？历史打卡记录将不再计入统计。</AlertDialogDescription>
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

function cn_toggle(done: boolean): string {
  return cn(
    'mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2 transition-all',
    done
      ? 'bg-primary/15 text-primary'
      : 'border border-dashed border-muted-foreground/30 text-muted-foreground hover:border-primary/50 hover:text-primary',
  );
}

function cn_circle(done: boolean): string {
  return cn(
    'flex h-6 w-6 items-center justify-center rounded-full transition-all',
    done ? 'shadow-sm' : 'border-2 border-muted-foreground/30',
  );
}

function cn_icon(active: boolean): string {
  return cn(
    'flex h-9 w-9 items-center justify-center rounded-xl text-lg transition-all',
    active ? 'bg-primary/15 ring-1 ring-primary/40' : 'bg-white/40 hover:bg-white/60 dark:bg-white/[0.06]',
  );
}

function cn_color(active: boolean, c: string): string {
  return cn(
    'h-8 w-8 rounded-full transition-all',
    active ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground/60' : 'opacity-70 hover:opacity-100',
    c === '#FFFFFF' ? 'border' : '',
  );
}

function cn_week(on: boolean): string {
  return cn(
    'h-9 w-9 rounded-full text-sm transition-all',
    on ? 'bg-primary text-primary-foreground' : 'bg-white/40 text-muted-foreground hover:bg-white/60 dark:bg-white/[0.06]',
  );
}

/** 近 90 天迷你热力图：7 行（周一~周日）x 若干列，按完成日期着色（自绘，无新依赖） */
function MiniHeatmap({
  habitId, logs, color,
}: {
  habitId: number;
  logs: Array<{ habitId: number; date: string; done: boolean }>;
  color: string;
}) {
  const cells = useMemo(() => {
    const doneDates = new Set(logs.filter((l) => l.habitId === habitId && l.done).map((l) => l.date));
    const rows: Array<Array<{ date: string; done: boolean }>> = [[], [], [], [], [], [], []];
    // 从今天往前取 90 天，逐日归入"周日~周六"列（用 getDay() 0=周日）
    const cur = new Date();
    cur.setHours(0, 0, 0, 0);
    for (let i = 0; i < 90; i++) {
      const key = toDateKey(cur);
      rows[cur.getDay()].push({ date: key, done: doneDates.has(key) });
      cur.setDate(cur.getDate() - 1);
    }
    // 每行按日期倒序（最左为最早），保证列对齐
    return rows.map((r) => r.reverse());
  }, [habitId, logs]);

  const maxCols = Math.max(...cells.map((r) => r.length));
  return (
    <div className="flex justify-center gap-1">
      {Array.from({ length: maxCols }).map((_, col) => (
        <div key={col} className="flex flex-col gap-1">
          {cells.map((row, r) => {
            const cell = row[col];
            return (
              <div
                key={r}
                title={cell ? `${cell.date}${cell.done ? ' 已打卡' : ''}` : ''}
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{
                  backgroundColor: cell
                    ? cell.done
                      ? color
                      : 'transparent'
                    : 'transparent',
                  boxShadow: cell?.done ? 'inset 0 0 0 1px rgba(0,0,0,0.08)' : 'inset 0 0 0 1px rgba(120,130,140,0.18)',
                  opacity: cell?.done ? 0.95 : 0.5,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
