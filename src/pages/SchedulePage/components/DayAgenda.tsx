// 移动端单日议程：星期 Tab + 当日课程列表
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { minutesToClock, toDateKey } from '@/lib/dates';
import type { CourseOccurrence } from '@/lib/schedule/occurrences';
import { courseTimeOf, type Period } from '@/lib/schedule/periods';

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

interface DayAgendaProps {
  weekDates: Date[];
  selectedDate: string;
  courses: CourseOccurrence[];
  periods: Period[];
  todayKey: string;
  onSelectDate: (dateKey: string) => void;
  onSelectCourse: (course: CourseOccurrence, dateKey: string) => void;
  onAddCourse: (dateKey: string) => void;
}

export default function DayAgenda({
  weekDates,
  selectedDate,
  courses,
  periods,
  todayKey,
  onSelectDate,
  onSelectCourse,
  onAddCourse,
}: DayAgendaProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1">
        {weekDates.map((date, i) => {
          const key = toDateKey(date);
          const active = key === selectedDate;
          const isToday = key === todayKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDate(key)}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-xl py-2 transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : isToday
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              <span className="text-[11px]">周{DAY_LABELS[i]}</span>
              <span className="text-[15px] font-semibold tabular-nums">{date.getDate()}</span>
            </button>
          );
        })}
      </div>

      {courses.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/60 py-10 text-center">
          <p className="text-sm text-muted-foreground">这天没有课</p>
          <button
            type="button"
            onClick={() => onAddCourse(selectedDate)}
            className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> 添加课程
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {courses.map((course) => {
            const t = courseTimeOf(course, periods);
            return (
            <li key={course.key}>
              <button
                type="button"
                onClick={() => onSelectCourse(course, selectedDate)}
                className="flex w-full items-stretch gap-3 rounded-xl border border-border/50 bg-background/60 p-2.5 text-left transition-colors hover:bg-muted/50"
              >
                <span
                  className="w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: course.color ?? '#4A90D9' }}
                />
                <span className="w-[84px] shrink-0 text-xs tabular-nums text-muted-foreground">
                  {minutesToClock(t.startMin)}
                  <br />
                  {minutesToClock(t.endMin)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-foreground">{course.title}</span>
                    {course.change && (
                      <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {course.change === 'moved' ? '调课' : '补课'}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {[course.location, course.teacher].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
