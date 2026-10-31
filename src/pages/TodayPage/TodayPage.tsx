// 今日仪表盘（首页）：v2 定稿布局 —— 问候横幅 → 金刚位 → 课程/DDL/打卡 + 专注/入口
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTodayData, type TodayData } from '@/db/aggregate/today';
import { assignmentRepo } from '@/db/repositories/assignments';
import { launcherItemRepo } from '@/db/repositories/launcher';
import { seedIfEmpty } from '@/data/seed';
import { toast } from 'sonner';
import GreetingBanner from './sections/GreetingBanner';
import QuickActions from './sections/QuickActions';
import CourseSection from './sections/CourseSection';
import DdlSection from './sections/DdlSection';
import HabitsSection from './sections/HabitsSection';
import FocusSection from './sections/FocusSection';
import EntriesSection from './sections/EntriesSection';
import type { ILauncherItem } from '@/db/types';

export default function TodayPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async (): Promise<TodayData> => {
    await seedIfEmpty();
    return getTodayData();
  }, []);

  const reload = useCallback(() => {
    setError(false);
    fetchData()
      .then(setData)
      .catch(() => setError(true));
  }, [fetchData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const toggleDdl = useCallback(
    async (assignmentId: number) => {
      // T3：标记完成时写入 completedAt，统计"今日完成数"以此为准
      await assignmentRepo.update(assignmentId, { status: 'done', completedAt: Date.now() });
      toast.success('任务已完成');
      reload();
    },
    [reload],
  );

  const recordOpen = useCallback(
    async (item: ILauncherItem) => {
      // T5：用 Dexie 原子 modify 自增，避免读旧值+1 整体 put 的并发丢失更新
      if (item.id != null) await launcherItemRepo.incrementOpenCount(item.id);
    },
    [],
  );

  // T6：加载失败可重试，不再永久 loading
  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <span>加载失败，请检查数据库后重试</span>
        <button
          type="button"
          onClick={reload}
          className="rounded-full bg-primary px-4 py-1.5 text-primary-foreground"
        >
          点击重试
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载今日数据…
      </div>
    );
  }

  return (
    <div>
      <GreetingBanner
        today={new Date()}
        courseCount={data.courses.length}
        ddlCount={data.ddl.length}
        stats={data.stats}
      />
      <QuickActions onSearch={() => navigate('/launcher')} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <CourseSection courses={data.courses} semesterState={data.semesterState} />
        </div>
        <div className="space-y-4 lg:col-span-1">
          <DdlSection ddl={data.ddl} onToggle={toggleDdl} />
          <HabitsSection habits={data.habits} done={data.stats.habitDone} total={data.stats.habitTotal} />
        </div>
        <div className="space-y-4 lg:col-span-1">
          <FocusSection focusMin={data.stats.focusMin} />
          <EntriesSection entries={data.entries} onOpen={recordOpen} />
        </div>
      </div>
    </div>
  );
}
