// 选中日的课程清单：一眼看全一天的课程（时间胶囊 + 课程名 + 教室/教师 + 状态）
import { cn } from '@/lib/utils';
import { colorWithAlpha } from '@/lib/color';
import { minutesToClock } from '@/lib/dates';
import { CalendarX2, Clock, MapPin, User } from 'lucide-react';
import type { CourseOccurrence } from '@/lib/schedule/occurrences';
import { courseTimeOf, formatPeriodRange, type Period } from '@/lib/schedule/periods';

const DAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

interface DayCourseListProps {
  dateKey: string;
  courses: CourseOccurrence[];
  periods: Period[];
  todayKey: string;
  nowMinute: number;
  onSelectCourse: (course: CourseOccurrence, dateKey: string) => void;
  onAddCourse: (dateKey: string) => void;
}

export default function DayCourseList({
  dateKey,
  courses,
  periods,
  todayKey,
  nowMinute,
  onSelectCourse,
  onAddCourse,
}: DayCourseListProps) {
  const date = new Date(`${dateKey}T00:00:00`);
  const isToday = dateKey === todayKey;
  const withTime = courses.map((c) => ({ course: c, t: courseTimeOf(c, periods) }));
  const sorted = [...withTime].sort((a, b) => a.t.startMin - b.t.startMin);
  const dateLabel = `${date.getMonth() + 1}月${date.getDate()}日`;

  return (
    <div className="flex h-full flex-col">
      {/* 标题：日期 + 星期 + 今日徽章 */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg font-bold text-foreground">{dateLabel}</span>
        <span className={cn('text-sm', isToday ? 'font-semibold text-primary' : 'text-muted-foreground')}>
          {DAY_LABELS[date.getDay()]}
        </span>
        {isToday && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">今天</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{courses.length > 0 ? `${courses.length} 节课` : '无课'}</span>
      </div>

      {sorted.length === 0 ? (
        <button
          type="button"
          onClick={() => onAddCourse(dateKey)}
          className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
        >
          <CalendarX2 className="h-8 w-8 opacity-60" />
          {isToday ? '今天没有课，好好休息' : '这天没有课'}
          <span className="text-xs opacity-70">点击添加课程</span>
        </button>
      ) : (
        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
          {sorted.map(({ course, t }) => {
            const color = course.color ?? '#4A90D9';
            const isNow = isToday && nowMinute >= t.startMin && nowMinute < t.endMin;
            const isPast = isToday && nowMinute >= t.endMin;
            return (
              <button
                key={course.key}
                type="button"
                onClick={() => onSelectCourse(course, dateKey)}
                className={cn(
                  'group relative w-full overflow-hidden rounded-2xl border border-border/60 p-3 text-left shadow-sm transition-all hover:shadow-md',
                  isPast && 'opacity-55',
                  isNow && 'border-primary/50 ring-2 ring-primary/25',
                )}
                style={{ backgroundColor: colorWithAlpha(color, '10') }}
              >
                {/* 左侧课程色条 */}
                <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: color }} />

                <div className="flex items-center gap-2">
                  {/* 时间胶囊：节次 + 作息换算时间 */}
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums',
                      isNow ? 'bg-primary text-primary-foreground' : 'bg-background/80 text-foreground',
                    )}
                  >
                    <Clock className="h-3 w-3" />
                    {t.startSlot != null && t.endSlot != null
                      ? `${formatPeriodRange(t.startSlot, t.endSlot)} ${minutesToClock(t.startMin)}-${minutesToClock(t.endMin)}`
                      : `${minutesToClock(t.startMin)}-${minutesToClock(t.endMin)}`}
                  </span>
                  {isNow && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">进行中</span>}
                  {isPast && <span className="shrink-0 text-[10px] text-muted-foreground">已结束</span>}
                  {course.change && (
                    <span className="ml-auto shrink-0 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {course.change === 'moved' ? '调课' : '补课'}
                    </span>
                  )}
                </div>

                <p className="mt-1.5 text-[15px] font-bold leading-snug text-foreground">{course.title}</p>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {course.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {course.location}
                    </span>
                  )}
                  {course.teacher && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" /> {course.teacher}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
