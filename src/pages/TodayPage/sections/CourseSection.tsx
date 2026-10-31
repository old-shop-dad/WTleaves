// 今日课程分区：歌曲列表式行卡（色点 + 时间 + 课程名 + 地点教师）
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';
import SectionHeader from '@/components/glass/SectionHeader';
import EmptyState from '@/components/glass/EmptyState';
import { minutesToClock } from '@/lib/dates';
import { CalendarDays } from 'lucide-react';
import type { TodayCourse } from '@/db/aggregate/today';

interface CourseSectionProps {
  courses: TodayCourse[];
  semesterState?: 'none' | 'notStarted' | 'ongoing' | 'ended';
}

export default function CourseSection({ courses, semesterState = 'ongoing' }: CourseSectionProps) {
  const navigate = useNavigate();
  const ended = semesterState === 'ended';
  const notStarted = semesterState === 'notStarted';
  return (
    <GlassCard className="p-4">
      <SectionHeader title="今日课程" onMore={() => navigate('/schedule')} />
      {ended ? (
        <EmptyState
          title="学期已结束"
          description="当前学期课程已全部结束，新学期开始后自动显示"
          icon={<CalendarDays className="h-6 w-6" />}
        />
      ) : notStarted ? (
        <EmptyState
          title="学期尚未开始"
          description="设置好学期开始日期后，这里会显示今日课程"
          icon={<CalendarDays className="h-6 w-6" />}
        />
      ) : courses.length === 0 ? (
        <EmptyState
          title="今天没有课程"
          description="去课表添加课程，或查看整周安排"
          icon={<CalendarDays className="h-6 w-6" />}
          actionLabel="去课表"
          onAction={() => navigate('/schedule')}
        />
      ) : (
        <ul className="space-y-1">
          {courses.map((c) => (
            <li key={c.slotId}>
              <button
                type="button"
                onClick={() => navigate('/schedule')}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/50 dark:hover:bg-white/10"
              >
                <span
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color ?? '#4A90D9' }}
                  aria-hidden
                />
                <span className="w-[104px] shrink-0 text-xs tabular-nums text-muted-foreground">
                  {minutesToClock(c.startMin)} - {minutesToClock(c.endMin)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {c.title}
                    {c.overridden ? <span className="ml-1.5 rounded bg-warning/15 px-1 text-[10px] text-warning">调课</span> : null}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.location ?? '未填地点'}
                    {c.teacher ? ` · ${c.teacher}` : ''}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
