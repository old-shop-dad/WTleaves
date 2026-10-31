// 题库首页：题库卡片网格 + 新建/导入入口 + 今日待复习 + 空态
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CalendarClock, FolderOpen, Plus, Upload } from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';
import EmptyState from '@/components/glass/EmptyState';
import { Button } from '@/components/ui/button';
import { quizBankRepo } from '@/db/repositories/quiz';
import { countDueToday } from '@/modules/quiz/engine/reviewScheduler';
import QuizReviewDialog from './QuizReviewDialog';
import type { IQuizBank } from '@/db/types';

export default function QuizHomePage() {
  const navigate = useNavigate();
  const [banks, setBanks] = useState<IQuizBank[] | null>(null);
  const [dueCount, setDueCount] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);

  const reload = useCallback(() => {
    quizBankRepo.list().then(setBanks).catch(() => setBanks([]));
    countDueToday().then(setDueCount).catch(() => setDueCount(0));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const createBank = useCallback(async () => {
    const name = window.prompt('题库名称：', '未命名题库');
    if (!name) return;
    const desc = window.prompt('题库描述（可空）：', '') || '';
    const bank = await quizBankRepo.create({
      name, description: desc, courseId: null, source: 'manual',
      questionCount: 0, tags: [], archived: false,
    });
    navigate(`/quiz/bank/${bank.id}`);
  }, [navigate]);

  if (!banks) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">加载题库…</div>;
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">刷题</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{banks.length} 个题库 · 顺序/随机/章节/错题/收藏/考试/背题</p>
        </div>
        <Button className="ml-auto" onClick={() => navigate('/quiz/import')}>
          <Upload className="h-4 w-4" /> 导入题库
        </Button>
        <Button variant="outline" onClick={() => void createBank()}>
          <Plus className="h-4 w-4" /> 新建空题库
        </Button>
      </div>

      {/* 今日待复习卡片 */}
      <GlassCard
        className="mb-4 flex cursor-pointer items-center gap-3 p-4"
        onClick={() => dueCount > 0 && setReviewOpen(true)}
      >
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${dueCount > 0 ? 'bg-warning/20 text-warning' : 'bg-muted/50 text-muted-foreground'}`}>
          <CalendarClock className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {dueCount > 0 ? `今日待复习 ${dueCount} 题` : '今日没有待复习的错题'}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dueCount > 0 ? '按间隔重复调度，点击开始复习' : '答错的题会自动进入复习队列'}
          </p>
        </div>
        {dueCount > 0 ? (
          <Button size="sm" onClick={(e) => { e.stopPropagation(); setReviewOpen(true); }}>
            去复习
          </Button>
        ) : null}
      </GlassCard>

      {banks.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={<BookOpen className="h-10 w-10" />}
            title="还没有题库"
            description="点击「导入题库」上传 TXT/JSON 题目文件，或「新建空题库」从空白开始"
          />
        </GlassCard>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {banks.map((b) => (
            <GlassCard
              key={b.id}
              className="cursor-pointer p-5"
              onClick={() => navigate(`/quiz/bank/${b.id}`)}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FolderOpen className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">{b.name}</p>
                  {b.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{b.description}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">{b.questionCount} 道题 · {b.source === 'txt' ? 'TXT导入' : b.source === 'json' ? 'JSON导入' : '手动建'}</p>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <QuizReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        onReviewed={reload}
      />
    </div>
  );
}
