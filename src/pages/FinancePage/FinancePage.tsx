// 记账页（V3 · 生活分组）：月度汇总 + 分类饼图 + 近6月柱状图 + 收支录入/列表
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, PieChart as PieIcon, Plus, Trash2, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis,
} from 'recharts';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import GlassCard from '@/components/glass/GlassCard';
import EmptyState from '@/components/glass/EmptyState';
import MonthCalendar from '@/components/MonthCalendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { financeRecordRepo, budgetRepo } from '@/db/repositories/finance';
import { settingsRepo } from '@/db/repositories/settings';
import { seedIfEmpty } from '@/data/seed';
import { categoryById, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type FinanceCategory } from '@/lib/finance-categories';
import { cn } from '@/lib/utils';
import type { IBudget, IFinanceRecord } from '@/db/types';

const MONTHS_CN = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

interface Snapshot {
  records: IFinanceRecord[];
}

function fmtMoney(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}`;
}

function monthKey(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export default function FinancePage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [formOpen, setFormOpen] = useState(false);
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('food');
  const [date, setDate] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  );
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // 同步锁：useState 批处理下同 tick 连点读不到新值，必须用 ref
  const submittingRef = useRef(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // R5：月度总预算（兼容旧 settings 单一总数；分类预算激活后以 budgets 表为准）
  const [budget, setBudget] = useState(0);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  // 阶段三：分类信封预算（budgets 表激活）
  const [catBudgets, setCatBudgets] = useState<Record<string, number>>({});
  const [budgetDraft, setBudgetDraft] = useState<Record<string, string>>({});

  // R5：启动时读取月度预算
  useEffect(() => {
    settingsRepo
      .get<number>('studydesk:monthly-budget', 0)
      .then((v) => setBudget(Number(v) || 0))
      .catch(() => {});
  }, []);

  // 阶段三：加载分类预算（budgets 表）
  const loadCatBudgets = useCallback(async () => {
    try {
      const rows = await budgetRepo.list();
      const map: Record<string, number> = {};
      for (const r of rows) map[r.categoryId] = r.amount;
      setCatBudgets(map);
    } catch {
      setCatBudgets({});
    }
  }, []);

  useEffect(() => {
    void loadCatBudgets();
  }, [loadCatBudgets]);

  const fetchData = useCallback(async (): Promise<Snapshot> => {
    await seedIfEmpty();
    const records = await financeRecordRepo.list();
    return { records };
  }, []);

  const reload = useCallback(() => {
    fetchData()
      .then(setSnapshot)
      .catch(() => {});
  }, [fetchData]);

  useEffect(() => {
    reload();
  }, [reload]);

  const currentKey = useMemo(() => monthKey(year, month), [year, month]);

  const monthRecords = useMemo(
    () => (snapshot?.records ?? []).filter((r) => r.date.startsWith(currentKey)),
    [snapshot, currentKey],
  );

  // R6：选中日期时顶部汇总切换为当日收支，未选中时显示整月
  const stats = useMemo(() => {
    const scope = selectedDate ? monthRecords.filter((r) => r.date === selectedDate) : monthRecords;
    const income = scope.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const expense = scope.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    return { income, expense, balance: income - expense };
  }, [monthRecords, selectedDate]);

  // R5：预算进度条永远对照整月支出，不受单日选中影响
  const monthExpense = useMemo(
    () => monthRecords.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0),
    [monthRecords],
  );

  // 阶段三：分类预算汇总（budgets 表优先，兼容旧 settings 总数）
  const totalCatBudget = useMemo(
    () => Object.values(catBudgets).reduce((s, v) => s + (v || 0), 0),
    [catBudgets],
  );
  const activeBudget = totalCatBudget > 0 ? totalCatBudget : budget;

  const pieData = useMemo(() => {
    const byCat = new Map<string, number>();
    for (const r of monthRecords) {
      if (r.type !== 'expense') continue;
      byCat.set(r.categoryId, (byCat.get(r.categoryId) ?? 0) + r.amount);
    }
    return Array.from(byCat.entries())
      .map(([id, value]) => {
        const cat = categoryById(id);
        return { id, name: cat?.name ?? '未分类', value: Math.round(value * 100) / 100, color: cat?.color ?? '#6BA75A' };
      })
      .sort((a, b) => b.value - a.value);
  }, [monthRecords]);

  const pieConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    for (const p of pieData) cfg[p.id] = { label: p.name, color: p.color };
    return cfg;
  }, [pieData]);

  const barData = useMemo(() => {
    const out: Array<{ month: string; income: number; expense: number }> = [];
    const all = snapshot?.records ?? [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - i, 1);
      const key = monthKey(d.getFullYear(), d.getMonth());
      const recs = all.filter((r) => r.date.startsWith(key));
      out.push({
        // R2：X 轴带年份，如 "25-10"，1 月查看时不再跨年混淆
        month: `${String(d.getFullYear()).slice(2)}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        income: Math.round(recs.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0) * 100) / 100,
        expense: Math.round(recs.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0) * 100) / 100,
      });
    }
    return out;
  }, [snapshot, year, month]);

  const barConfig: ChartConfig = {
    income: { label: '收入', color: 'var(--color-success)' },
    expense: { label: '支出', color: 'var(--color-danger)' },
  };

  const recordsByDate = useMemo(() => {
    const map = new Map<string, IFinanceRecord[]>();
    for (const r of monthRecords) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date)?.push(r);
    }
    return map;
  }, [monthRecords]);

  // 选中日过滤（null 表示全月）
  const filteredRecords = useMemo(
    () => (selectedDate ? recordsByDate.get(selectedDate) ?? [] : monthRecords),
    [selectedDate, recordsByDate, monthRecords],
  );

  const filteredGroupedByDay = useMemo(() => {
    const map = new Map<string, IFinanceRecord[]>();
    for (const r of filteredRecords) {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date)?.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filteredRecords]);

  const prevMonth = () => {
    const d = new Date(year, month - 1, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelectedDate(null);
  };

  const nextMonth = () => {
    const d = new Date(year, month + 1, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setSelectedDate(null);
  };

  const openCreate = () => {
    setType('expense');
    setAmount('');
    setCategoryId('food');
    setNote('');
    // R7：日期默认随当前查看月份联动——查看当前月则默认今天，否则默认该月 1 号
    const now = new Date();
    const viewingCurrent = year === now.getFullYear() && month === now.getMonth();
    const day = viewingCurrent ? now.getDate() : 1;
    setDate(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    // 防重：每次打开表单解锁提交锁（提交成功后锁保持，直至下次打开）
    submittingRef.current = false;
    setFormOpen(true);
  };

  // R5：保存月度预算（保留，兼容旧数据）
  const saveBudget = async () => {
    const v = Number(budgetInput);
    if (!budgetInput.trim() || !Number.isFinite(v) || v < 0) {
      toast.error('请输入有效金额');
      return;
    }
    await settingsRepo.set('studydesk:monthly-budget', Math.round(v * 100) / 100);
    setBudget(v);
    setBudgetOpen(false);
    toast.success('预算已保存');
  };

  // 阶段三：保存分类信封预算（budgets 表 upsert/删除）
  const saveCatBudgets = async () => {
    for (const c of EXPENSE_CATEGORIES) {
      const raw = budgetDraft[c.id];
      const v = raw == null || raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(v) || v < 0) {
        toast.error(`「${c.name}」预算金额无效`);
        return;
      }
    }
    try {
      const existing = await budgetRepo.list();
      const byCat = new Map(existing.map((r) => [r.categoryId, r]));
      for (const c of EXPENSE_CATEGORIES) {
        const raw = budgetDraft[c.id] ?? '';
        const v = raw === '' ? 0 : Math.round(Number(raw) * 100) / 100;
        const row = byCat.get(c.id);
        if (v <= 0) {
          if (row) await budgetRepo.hardDelete(row.id as number);
        } else if (row) {
          await budgetRepo.update(row.id as number, { amount: v });
        } else {
          await budgetRepo.create({ name: c.name, amount: v, categoryId: c.id });
        }
      }
      await loadCatBudgets();
      setBudgetOpen(false);
      toast.success('分类预算已保存');
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`);
    }
  };

  const switchType = (t: 'income' | 'expense') => {
    setType(t);
    setCategoryId(t === 'expense' ? EXPENSE_CATEGORIES[0].id : INCOME_CATEGORIES[0].id);
  };

  const cats: FinanceCategory[] = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  const submit = async () => {
    if (submittingRef.current) return;
    const amt = Number(amount);
    if (!amount || !Number.isFinite(amt) || amt <= 0) {
      toast.error('请输入有效金额');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await financeRecordRepo.create({
        date,
        amount: Math.round(amt * 100) / 100,
        categoryId,
        note: note.trim() || undefined,
        type,
      });
      toast.success('已记一笔');
      setFormOpen(false);
      reload();
    } catch (e) {
      // R3：DB 失败 toast 提示，弹窗保持打开、金额不丢
      toast.error(`保存失败：${(e as Error).message}`);
    } finally {
      // 防重：提交后保持锁定，直到用户重新打开表单（openForm 时解锁），杜绝双击/连点重复入库
      setSubmitting(false);
    }
  };

  const remove = async (id?: number) => {
    if (id == null) return;
    // R4：删除前二次确认，避免误触立即软删
    if (!window.confirm('确定删除这条记录吗？')) return;
    await financeRecordRepo.softDelete(id);
    toast.success('已删除');
    reload();
  };

  if (!snapshot) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载账本…
      </div>
    );
  }

  const totalExpensePie = pieData.reduce((s, p) => s + p.value, 0);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">记账</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">分类收支 · 月度图表 · 一目了然</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={() => setCalendarOpen((v) => !v)}>
            {calendarOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            日历
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setBudgetDraft(
                Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.id, catBudgets[c.id] ? String(catBudgets[c.id]) : ''])),
              );
              setBudgetOpen(true);
            }}
          >
            <Wallet className="h-4 w-4" /> 预算
          </Button>
          <Button className="" onClick={openCreate}>
            <Plus className="h-4 w-4" /> 记一笔
          </Button>
        </div>
      </div>

      {/* 月份切换 + 统计 */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-2">
          <button type="button" onClick={prevMonth} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[5.5rem] text-center text-[15px] font-semibold text-foreground">
            {year}年{MONTHS_CN[month]}
          </span>
          <button type="button" onClick={nextMonth} className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/40 p-4 dark:bg-white/[0.06]">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5 text-success" /> 收入
            </div>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-foreground">{fmtMoney(stats.income)}</p>
          </div>
          <div className="rounded-2xl bg-white/40 p-4 dark:bg-white/[0.06]">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingDown className="h-3.5 w-3.5 text-danger" /> 支出
            </div>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-foreground">{fmtMoney(stats.expense)}</p>
          </div>
          <div className="rounded-2xl bg-white/40 p-4 dark:bg-white/[0.06]">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5 text-primary" /> 结余
            </div>
            <p className={cn('mt-1.5 text-xl font-bold tabular-nums', stats.balance >= 0 ? 'text-foreground' : 'text-danger')}>
              {fmtMoney(stats.balance)}
            </p>
          </div>
        </div>
        {selectedDate && (
          <p className="mt-3 text-right text-xs text-muted-foreground">当前汇总口径：{selectedDate} 当日</p>
        )}

        {/* R5：月度预算进度条（分类预算汇总优先） */}
        {activeBudget > 0 && (
          <div className="mt-4 rounded-2xl bg-white/40 p-4 dark:bg-white/[0.06]">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground">
                本月预算 <span className="tabular-nums text-foreground">{fmtMoney(activeBudget)}</span>
                {totalCatBudget > 0 ? '（分类合计）' : ''}
                {' · '}已支出 <span className="tabular-nums text-foreground">{fmtMoney(monthExpense)}</span>
                {' · '}剩余{' '}
                <span className={cn('tabular-nums', activeBudget - monthExpense < 0 ? 'text-danger' : 'text-success')}>
                  {fmtMoney(activeBudget - monthExpense)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setBudgetDraft(
                    Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.id, catBudgets[c.id] ? String(catBudgets[c.id]) : ''])),
                  );
                  setBudgetOpen(true);
                }}
                className="text-primary hover:underline"
              >
                设置
              </button>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted/60">
              <div
                className={cn('h-full rounded-full transition-all', monthExpense > activeBudget ? 'bg-danger' : 'bg-primary')}
                style={{ width: `${Math.min(100, Math.round((monthExpense / activeBudget) * 100))}%` }}
              />
            </div>
          </div>
        )}
      </GlassCard>

      {/* 月历（可展开，受控月份与统计区同步） */}
      {calendarOpen && (
        <div className="mt-4">
          <MonthCalendar
            year={year}
            month={month}
            onMonthChange={(y, m) => {
              setYear(y);
              setMonth(m);
              setSelectedDate(null);
            }}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate((prev) => (prev === d ? null : d))}
            renderDay={(date) => {
              const recs = recordsByDate.get(date);
              if (!recs || recs.length === 0) return null;
              const expense = recs.filter((r) => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
              const income = recs.filter((r) => r.type === 'income').reduce((s, r) => s + r.amount, 0);
              return (
                <div className="flex flex-col items-center leading-tight">
                  {expense > 0 && <span className="text-[10px] font-medium tabular-nums text-danger">-{Math.round(expense)}</span>}
                  {income > 0 && <span className="text-[10px] font-medium tabular-nums text-success">+{Math.round(income)}</span>}
                </div>
              );
            }}
          />
        </div>
      )}

      {/* 图表区：两卡等高，右侧柱状图撑满剩余空间与左侧底部对齐 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GlassCard className="flex h-full flex-col p-5">
          <div className="flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">本月支出分布</h2>
          </div>
          {pieData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">本月暂无支出记录</p>
          ) : (
            <>
              <ChartContainer config={pieConfig} className="mx-auto h-[220px] w-full max-w-[320px]">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={88} paddingAngle={2} strokeWidth={0}>
                    {pieData.map((p) => (
                      <Cell key={p.id} fill={p.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <ul className="mt-2 space-y-1.5">
                {pieData.map((p) => {
                  const catBudget = catBudgets[p.id] ?? 0;
                  const over = catBudget > 0 && p.value > catBudget;
                  return (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: p.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span className="flex-1 truncate text-muted-foreground">{p.name}</span>
                          <span className="tabular-nums text-foreground">{fmtMoney(p.value)}</span>
                          <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">
                            {totalExpensePie > 0 ? `${Math.round((p.value / totalExpensePie) * 100)}%` : '0%'}
                          </span>
                        </div>
                        {catBudget > 0 ? (
                          <div className="mt-1 flex items-center gap-1.5">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/60">
                              <div
                                className={cn('h-full rounded-full', over ? 'bg-danger' : 'bg-primary/70')}
                                style={{ width: `${Math.min(100, Math.round((p.value / catBudget) * 100))}%` }}
                              />
                            </div>
                            <span className={cn('shrink-0 text-[10px] tabular-nums', over ? 'font-medium text-danger' : 'text-muted-foreground')}>
                              {over ? '超支' : `${Math.round((p.value / catBudget) * 100)}%`} / {fmtMoney(catBudget)}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </GlassCard>

        <GlassCard className="flex h-full flex-col p-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">近 6 个月收支</h2>
          </div>
          <ChartContainer config={barConfig} className="mt-2 w-full flex-1">
            <BarChart data={barData} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="var(--color-expense)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </GlassCard>
      </div>

      {/* 记录列表 */}
      <div className="mt-4">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <h2 className="text-[15px] font-semibold text-foreground">
              {selectedDate ? `${selectedDate} 流水` : '流水明细'}
            </h2>
            {selectedDate && (
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="text-xs text-primary transition-colors hover:underline"
              >
                显示全月
              </button>
            )}
            <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-0.5 text-xs tabular-nums text-primary">
              {filteredRecords.length} 笔
            </span>
          </div>
          {filteredRecords.length === 0 ? (
            <EmptyState
              title={selectedDate ? '当天暂无流水' : '本月还没有流水'}
              description={selectedDate ? '点击「显示全月」查看全部，或记一笔' : '点击「记一笔」开始记录收支'}
              icon={<Wallet className="h-6 w-6" />}
              actionLabel="记一笔"
              onAction={openCreate}
            />
          ) : (
            <div className="mt-3 space-y-3">
              {filteredGroupedByDay.map(([day, recs]) => {
                const daySum = recs.reduce((s, r) => s + (r.type === 'income' ? r.amount : -r.amount), 0);
                const [, mm, dd] = day.split('-');
                return (
                  <div key={day}>
                    <div className="mb-1.5 flex items-center justify-between px-1 text-xs text-muted-foreground">
                      <span>{Number(mm)}月{Number(dd)}日</span>
                      <span className={cn('tabular-nums', daySum >= 0 ? 'text-success' : 'text-danger')}>
                        {daySum >= 0 ? '+' : ''}{fmtMoney(daySum)}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {recs.map((r) => {
                        const cat = categoryById(r.categoryId);
                        return (
                          <li key={r.id} className="group flex items-center gap-3 rounded-xl bg-white/40 px-3 py-2.5 dark:bg-white/[0.06]">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg" style={{ backgroundColor: `${cat?.color ?? '#6BA75A'}22` }}>
                              {cat?.icon ?? '📦'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-foreground">{r.note || cat?.name || '未分类'}</p>
                              <p className="text-xs text-muted-foreground">{cat?.name ?? '未分类'}</p>
                            </div>
                            <span className={cn('text-sm font-semibold tabular-nums', r.type === 'income' ? 'text-success' : 'text-danger')}>
                              {r.type === 'income' ? '+' : '-'}{fmtMoney(r.amount)}
                            </span>
                            <button
                              type="button"
                              onClick={() => void remove(r.id)}
                              className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                              title="删除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      </div>

      {/* 录入弹窗 */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>记一笔</DialogTitle>
            <DialogDescription>记录收入或支出，自动汇入本月图表</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-1 rounded-full bg-white/40 p-1 dark:bg-white/[0.06]">
              {(['expense', 'income'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => switchType(t)}
                  className={cn(
                    'flex-1 rounded-full px-3 py-1.5 text-sm transition-all',
                    type === t ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t === 'expense' ? '支出' : '收入'}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fin-amount">金额</Label>
              <Input id="fin-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-lg font-semibold tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label>分类</Label>
              <div className="flex flex-wrap gap-1.5">
                {cats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(c.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-all',
                      categoryId === c.id ? 'bg-primary/15 ring-1 ring-primary/40 text-primary' : 'bg-white/40 text-muted-foreground hover:text-foreground dark:bg-white/[0.06]',
                    )}
                  >
                    <span className="text-base leading-none">{c.icon}</span> {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fin-date">日期</Label>
              <Input id="fin-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fin-note">备注</Label>
              <Input id="fin-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：食堂午餐" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>取消</Button>
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 阶段三：分类信封预算设置弹窗 */}
      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>预算设置</DialogTitle>
            <DialogDescription>按分类设置月度预算（信封预算），留空表示该分类不设预算；饼图与进度条会实时对照</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] space-y-3 overflow-y-auto py-2">
            {EXPENSE_CATEGORIES.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl bg-white/40 px-3 py-2 dark:bg-white/[0.06]">
                <span className="text-lg leading-none">{c.icon}</span>
                <span className="flex-1 text-sm text-foreground">{c.name}</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="0"
                    step="50"
                    value={budgetDraft[c.id] ?? ''}
                    onChange={(e) => setBudgetDraft((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    placeholder="不设"
                    className="h-8 w-24 text-right text-sm tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">元/月</span>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetOpen(false)}>取消</Button>
            <Button onClick={() => void saveCatBudgets()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
