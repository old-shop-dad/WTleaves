// 今日聚合：唯一口径，今日页所有数据都从这里取
import { db } from '@/db/db';
import { assignmentRepo } from '@/db/repositories/assignments';
import { launcherItemRepo } from '@/db/repositories/launcher';
import { focusRepo, habitLogRepo, habitRepo } from '@/db/repositories/lifestyle';
import { overrideRepo, slotRepo } from '@/db/repositories/schedule';
import { settingsRepo } from '@/db/repositories/settings';
import { semesterRepo } from '@/db/repositories/semesters';
import { semesterStateOn } from '@/lib/semester';
import { coursesOnDate } from '@/lib/schedule/occurrences';
import { courseTimeOf, DEFAULT_PERIODS, normalizePeriods, PERIODS_SETTING_KEY } from '@/lib/schedule/periods';
import { diffDays, toDateKey, weekdayOf } from '@/lib/dates';
import type { AssignmentStatus, IAssignment, ILauncherItem } from '@/db/types';

// EXPORTS: TodayCourse, TodayDdl, TodayStats, TodayHabit, TodayData, getTodayData

export interface TodayCourse {
  slotId: number;
  title: string;
  startMin: number;
  endMin: number;
  location?: string;
  teacher?: string;
  color?: string;
  overridden?: boolean;
}

export interface TodayDdl {
  assignmentId: number;
  title: string;
  dueAt: number;
  status: AssignmentStatus;
  overdueDays: number; // >0 逾期天数，0 今天截止，<0 未来
  isToday: boolean;
}

export interface TodayStats {
  focusMin: number;
  doneCount: number;
  habitDone: number;
  habitTotal: number;
}

export interface TodayHabit {
  id: number;
  name: string;
  icon?: string;
  color?: string;
  done: boolean;
}

export interface TodayData {
  dateKey: string;
  weekday: number;
  courses: TodayCourse[];
  ddl: TodayDdl[];
  stats: TodayStats;
  habits: TodayHabit[];
  entries: ILauncherItem[];
  /** 学期状态：ongoing=进行中，notStarted=未开始，ended=已结束，none=无学期 */
  semesterState: 'none' | 'notStarted' | 'ongoing' | 'ended';
}

export async function getTodayData(): Promise<TodayData> {
  const now = new Date();
  const dateKey = toDateKey(now);
  const weekday = weekdayOf(now);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayEnd = dayStart + 86400000 - 1;
  const thirtyDaysAgo = dayStart - 30 * 86400000;

  // ── 首屏并行取数（互不依赖的路一起发，减少串行等待）──
  // DDL / 已完成走索引查询（dueAt / status），避免全表内存加载
  const [semester, ddlRows, doneRows, sessions, habits, entries, periodsRaw] = await Promise.all([
    semesterRepo.getCurrent(),
    db.assignments
      .where('dueAt')
      .between(thirtyDaysAgo, dayEnd)
      .toArray()
      .catch(() => assignmentRepo.list()),
    db.assignments
      .where('status')
      .equals('done')
      .toArray()
      .catch(() => [] as IAssignment[]),
    focusRepo.list(),
    habitRepo.list(),
    launcherItemRepo.list(),
    settingsRepo.get(PERIODS_SETTING_KEY, null),
  ]);
  // 作息表（改作息后今日课程时间同步换算）
  const periods = normalizePeriods(periodsRaw) ?? DEFAULT_PERIODS;

  // ── 课程：当前学期 + 今天星期 + 周次匹配，叠加调停课（与课表页共用 occurrences）──
  let courses: TodayCourse[] = [];
  const semesterState = semesterStateOn(semester, now);
  if (semester && semesterState === 'ongoing') {
    const [slots, overrides] = await Promise.all([slotRepo.list(), overrideRepo.list()]);
    const occurrences = coursesOnDate({
      dateKey,
      semester,
      slots: slots.filter((s) => s.semesterId === semester.id),
      overrides,
    });
    courses = occurrences.map((o) => {
      // 课程时间跟随当前作息换算（改作息后今日页同步）
      const t = courseTimeOf(o, periods);
      return {
        slotId: o.slotId ?? -(o.overrideId ?? 0),
        title: o.title,
        startMin: t.startMin,
        endMin: t.endMin,
        location: o.location,
        teacher: o.teacher,
        color: o.color,
        overridden: o.change != null,
      };
    });
  }

  // ── DDL：未完成且截止时间在今天之前（含今天），且属于当前学期、不早于 30 天前 ──
  const ddl = ddlRows
    .filter((a) => {
      if (a.deletedAt) return false;
      if (a.status === 'done') return false;
      if (a.dueAt == null) return false;
      if (a.dueAt > dayEnd) return false;
      // T4：上学期逾期作业不挂今日页
      if (semester && a.semesterId != null && a.semesterId !== semester.id) return false;
      return true;
    })
    .map((a) => {
      const due = new Date(a.dueAt as number);
      const dueKey = toDateKey(due);
      return {
        assignmentId: a.id as number,
        title: a.title,
        dueAt: a.dueAt as number,
        status: a.status,
        overdueDays: diffDays(dueKey, dateKey),
        isToday: dueKey === dateKey,
      };
    })
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, 6);

  // ── 统计 ──
  const focusMin = sessions
    .filter((s) => {
      const st = new Date(s.startedAt);
      return toDateKey(st) === dateKey && s.endedAt != null;
    })
    .reduce((sum, s) => sum + (s.durationMin || 0), 0);
  // T3：用 completedAt 判断今日完成，避免编辑已完成任务备注刷新 updatedAt 被重复计数
  const doneCount = doneRows.filter(
    (a) => !a.deletedAt && a.completedAt != null && toDateKey(new Date(a.completedAt)) === dateKey,
  ).length;

  // daysOfWeek 口径为 1-7（1=周一，7=周日），而 weekdayOf 用 getDay() 的 0-6（0=周日），需转换后再过滤
  const habitWeekday = weekday === 0 ? 7 : weekday;
  const todaysHabits = habits.filter((h) => h.daysOfWeek?.includes(habitWeekday));
  const activeHabitIds = todaysHabits.map((h) => h.id as number);
  // T11：用 habitId 索引批量查询，不再全量拉取后 JS 过滤
  const habitLogs = await habitLogRepo.findByHabitIds(activeHabitIds);
  const todayDoneIds = new Set(habitLogs.filter((l) => l.date === dateKey && l.done).map((l) => l.habitId));
  const habitDone = todayDoneIds.size;
  const habitTotal = todaysHabits.length;
  const todayHabits: TodayHabit[] = todaysHabits.map((h) => ({
    id: h.id as number,
    name: h.name,
    icon: h.icon,
    color: h.color,
    done: todayDoneIds.has(h.id as number),
  }));

  // ── 常用入口（按打开次数取 6）──
  const sortedEntries = entries.sort((a, b) => (b.openCount || 0) - (a.openCount || 0)).slice(0, 6);

  return {
    dateKey,
    weekday,
    courses,
    ddl,
    stats: { focusMin, doneCount, habitDone, habitTotal },
    habits: todayHabits,
    entries: sortedEntries,
    semesterState,
  };
}
