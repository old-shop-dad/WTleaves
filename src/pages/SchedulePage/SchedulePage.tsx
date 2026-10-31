// 课表页：周视图（按分钟网格 / 移动端议程）+ 导入 + 调停补课 + 月历
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus, CalendarDays, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Upload, Share2, CalendarRange, Info, Download,
} from 'lucide-react';
import { toast } from 'sonner';
import GlassCard from '@/components/glass/GlassCard';
import EmptyState from '@/components/glass/EmptyState';
import MonthCalendar from '@/components/MonthCalendar';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { overrideRepo, slotRepo } from '@/db/repositories/schedule';
import { semesterRepo } from '@/db/repositories/semesters';
import { settingsRepo } from '@/db/repositories/settings';
import {
  weekNumberOn, weekRangeOf, totalWeeksOf, semesterStateOn, weekStartOf,
} from '@/lib/semester';
import { coursesOnDate, type CourseOccurrence } from '@/lib/schedule/occurrences';
import {
  DEFAULT_PERIODS, PERIODS_SETTING_KEY, normalizePeriods, periodAt, type Period,
} from '@/lib/schedule/periods';
import { toDateKey, weekdayOf } from '@/lib/dates';
import { useIsMobile } from '@/hooks/use-mobile';
import { buildScheduleIcs } from '@/modules/schedule/ics';
import { downloadWeekImage } from '@/lib/schedule/shareImage';
import CourseFormDialog from './CourseFormDialog';
import CourseImportDialog from './CourseImportDialog';
import CourseDetailDialog from './CourseDetailDialog';
import OverrideDialog, { type OverrideMode } from './OverrideDialog';
import WeekStrip from './components/WeekStrip';
import TimetableGrid from './components/TimetableGrid';
import DayAgenda from './components/DayAgenda';
import DayCourseList from './components/DayCourseList';
import type { IScheduleOverride, IScheduleSlot, ISemester } from '@/db/types';

interface ScheduleSnapshot {
  semester: ISemester | null;
  slots: IScheduleSlot[];
  overrides: IScheduleOverride[];
  periods: Period[];
}

interface FormDefaults {
  dayOfWeek?: number;
  startMin?: number;
}

interface OverrideState {
  mode: OverrideMode;
  base?: IScheduleSlot | null;
  dateKey: string;
}

const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function SchedulePage() {
  const isMobile = useIsMobile();
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [formOpen, setFormOpen] = useState(false);
  const [formDefaults, setFormDefaults] = useState<FormDefaults>({});
  const [editing, setEditing] = useState<IScheduleSlot | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [detail, setDetail] = useState<{ course: CourseOccurrence; dateKey: string } | null>(null);
  const [deleting, setDeleting] = useState<IScheduleSlot | null>(null);
  const [overrideState, setOverrideState] = useState<OverrideState | null>(null);
  const [nowMinute, setNowMinute] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const fetchData = useCallback(async (): Promise<ScheduleSnapshot> => {
    const [semester, allSlots, allOverrides, rawPeriods] = await Promise.all([
      semesterRepo.getCurrent(),
      slotRepo.list(),
      overrideRepo.list(),
      settingsRepo.get<Period[]>(PERIODS_SETTING_KEY, DEFAULT_PERIODS),
    ]);
    return {
      semester: semester ?? null,
      slots: semester ? allSlots.filter((s) => s.semesterId === semester.id) : [],
      overrides: semester ? allOverrides.filter((o) => o.semesterId === semester.id) : [],
      periods: normalizePeriods(rawPeriods) ?? DEFAULT_PERIODS,
    };
  }, []);

  const reload = useCallback(() => {
    fetchData()
      .then((data) => {
        setLoadError(null);
        setSnapshot(data);
      })
      .catch((e) => setLoadError((e as Error)?.message || '课表加载失败'));
  }, [fetchData]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 每分钟刷新“当前时间线”
  useEffect(() => {
    const timer = window.setInterval(() => {
      const d = new Date();
      setNowMinute(d.getHours() * 60 + d.getMinutes());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const semester = snapshot?.semester ?? null;
  const totalWeeks = totalWeeksOf(semester);
  const todayKey = toDateKey(new Date());
  const currentWeekNum = semester ? weekNumberOn(semester, new Date()) : null;
  const semesterState = semesterStateOn(semester, new Date());
  const viewWeek = Math.min(
    totalWeeks,
    Math.max(1, selectedWeek ?? currentWeekNum ?? (semesterState === 'ended' ? totalWeeks : 1)),
  );
  const isThisWeek = currentWeekNum != null && viewWeek === currentWeekNum;

  const weekStartDate = useMemo(() => {
    const range = semester ? weekRangeOf(semester, viewWeek) : null;
    return range?.start ?? mondayOf(new Date());
  }, [semester, viewWeek]);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStartDate);
      d.setDate(weekStartDate.getDate() + i);
      return d;
    }),
    [weekStartDate],
  );

  const coursesByDate = useMemo(() => {
    const map: Record<string, CourseOccurrence[]> = {};
    if (!snapshot) return map;
    for (const date of weekDates) {
      const key = toDateKey(date);
      map[key] = coursesOnDate({
        dateKey: key,
        semester,
        slots: snapshot.slots,
        overrides: snapshot.overrides,
      });
    }
    return map;
  }, [weekDates, snapshot, semester]);

  const selectedCourses = useMemo(() => {
    if (!snapshot) return [];
    return coursesOnDate({
      dateKey: selectedDate,
      semester,
      slots: snapshot.slots,
      overrides: snapshot.overrides,
    });
  }, [selectedDate, snapshot, semester]);

  const selectWeek = (week: number) => {
    const target = Math.min(totalWeeks, Math.max(1, week));
    setSelectedWeek(target);
    const start = semester ? weekStartOf(semester, target) : null;
    if (start) {
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const today = new Date();
      const todayInWeek = today >= start && today <= new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59);
      const picked = target === currentWeekNum && todayInWeek ? today : start;
      setSelectedDate(toDateKey(picked));
    }
  };

  const selectDate = (dateKey: string) => {
    setSelectedDate(dateKey);
    const date = new Date(`${dateKey}T00:00:00`);
    const week = semester ? weekNumberOn(semester, date) : null;
    if (week != null) setSelectedWeek(week);
  };

  const openAdd = (dateKey = selectedDate) => {
    if (!semester) {
      toast.error('请先在设置中创建学期');
      return;
    }
    const date = new Date(`${dateKey}T00:00:00`);
    setEditing(null);
    setFormDefaults({ dayOfWeek: weekdayOf(date), startMin: 8 * 60 });
    setFormOpen(true);
  };

  const openAddAt = (dateKey: string, minute: number) => {
    if (!semester) {
      toast.error('请先在设置中创建学期');
      return;
    }
    const date = new Date(`${dateKey}T00:00:00`);
    const hit = periodAt(snapshot?.periods ?? DEFAULT_PERIODS, minute);
    setEditing(null);
    setFormDefaults({ dayOfWeek: weekdayOf(date), startMin: hit?.startMin ?? minute });
    setFormOpen(true);
  };

  const confirmDelete = async () => {
    if (deleting?.id == null) return;
    await slotRepo.softDelete(deleting.id);
    toast.success('课程已删除');
    setDeleting(null);
    reload();
  };

  const offThisWeek = async (slot: IScheduleSlot, dateKey: string) => {
    if (!semester || slot.id == null) return;
    if (!window.confirm(`确定本周（${dateKey}）停上「${slot.title}」吗？只影响这一周。`)) return;
    await overrideRepo.create({
      date: dateKey,
      semesterId: semester.id as number,
      kind: 'off',
      slotId: slot.id,
      title: slot.title,
    });
    toast.success('已停课（仅本周）');
    setDetail(null);
    reload();
  };

  const undoOverride = async (overrideId: number) => {
    await overrideRepo.softDelete(overrideId);
    toast.success('已撤销本次调整');
    setDetail(null);
    reload();
  };

  const exportIcs = () => {
    if (!semester) {
      toast.error('请先设置学期');
      return;
    }
    const ics = buildScheduleIcs({
      semester,
      slots: snapshot?.slots ?? [],
      overrides: snapshot?.overrides ?? [],
    });
    if (!ics) {
      toast.error('当前学期没有可导出的课程');
      return;
    }
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${semester.name}-课表.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('ICS 已导出，可导入系统日历');
  };

  const shareImage = async () => {
    const ok = await downloadWeekImage({
      semesterName: semester?.name ?? '我的课表',
      weekNumber: viewWeek,
      weekDates,
      coursesByDate,
      periods: snapshot?.periods ?? DEFAULT_PERIODS,
      todayKey,
    });
    if (ok) toast.success('分享图已生成');
    else toast.error('分享图生成失败');
  };

  const detailSlot = detail?.course.slotId != null
    ? snapshot?.slots.find((s) => s.id === detail.course.slotId)
    : undefined;

  const weekRangeLabel = `${weekDates[0].getMonth() + 1}月${weekDates[0].getDate()}日 - ${weekDates[6].getMonth() + 1}月${weekDates[6].getDate()}日`;

  if (!snapshot) {
    return (
      <GlassCard className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        {loadError ? (
          <>
            <p>课表加载失败：{loadError}</p>
            <Button variant="outline" size="sm" onClick={reload}>重试</Button>
          </>
        ) : (
          '加载课表…'
        )}
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4">
      {/* 顶部：周次 + 操作 */}
      <div className="flex flex-wrap items-center gap-3">
        <GlassCard className="flex flex-1 items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => selectWeek(viewWeek - 1)}
            disabled={viewWeek <= 1}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
            aria-label="上一周"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl font-bold text-foreground">第 {viewWeek} 周</span>
              {isThisWeek && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">本周</span>
              )}
              {!isThisWeek && currentWeekNum != null && (
                <button
                  type="button"
                  onClick={() => selectWeek(currentWeekNum)}
                  className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  回到本周
                </button>
              )}
            </div>
            <div className="text-sm text-muted-foreground">{weekRangeLabel} · 共 {totalWeeks} 周</div>
          </div>
          <button
            type="button"
            onClick={() => selectWeek(viewWeek + 1)}
            disabled={viewWeek >= totalWeeks}
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
            aria-label="下一周"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </GlassCard>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!semester}>
            <Upload className="h-4 w-4" /> 导入
          </Button>
          <Button variant="outline" onClick={() => void shareImage()} disabled={!semester}>
            <Share2 className="h-4 w-4" /> 分享图
          </Button>
          <Button variant="outline" onClick={exportIcs} disabled={!semester}>
            <Download className="h-4 w-4" /> ICS
          </Button>
          <Button variant="outline" onClick={() => setCalendarOpen((v) => !v)}>
            {calendarOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} 日历
          </Button>
          <Button onClick={() => openAdd()} disabled={!semester}>
            <Plus className="h-4 w-4" /> 添加课程
          </Button>
        </div>
      </div>

      {/* 周次条 */}
      {semester && totalWeeks > 1 && (
        <WeekStrip
          totalWeeks={totalWeeks}
          currentWeek={currentWeekNum}
          selectedWeek={viewWeek}
          onSelect={selectWeek}
        />
      )}

      {/* 学期状态提示 */}
      {semesterState === 'none' && (
        <GlassCard className="flex flex-wrap items-center gap-2 p-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4" />
          还没有学期，课表无法计算周次。
          <Link to="/settings" className="text-primary underline-offset-4 hover:underline">去设置学期</Link>
        </GlassCard>
      )}
      {semesterState === 'notStarted' && (
        <GlassCard className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4" /> 学期还未开始（第 1 周从 {semester ? weekStartOf(semester, 1)?.toLocaleDateString('zh-CN') : '—'} 开始）。
        </GlassCard>
      )}
      {semesterState === 'ended' && (
        <GlassCard className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4" /> 学期已结束，仅显示历史课程。
        </GlassCard>
      )}
      {semester && semesterState === 'ongoing' && !isThisWeek && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5" /> 正在查看第 {viewWeek} 周（非本周），课程按该周周次规则显示。
        </div>
      )}

      {/* 周视图 / 移动端议程 */}
      {snapshot.slots.length === 0 ? (
        <GlassCard>
          <EmptyState
            title="课表还是空的"
            description="导入教务课表，或手动添加第一节课"
            icon={<CalendarDays className="h-6 w-6" />}
            actionLabel="添加课程"
            onAction={() => openAdd()}
          />
        </GlassCard>
      ) : isMobile ? (
        <GlassCard className="overflow-hidden p-2 sm:p-3">
          <DayAgenda
            weekDates={weekDates}
            selectedDate={selectedDate}
            courses={selectedCourses}
            periods={snapshot.periods}
            todayKey={todayKey}
            onSelectDate={selectDate}
            onSelectCourse={(course, dateKey) => setDetail({ course, dateKey })}
            onAddCourse={openAdd}
          />
        </GlassCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(300px,340px)_1fr]">
          {/* 左侧：选中日课程清单（一眼看全一天） */}
          <GlassCard className="p-4">
            <DayCourseList
              dateKey={selectedDate}
              courses={selectedCourses}
              periods={snapshot.periods}
              todayKey={todayKey}
              nowMinute={nowMinute}
              onSelectCourse={(course, dateKey) => setDetail({ course, dateKey })}
              onAddCourse={openAdd}
            />
          </GlassCard>
          {/* 右侧：周视图网格 */}
          <GlassCard className="overflow-hidden p-2 sm:p-3">
            <TimetableGrid
              weekDates={weekDates}
              coursesByDate={coursesByDate}
              periods={snapshot.periods}
              todayKey={todayKey}
              nowMinute={nowMinute}
              currentWeekLabel={`第${viewWeek}周`}
              onSelectCourse={(course, dateKey) => setDetail({ course, dateKey })}
              onEmptyClick={openAddAt}
            />
          </GlassCard>
        </div>
      )}

      {/* 月历 */}
      {calendarOpen && (
        <GlassCard className="p-2">
          <MonthCalendar
            selectedDate={selectedDate}
            onSelectDate={selectDate}
            renderDay={(date) => {
              const list = coursesOnDate({
                dateKey: date,
                semester,
                slots: snapshot.slots,
                overrides: snapshot.overrides,
              });
              return list.length > 0 ? (
                <span className="text-[10px] font-medium text-primary/80">{list.length} 节</span>
              ) : null;
            }}
          />
        </GlassCard>
      )}

      {/* 图例 */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> 本周</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" /> 当前时间</span>
        <span className="flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" /> 空白格点击可快速添加</span>
      </div>

      <CourseFormDialog
        key={`${editing?.id ?? 'new'}-${formDefaults.dayOfWeek ?? ''}-${formDefaults.startMin ?? ''}-${formOpen}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        semesterId={semester?.id ?? null}
        totalWeeks={totalWeeks}
        initial={editing}
        defaultDayOfWeek={formDefaults.dayOfWeek}
        defaultStartMin={formDefaults.startMin}
        onSaved={reload}
      />

      <CourseImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        semesterId={semester?.id ?? null}
        totalWeeks={totalWeeks}
        periods={snapshot.periods}
        semesterStart={semester?.startDate}
        onImported={reload}
      />

      <CourseDetailDialog
        open={detail != null}
        onOpenChange={(open) => !open && setDetail(null)}
        occurrence={detail?.course ?? null}
        dateKey={detail?.dateKey ?? selectedDate}
        slot={detailSlot}
        periods={snapshot?.periods ?? DEFAULT_PERIODS}
        totalWeeks={totalWeeks}
        onEdit={(slot) => {
          setDetail(null);
          setEditing(slot);
          setFormDefaults({});
          setFormOpen(true);
        }}
        onDelete={(slot) => {
          setDetail(null);
          setDeleting(slot);
        }}
        onOff={(slot, dateKey) => void offThisWeek(slot, dateKey)}
        onMove={(slot, dateKey) => {
          setDetail(null);
          setOverrideState({ mode: 'move', base: slot, dateKey });
        }}
        onUndoOverride={(id) => void undoOverride(id)}
      />

      <OverrideDialog
        key={`${overrideState?.mode ?? 'none'}-${overrideState?.base?.id ?? 'new'}-${overrideState?.dateKey ?? ''}`}
        open={overrideState != null}
        mode={overrideState?.mode ?? 'added'}
        onOpenChange={(open) => !open && setOverrideState(null)}
        semesterId={semester?.id ?? null}
        base={overrideState?.base}
        dateKey={overrideState?.dateKey ?? selectedDate}
        onSaved={reload}
      />

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除课程</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{deleting?.title}」吗？该课程的所有上课周都会被移除，删除后无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <p className="sr-only">当前选中日期 {selectedDate}，{DAY_LABELS[weekdayOf(new Date(`${selectedDate}T00:00:00`))]}，共 {selectedCourses.length} 节课。</p>
    </div>
  );
}
