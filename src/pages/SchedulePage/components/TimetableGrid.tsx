// 周视图：按分钟绝对定位的 7 天网格（支持重叠分栏、当前时间线、点击空白预填）
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { colorWithAlpha } from '@/lib/color';
import { minutesToClock, toDateKey } from '@/lib/dates';
import type { CourseOccurrence } from '@/lib/schedule/occurrences';
import { courseTimeOf, type Period } from '@/lib/schedule/periods';

const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const PX_PER_MIN = 1.15;

interface TimetableGridProps {
  weekDates: Date[];
  coursesByDate: Record<string, CourseOccurrence[]>;
  periods: Period[];
  todayKey: string;
  nowMinute: number;
  currentWeekLabel: string;
  onSelectCourse: (course: CourseOccurrence, dateKey: string) => void;
  onEmptyClick: (dateKey: string, minute: number) => void;
}

interface PositionedCourse extends CourseOccurrence {
  /** 纵向堆叠：重叠课程在同一时间格内上下排列（保持整列宽度），lane=组内序号，lanes=组内总数 */
  lane: number;
  lanes: number;
  /** 该重叠组的起止分钟（用于整组纵向均分） */
  stackStart: number;
  stackEnd: number;
}

/** 重叠课程纵向堆叠：同一时段重叠的课程上下排列，每门课独占整列宽度（按作息换算后的时间分组） */
function assignLanes(items: CourseOccurrence[], periods: Period[]): PositionedCourse[] {
  const withTime = items.map((item) => ({ item, t: courseTimeOf(item, periods) }));
  const sorted = [...withTime].sort((a, b) => a.t.startMin - b.t.startMin || a.t.endMin - b.t.endMin);
  const placed: PositionedCourse[] = [];
  let i = 0;
  while (i < sorted.length) {
    const group: Array<{ item: CourseOccurrence; t: ReturnType<typeof courseTimeOf> }> = [sorted[i]];
    let j = i + 1;
    // 与组内最早开始时间重叠的课程归入同一组
    while (j < sorted.length && sorted[j].t.startMin < group[0].t.endMin) {
      group.push(sorted[j]);
      j++;
    }
    const n = group.length;
    const groupStart = Math.min(...group.map((g) => g.t.startMin));
    const groupEnd = Math.max(...group.map((g) => g.t.endMin));
    group.forEach((g, idx) => {
      placed.push({
        ...g.item,
        lane: idx,
        lanes: n,
        stackStart: groupStart,
        stackEnd: groupEnd,
      });
    });
    i = j;
  }
  return placed;
}

export default function TimetableGrid({
  weekDates,
  coursesByDate,
  periods,
  todayKey,
  nowMinute,
  currentWeekLabel,
  onSelectCourse,
  onEmptyClick,
}: TimetableGridProps) {
  const days = useMemo(
    () => weekDates.map((date) => ({ date, key: toDateKey(date), courses: coursesByDate[toDateKey(date)] ?? [] })),
    [weekDates, coursesByDate],
  );

  const { rangeStart, rangeEnd } = useMemo(() => {
    const starts = periods.map((p) => p.startMin);
    const ends = periods.map((p) => p.endMin);
    for (const day of days) {
      for (const c of day.courses) {
        const t = courseTimeOf(c, periods);
        starts.push(t.startMin);
        ends.push(t.endMin);
      }
    }
    const min = starts.length > 0 ? Math.min(...starts) : 8 * 60;
    const max = ends.length > 0 ? Math.max(...ends) : 21 * 60;
    const start = Math.max(0, Math.floor(min / 30) * 30 - 30);
    const end = Math.min(24 * 60, Math.ceil(max / 30) * 30 + 30);
    return { rangeStart: start, rangeEnd: end };
  }, [periods, days]);

  const bodyHeight = (rangeEnd - rangeStart) * PX_PER_MIN;
  // 作息节次标签（改作息后自动同步显示）
  const visiblePeriods = useMemo(
    () => periods.filter((p) => p.startMin >= rangeStart && p.startMin <= rangeEnd),
    [periods, rangeStart, rangeEnd],
  );
  // 整点小时刻度（绝对时间参照，对齐无节次课程）
  const hourMarks = useMemo(() => {
    const out: number[] = [];
    for (let m = Math.ceil(rangeStart / 60) * 60; m <= rangeEnd; m += 60) out.push(m);
    return out;
  }, [rangeStart, rangeEnd]);

  const gridTemplate = '4.5rem repeat(7, minmax(0, 1fr))';

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        {/* 表头 */}
        <div
          className="sticky top-0 z-20 grid border-b border-border/60 bg-background/85 backdrop-blur-md"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="flex h-[52px] items-end justify-center pb-2 text-[10px] text-muted-foreground">
            {currentWeekLabel}
          </div>
          {days.map((day, i) => {
            const isToday = day.key === todayKey;
            return (
              <div
                key={day.key}
                className={cn(
                  'relative flex h-[46px] flex-col items-center justify-center gap-0.5 border-l border-border/40',
                  isToday && 'bg-primary/[0.08]',
                )}
              >
                <span className={cn('flex items-center gap-1 text-[13px] font-semibold tabular-nums', isToday ? 'text-primary' : 'text-foreground')}>
                  {day.date.getDate()}
                  <span className={cn('text-[11px] font-normal', isToday ? 'text-primary' : 'text-muted-foreground')}>
                    {DAY_LABELS[i]}
                  </span>
                </span>
                {isToday && <span className="absolute -top-0 h-0.5 w-8 rounded-full bg-primary" />}
              </div>
            );
          })}
        </div>

        {/* 主体：时间轴 + 7 天 */}
        <div className="relative grid" style={{ gridTemplateColumns: gridTemplate, height: bodyHeight }}>
          {/* 横向网格线（每 30 分钟） */}
          <div
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              backgroundImage: 'linear-gradient(to bottom, var(--border) 0 1px, transparent 1px)',
              backgroundSize: `100% ${30 * PX_PER_MIN}px`,
            }}
          />

          {/* 时间轴：作息节次 + 整点刻度 */}
          <div className="relative border-r border-border/40">
            {/* 节次区间淡色分区 + 节次标签 */}
            {visiblePeriods.map((p) => (
              <div key={p.slot}>
                <div
                  className="absolute inset-x-0 rounded-sm bg-muted/30"
                  style={{ top: (p.startMin - rangeStart) * PX_PER_MIN, height: Math.max(18, (p.endMin - p.startMin) * PX_PER_MIN - 2) }}
                />
                <div
                  className="absolute inset-x-1 z-10 -translate-y-1/2 text-right text-[10px] leading-tight tabular-nums text-muted-foreground"
                  style={{ top: (p.startMin - rangeStart) * PX_PER_MIN }}
                >
                  <div className="font-semibold text-foreground/80">第{p.slot}节</div>
                  <div>{minutesToClock(p.startMin)}-{minutesToClock(p.endMin)}</div>
                </div>
              </div>
            ))}
            {/* 整点刻度（对齐绝对时间课程） */}
            {hourMarks.map((m) => (
              <div
                key={`h-${m}`}
                className="pointer-events-none absolute right-1 z-20 -translate-y-1/2 rounded-sm bg-background/70 px-0.5 text-[10px] tabular-nums text-foreground/70"
                style={{ top: (m - rangeStart) * PX_PER_MIN }}
              >
                {minutesToClock(m)}
              </div>
            ))}
          </div>

          {/* 每天一列 */}
          {days.map((day) => {
            const isToday = day.key === todayKey;
            const positioned = assignLanes(day.courses, periods);
            return (
              <div
                key={day.key}
                className={cn(
                  'relative border-l border-border/40',
                  isToday && 'bg-primary/[0.03]',
                )}
                onClick={(e) => {
                  if (e.target !== e.currentTarget) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const minute = rangeStart + (e.clientY - rect.top) / PX_PER_MIN;
                  const snapped = Math.max(0, Math.min(24 * 60 - 30, Math.round(minute / 30) * 30));
                  onEmptyClick(day.key, snapped);
                }}
              >
                {positioned.map((course) => {
                  const t = courseTimeOf(course, periods);
                  // 纵向堆叠：整列宽度，重叠组内上下均分
                  const stackTop = (course.stackStart - rangeStart) * PX_PER_MIN;
                  const stackH = (course.stackEnd - course.stackStart) * PX_PER_MIN;
                  const top = stackTop + course.lane * (stackH / course.lanes);
                  const height = Math.max(38, stackH / course.lanes - 2);
                  const color = course.color ?? '#4A90D9';
                  const isNow =
                    isToday && nowMinute >= t.startMin && nowMinute < t.endMin;
                  const isPast = isToday && nowMinute >= t.endMin;
                  return (
                    <button
                      key={course.key}
                      type="button"
                      title={`${course.title} · ${minutesToClock(t.startMin)}-${minutesToClock(t.endMin)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectCourse(course, day.key);
                      }}
                      className={cn(
                        'absolute overflow-hidden rounded-lg px-1.5 py-1 text-left transition-all hover:z-10 hover:shadow-md focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring',
                        isNow && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                        isPast && 'opacity-55',
                      )}
                      style={{
                        top,
                        height,
                        left: 2,
                        width: 'calc(100% - 4px)',
                        backgroundColor: colorWithAlpha(color, '22'),
                        borderLeft: `3px solid ${color}`,
                      }}
                    >
                      <span className="block">
                        <span className="block break-words text-[12px] font-semibold leading-[1.35] text-foreground">
                          {course.title}
                        </span>
                        {course.change && (
                          <span className="mt-0.5 inline-block rounded bg-background/80 px-1 text-[9px] font-medium text-muted-foreground">
                            {course.change === 'moved' ? '调' : '补'}
                          </span>
                        )}
                      </span>
                      {height >= 52 && (
                        <span className="mt-0.5 block break-words text-[10.5px] leading-[1.3] text-muted-foreground">
                          {minutesToClock(t.startMin)}-{minutesToClock(t.endMin)}
                          {course.location ? ` · ${course.location}` : ''}
                        </span>
                      )}
                      {height >= 84 && course.teacher && (
                        <span className="mt-0.5 block break-words text-[10.5px] leading-[1.3] text-muted-foreground">
                          {course.teacher}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* 当前时间线 */}
                {isToday && nowMinute >= rangeStart && nowMinute <= rangeEnd && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-10"
                    style={{ top: (nowMinute - rangeStart) * PX_PER_MIN }}
                  >
                    <div className="h-0.5 bg-destructive/80" />
                    <div className="absolute -left-0.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-destructive" />
                  </div>
                )}

                {day.courses.length === 0 && (
                  <span className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 text-[11px] text-muted-foreground/50">
                    无课
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
