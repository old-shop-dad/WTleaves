// 题库详情页：题目统计 + 章节列表 + 七模式入口
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, BookOpen, BookMarked, ClipboardList, ListOrdered,
  Shuffle, Target, Trash2, XCircle,
} from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  quizBankRepo, listQuestionsByBank, listWrongQuestionIds,
} from '@/db/repositories/quiz';
import { db } from '@/db/db';
import { buildSession } from '@/modules/quiz/engine/sessionBuilder';
import type { IQuizBank, IQuizQuestion, PracticeMode } from '@/db/types';

const MODES: { key: PracticeMode; label: string; desc: string; icon: typeof ListOrdered }[] = [
  { key: 'sequential', label: '顺序练习', desc: '按章节顺序刷', icon: ListOrdered },
  { key: 'random', label: '随机练习', desc: '全库随机抽题', icon: Shuffle },
  { key: 'chapter', label: '章节练习', desc: '按章节筛选', icon: BookOpen },
  { key: 'exam', label: '模拟考试', desc: '限时随机组卷', icon: Target },
  { key: 'wrong', label: '错题重练', desc: '只刷错题', icon: XCircle },
  { key: 'favorite', label: '收藏练习', desc: '只刷收藏题', icon: BookMarked },
  { key: 'recite', label: '背题模式', desc: '直接看答案', icon: ClipboardList },
];

export default function QuizBankDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const bankId = Number(id);
  const [bank, setBank] = useState<IQuizBank | null | undefined>(undefined);
  const [questions, setQuestions] = useState<IQuizQuestion[]>([]);
  const [wrongCount, setWrongCount] = useState(0);
  const [chapterFilter, setChapterFilter] = useState<string | undefined>(undefined);

  const reload = useCallback(async () => {
    if (!bankId) return;
    const b = await quizBankRepo.get(bankId);
    setBank(b ?? null);
    const qs = await listQuestionsByBank(bankId, chapterFilter ? { chapter: chapterFilter } : undefined);
    setQuestions(qs);
    const w = await listWrongQuestionIds(bankId);
    setWrongCount(w.length);
  }, [bankId, chapterFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, [reload]);

  const chapters = useMemo(() => {
    const set = new Set(questions.map((q) => q.chapter).filter(Boolean));
    return [...set];
  }, [questions]);

  const startMode = useCallback(async (mode: PracticeMode) => {
    if (!bankId) return;
    if ((mode === 'wrong' || mode === 'favorite') && questions.length === 0) {
      toast.info('当前没有可刷的题');
      return;
    }
    try {
      const session = await buildSession({
        bankId, mode,
        chapter: mode === 'chapter' ? chapterFilter : undefined,
        count: mode === 'exam' ? 20 : undefined,
        timeLimitSec: mode === 'exam' ? 15 * 60 : undefined,
      });
      if (session.questionIds.length === 0) {
        toast.info('没有匹配的题目');
        return;
      }
      navigate(`/quiz/practice/${session.id}`);
    } catch (e) {
      toast.error(`启动失败：${(e as Error).message}`);
    }
  }, [bankId, chapterFilter, navigate, questions.length]);

  const deleteBank = useCallback(async () => {
    if (!bankId || !window.confirm('确认删除此题库？题目、作答记录、收藏一并删除')) return;
    // Q4: transaction 中级联软删 questions/sessions/attempts/favorites
    const now = Date.now();
    await db.transaction('rw',
      db.quiz_banks, db.quiz_questions, db.quiz_sessions, db.quiz_attempts, db.quiz_favorites,
      async () => {
        const qs = await db.quiz_questions.where('bankId').equals(bankId).toArray();
        for (const q of qs) await db.quiz_questions.update(q.id!, { deletedAt: now, updatedAt: now });
        const ss = await db.quiz_sessions.where('bankId').equals(bankId).toArray();
        for (const s of ss) await db.quiz_sessions.update(s.id!, { deletedAt: now, updatedAt: now });
        const ats = await db.quiz_attempts.where('bankId').equals(bankId).toArray();
        for (const a of ats) await db.quiz_attempts.update(a.id!, { deletedAt: now, updatedAt: now });
        const fs = await db.quiz_favorites.where('bankId').equals(bankId).toArray();
        for (const f of fs) await db.quiz_favorites.update(f.id!, { deletedAt: now, updatedAt: now });
        await db.quiz_banks.update(bankId, { deletedAt: now, updatedAt: now });
      });
    toast.success('题库已删除');
    navigate('/quiz');
  }, [bankId, navigate]);

  if (bank === undefined) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">加载题库…</div>;
  }
  if (bank === null) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">题库不存在或已删除</p>
        <Button variant="outline" onClick={() => navigate('/quiz')}><ArrowLeft className="h-4 w-4" /> 返回</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/quiz')}>
          <ArrowLeft className="h-4 w-4" /> 返回
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">{bank.name}</h1>
          {bank.description ? <p className="mt-0.5 text-sm text-muted-foreground">{bank.description}</p> : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => void deleteBank()}>
          <Trash2 className="h-4 w-4" /> 删除
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={!chapterFilter ? 'default' : 'outline'}
          onClick={() => setChapterFilter(undefined)}
        >
          全部章节
        </Button>
        {chapters.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={chapterFilter === c ? 'default' : 'outline'}
            onClick={() => setChapterFilter(c)}
          >
            {c}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <GlassCard key={m.key} className="cursor-pointer p-5 hover:-translate-y-0.5" onClick={() => void startMode(m.key)}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <p className="mt-3 text-base font-semibold text-foreground">{m.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {m.key === 'wrong' ? `${m.desc}（${wrongCount} 道）` : m.desc}
              </p>
            </GlassCard>
          );
        })}
      </div>

      <GlassCard className="mt-5 p-5">
        <p className="text-sm font-medium text-foreground">题目列表（{questions.length}）</p>
        {questions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">暂无题目，先去导入。</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {questions.slice(0, 50).map((q) => (
              <li key={q.id} className="flex items-start gap-2 text-sm">
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {q.type}
                </span>
                <span className="text-foreground">{q.stem}</span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
