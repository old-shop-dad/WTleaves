// 专注页：番茄钟计时 + 关联任务快速增删 + 今日/本周统计 + 历史记录
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Pause, Play, Plus, RotateCcw, Square, Timer, Trophy, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import GlassCard from '@/components/glass/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { focusRepo } from '@/db/repositories/lifestyle';
import { assignmentRepo } from '@/db/repositories/assignments';
import { seedIfEmpty } from '@/data/seed';
import { toDateKey } from '@/lib/dates';
import { cn } from '@/lib/utils';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { IFocusSession } from '@/db/types';

const MODES = [
  { id: 25, label: '25 分钟', seconds: 25 * 60 },
  { id: 50, label: '50 分钟', seconds: 50 * 60 },
];

// F4：中断恢复（localStorage，无需改库）
const RESUME_KEY = 'studydesk:focus-resume';

interface FocusResumePayload {
  remaining: number;
  taskId: string;
  mode: number;
}

interface FocusSnapshot {
  sessions: IFocusSession[];
}

interface TaskItem {
  id: number;
  title: string;
  focusCount: number;
}

export default function FocusPage() {
  const [snapshot, setSnapshot] = useState<FocusSnapshot | null>(null);
  const [mode, setMode] = useState(25);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState('');
  const [taskId, setTaskIdRaw] = useState<string>('none');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const startedAtRef = useRef<number>(0);
  // F3：暂停时已累计的毫秒数，恢复时把 startedAt 前移，保证总时长连续
  const elapsedRef = useRef<number>(0);
  // 剩余秒数的 ref，供暂停/提前结束等事件回调读取最新值（不依赖闭包）
  const remainingRef = useRef<number>(25 * 60);
  // F4：检测到上次未完成会话并以暂停态恢复时提示
  const [resumedHint, setResumedHint] = useState(false);
  // 防重入：倒计时完成保存只触发一次（StrictMode 下 effect 会重跑）
  const isCompletingRef = useRef(false);

  // F4：把当前会话快照写入 localStorage（未完成时可跨路由/卸载恢复）
  const persistResume = useCallback(
    (rem: number) => {
      try {
        const payload: FocusResumePayload = { remaining: rem, taskId, mode };
        localStorage.setItem(RESUME_KEY, JSON.stringify(payload));
      } catch {
        /* 隐私模式下写不进去可忽略 */
      }
    },
    [taskId, mode],
  );

  const clearResume = useCallback(() => {
    try {
      localStorage.removeItem(RESUME_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // F4：挂载时检查未完成会话，恢复为暂停态
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESUME_KEY);
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<FocusResumePayload>;
      if (p && p.remaining != null && p.remaining > 0 && p.mode) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMode(p.mode);
        setRemaining(p.remaining);
        remainingRef.current = p.remaining;
        setTaskIdRaw(p.taskId ?? 'none');
        setRunning(false);
        startedAtRef.current = 0;
        elapsedRef.current = 0;
        setResumedHint(true);
      } else {
        clearResume();
      }
    } catch {
      clearResume();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 包装 setTaskId：选中 __new 时弹 prompt 新建任务
  const setTaskId = useCallback((v: string) => {
    if (v === '__new') {
      const title = window.prompt('输入新任务标题：');
      if (!title || !title.trim()) { setTaskIdRaw('none'); return; }
      void (async () => {
        try {
          const now = Date.now();
          const created = await assignmentRepo.create({
            title: title.trim(),
            type: 'homework',
            dueAt: now + 86400000,
            status: 'todo',
            priority: 'medium',
            note: '',
          });
          if (created.id) setTaskIdRaw(String(created.id));
          toast.success(`已创建任务「${title.trim()}」`);
          // 刷新任务列表
          try {
            const [list, sessions] = await Promise.all([
              assignmentRepo.list(),
              focusRepo.list(),
            ]);
            const countMap = new Map<number, number>();
            for (const s of sessions) {
              if (s.taskId) countMap.set(s.taskId, (countMap.get(s.taskId) ?? 0) + 1);
            }
            setTasks(
              list.filter((a) => !a.deletedAt).map((a) => ({
                id: a.id as number,
                title: a.title,
                focusCount: countMap.get(a.id as number) ?? 0,
              })),
            );
          } catch { /* */ }
        } catch (e) {
          toast.error(`创建失败：${(e as Error).message}`);
          setTaskIdRaw('none');
        }
      })();
      return;
    }
    setTaskIdRaw(v);
  }, []);

  const fetchData = useCallback(async (): Promise<FocusSnapshot> => {
    await seedIfEmpty();
    const sessions = await focusRepo.list();
    return { sessions };
  }, []);

  const reload = useCallback(() => {
    fetchData()
      .then(setSnapshot)
      .catch(() => {});
  }, [fetchData]);

  // 加载任务列表 + 每个任务的专注次数
  const reloadTasks = useCallback(async () => {
    try {
      const [list, sessions] = await Promise.all([
        assignmentRepo.list(),
        focusRepo.list(),
      ]);
      const countMap = new Map<number, number>();
      for (const s of sessions) {
        if (s.taskId) countMap.set(s.taskId, (countMap.get(s.taskId) ?? 0) + 1);
      }
      setTasks(
        list
          .filter((a) => !a.deletedAt)
          .map((a) => ({
            id: a.id as number,
            title: a.title,
            focusCount: countMap.get(a.id as number) ?? 0,
          })),
      );
    } catch {
      /* 静默 */
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reloadTasks();
  }, [reload, reloadTasks]);

  // F7：运行中切模式会遗留 startedAtRef / 未保存会话，先彻底重置（含清中断恢复）再切
  const switchMode = useCallback(
    (id: number) => {
      setMode(id);
      setRunning(false);
      startedAtRef.current = 0;
      elapsedRef.current = 0;
      setRemaining(id * 60);
      remainingRef.current = id * 60;
      setResumedHint(false);
      clearResume();
    },
    [clearResume],
  );

  const tick = useCallback(() => {
    setRemaining((r) => Math.max(0, r - 1));
  }, []);

  // 用 ref 同步最新 remaining，供事件回调读取；同时每秒持久化中断恢复快照
  useEffect(() => {
    remainingRef.current = remaining;
  }, [remaining]);

  useEffect(() => {
    if (!running) return;
    persistResume(remaining);
  }, [running, remaining, persistResume]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [running, tick]);

  // 完成保存：在 updater 外监听倒计时归零触发，updater 只做纯状态计算
  useEffect(() => {
    if (!running || remaining > 0) return;
    if (isCompletingRef.current) return;
    isCompletingRef.current = true;
    const now = Date.now();
    const started = startedAtRef.current || now - mode * 60 * 1000;
    void focusRepo
      .create({
        kind: 'pomodoro',
        label: label.trim() || '专注',
        taskId: taskId === 'none' ? undefined : Number(taskId),
        startedAt: started,
        endedAt: now,
        durationMin: mode,
      })
      .then(() => {
        toast.success(`专注完成，已记录（共 ${mode} 分钟）`);
        setRunning(false);
        setRemaining(mode * 60);
        remainingRef.current = mode * 60;
        elapsedRef.current = 0;
        startedAtRef.current = 0;
        setResumedHint(false);
        clearResume();
        reload();
        reloadTasks();
      })
      .finally(() => {
        isCompletingRef.current = false;
      });
  }, [running, remaining, mode, label, taskId, reload, reloadTasks, clearResume]);

  const start = useCallback(() => {
    if (running) return;
    // F3：恢复时把起点前移已暂停的时长，而不是从 0 重新计
    startedAtRef.current = Date.now() - elapsedRef.current;
    setRunning(true);
    setResumedHint(false);
  }, [running]);

  // F3：暂停时记下已累计时长，恢复时再拼回
  const pause = useCallback(() => {
    if (startedAtRef.current) {
      elapsedRef.current = Date.now() - startedAtRef.current;
    }
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    startedAtRef.current = 0;
    elapsedRef.current = 0;
    setRemaining(mode * 60);
    remainingRef.current = mode * 60;
    setResumedHint(false);
    clearResume();
  }, [mode, clearResume]);

  // F6：提前结束——按当前已用时长落库一条 focus_session，再重置计时器
  const endEarly = useCallback(async () => {
    const usedSec = Math.max(0, mode * 60 - remainingRef.current);
    const usedMin = Math.max(1, Math.round(usedSec / 60));
    const now = Date.now();
    const started = startedAtRef.current || now - usedSec * 1000;
    setRunning(false);
    startedAtRef.current = 0;
    elapsedRef.current = 0;
    setRemaining(mode * 60);
    remainingRef.current = mode * 60;
    setResumedHint(false);
    clearResume();
    try {
      await focusRepo.create({
        kind: 'pomodoro',
        label: label.trim() || '专注',
        taskId: taskId === 'none' ? undefined : Number(taskId),
        startedAt: started,
        endedAt: now,
        durationMin: usedMin,
      });
      toast.success(`已提前结束，记录 ${usedMin} 分钟`);
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`);
    }
    reload();
    reloadTasks();
  }, [mode, label, taskId, clearResume, reload, reloadTasks]);

  // 删除任务
  const removeTask = useCallback(async (id: number, title: string) => {
    if (!window.confirm(`删除任务「${title}」？其历史专注记录会保留。`)) return;
    try {
      await assignmentRepo.softDelete(id);
      if (taskId === String(id)) setTaskId('none');
      toast.success('已删除');
      reloadTasks();
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`);
    }
  }, [taskId, reloadTasks, setTaskId]);

  const todaySessions = useMemo(() => {
    const dateKey = toDateKey(new Date());
    return (snapshot?.sessions ?? []).filter((s) => toDateKey(new Date(s.startedAt)) === dateKey);
  }, [snapshot]);

  const todayMin = useMemo(
    () => todaySessions.reduce((sum, s) => sum + (s.durationMin || 0), 0),
    [todaySessions],
  );

  const weekMin = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    return (snapshot?.sessions ?? [])
      .filter((s) => s.startedAt >= start.getTime())
      .reduce((sum, s) => sum + (s.durationMin || 0), 0);
  }, [snapshot]);

  const totalMin = useMemo(
    () => (snapshot?.sessions ?? []).reduce((sum, s) => sum + (s.durationMin || 0), 0),
    [snapshot],
  );

  // 阶段三：近 14 天每日专注时长趋势（Recharts）
  const trend = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const s of snapshot?.sessions ?? []) {
      const k = toDateKey(new Date(s.startedAt));
      byDay.set(k, (byDay.get(k) ?? 0) + (s.durationMin || 0));
    }
    const out: Array<{ label: string; minutes: number }> = [];
    const cur = new Date();
    cur.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(cur);
      d.setDate(d.getDate() - i);
      out.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, minutes: byDay.get(toDateKey(d)) ?? 0 });
    }
    return out;
  }, [snapshot]);

  const progress = useMemo(
    () => Math.min(1, 1 - remaining / (mode * 60)),
    [remaining, mode],
  );

  const mmss = useMemo(() => {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [remaining]);

  const CIRCLE = 2 * Math.PI * 90;

  if (!snapshot) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载专注…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">专注</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          今日 {todaySessions.length} 次 · {Math.floor(todayMin / 60)}h {todayMin % 60}m ·
          本周 {Math.floor(weekMin / 60)}h {weekMin % 60}m ·
          累计 {Math.floor(totalMin / 60)}h {totalMin % 60}m
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* 番茄钟 */}
        <GlassCard className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-primary" />
              <h2 className="text-[15px] font-semibold text-foreground">番茄钟</h2>
            </div>
            <div className="flex gap-1 rounded-full bg-white/40 p-1 dark:bg-white/[0.06]">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={running}
                  onClick={() => switchMode(m.id)}
                  title={running ? '计时进行中，结束后再切换模式' : undefined}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs transition-all',
                    running && 'cursor-not-allowed opacity-50',
                    mode === m.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative mx-auto mt-6 flex h-56 w-56 items-center justify-center">
            <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90">
              <circle cx="110" cy="110" r="90" fill="none" stroke="var(--border)" strokeWidth="10" />
              <circle
                cx="110"
                cy="110"
                r="90"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={CIRCLE}
                strokeDashoffset={CIRCLE * (1 - progress)}
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-5xl font-bold tabular-nums tracking-tight text-foreground">{mmss}</span>
              <span className="mt-1 text-xs text-muted-foreground">{running ? '专注中…' : mode === 25 ? '25 分钟番茄' : '50 分钟深度专注'}</span>
            </div>
          </div>

          {resumedHint && !running && (
            <p className="mt-4 text-center text-xs text-amber-600 dark:text-amber-400">
              上次计时未完成，点击继续
            </p>
          )}

          <div className="mt-6 flex items-center justify-center gap-2">
            {!running ? (
              <Button size="lg" className="gap-2 rounded-full px-8" onClick={start}>
                <Play className="h-4 w-4" /> {resumedHint ? '继续' : '开始专注'}
              </Button>
            ) : (
              <Button size="lg" variant="outline" className="gap-2 rounded-full px-8" onClick={pause}>
                <Pause className="h-4 w-4" /> 暂停
              </Button>
            )}
            {running && (
              <Button size="lg" variant="outline" className="gap-2 rounded-full px-5 text-danger" onClick={() => void endEarly()}>
                <Square className="h-4 w-4" /> 结束
              </Button>
            )}
            <Button variant="outline" size="lg" className="rounded-full px-4" onClick={reset} title="重置">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          <div className="mt-5 space-y-3">
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">本次专注内容</p>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="如：高等数学 第三章"
                className="rounded-xl bg-white/40 dark:bg-white/[0.06]"
              />
            </div>

            {/* 关联任务：选择 + 删除 */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">关联任务（点 X 删除）</p>
              <Select value={taskId} onValueChange={setTaskId}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联任务</SelectItem>
                  {tasks.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      <span className="flex w-full items-center justify-between pr-6">
                        <span className="truncate">{t.title}</span>
                        <span className="ml-3 text-[10px] text-muted-foreground">{t.focusCount} 次</span>
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__new" className="text-primary">
                    <span className="flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5" /> 新增任务…
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {/* 当前选中任务的删除按钮 */}
              {taskId !== 'none' ? (
                <button
                  type="button"
                  onClick={() => {
                    const t = tasks.find((x) => String(x.id) === taskId);
                    if (t) void removeTask(t.id, t.title);
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500"
                >
                  <Trash2 className="h-3 w-3" /> 删除当前关联任务
                </button>
              ) : null}
            </div>
          </div>
        </GlassCard>

        {/* 今日记录 */}
        <div className="space-y-4">
          {/* 近 14 天专注趋势 */}
          <GlassCard className="p-5">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h2 className="text-[15px] font-semibold text-foreground">近 14 天专注趋势</h2>
              <span className="ml-auto text-xs text-muted-foreground">分钟 / 天</span>
            </div>
            <div className="mt-3 h-36 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 4, right: 0, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,130,140,0.15)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} interval={1} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(120,130,140,0.08)' }}
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(120,130,140,0.25)', fontSize: 12 }}
                    formatter={(v) => [`${v} 分钟`, '专注']}
                  />
                  <Bar dataKey="minutes" radius={[4, 4, 0, 0]} fill="var(--primary)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h2 className="text-[15px] font-semibold text-foreground">今日专注记录</h2>
              <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                {todaySessions.length} 次
              </span>
            </div>
            {todaySessions.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">今天还没有专注记录，开始一个番茄吧</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {[...todaySessions].reverse().map((s) => {
                  const linkedTask = tasks.find((t) => t.id === s.taskId);
                  return (
                    <li key={s.id} className="flex items-center gap-3 rounded-xl bg-white/40 px-3 py-2.5 dark:bg-white/[0.06]">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Timer className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {s.label || '专注'}
                        {linkedTask ? (
                          <span className="ml-2 text-xs text-muted-foreground">· {linkedTask.title}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{s.durationMin} 分钟</span>
                      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                        {format(new Date(s.startedAt), 'HH:mm')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassCard>

          {/* 任务专注次数排行 */}
          <GlassCard className="p-5">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h2 className="text-[15px] font-semibold text-foreground">任务专注排行</h2>
              <span className="ml-auto text-xs text-muted-foreground">按累计次数</span>
            </div>
            {tasks.filter((t) => t.focusCount > 0).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">还没有任务被专注过</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {[...tasks]
                  .filter((t) => t.focusCount > 0)
                  .sort((a, b) => b.focusCount - a.focusCount)
                  .map((t) => (
                    <li key={t.id} className="flex items-center gap-3 rounded-xl bg-white/40 px-3 py-2.5 dark:bg-white/[0.06]">
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{t.title}</span>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {t.focusCount} 次
                      </span>
                      <button
                        type="button"
                        onClick={() => void removeTask(t.id, t.title)}
                        className="shrink-0 text-muted-foreground hover:text-red-500"
                        title="删除任务"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
