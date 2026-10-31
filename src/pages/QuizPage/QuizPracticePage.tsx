// 刷题练习页：选择题即点即判 + 顶部统计栏 + 试题讲解 + 答题卡
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Bookmark, CheckCircle2, Flag, Grid3X3, Home,
  Lightbulb, Sparkles, XCircle, Loader2,
} from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { db } from '@/db/db';
import {
  quizSessionRepo, quizFavoriteRepo,
  getQuestionsByIds,
} from '@/db/repositories/quiz';
import { judge } from '@/modules/quiz/engine/judge';
import { bridgeToMistake } from '@/modules/quiz/engine/reviewBridge';
import { recordMistakeAnswer } from '@/modules/quiz/engine/reviewScheduler';
import { loadAiConfig } from '@/modules/quiz/ai/storage';
import type { IQuizQuestion, IQuizSession } from '@/db/types';

function cleanStemForDisplay(q: IQuizQuestion): string {
  if (q.type !== 'fill') return q.stem;
  return q.stem.replace(/[（(][^（）()]+[）)]\s*[.。．]?\s*$/, ' ____');
}

function optionsFor(q: IQuizQuestion): { key: string; content: string; correct: boolean }[] {
  if (q.type === 'judge') {
    return [
      { key: '对', content: '对', correct: q.answer.includes('对') },
      { key: '错', content: '错', correct: q.answer.includes('错') },
    ];
  }
  return q.options;
}

export default function QuizPracticePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sessionId = Number(id);

  const [session, setSession] = useState<IQuizSession | null | undefined>(undefined);
  const [questions, setQuestions] = useState<IQuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [fillInputs, setFillInputs] = useState<string[]>(['']);
  const [revealed, setRevealed] = useState(false);
  const [answersMap, setAnswersMap] = useState<Record<number, string[]>>({});
  const [wrongMap, setWrongMap] = useState<Record<number, boolean>>({});
  const [favs, setFavs] = useState<Set<number>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [aiExplain, setAiExplain] = useState<{ qid: number; text: string; loading: boolean } | null>(null);
  const autoNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Q5: 防重交卷
  const isSubmittingRef = useRef(false);
  // Q7: 倒计时（exam 模式）
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const finishRef = useRef<() => void>(() => {});

  // AI 生成解析
  const generateAiExplanation = useCallback(async (q: IQuizQuestion) => {
    if (aiExplain?.qid === q.id && aiExplain.loading) return;
    setAiExplain({ qid: q.id!, text: '', loading: true });
    try {
      const cfg = await loadAiConfig();
      if (!cfg?.apiKey) {
        toast.error('请到设置页配置 DeepSeek API Key');
        setAiExplain(null);
        return;
      }
      const optText = q.options.length ? '\n选项：\n' + q.options.map(o => `${o.key}. ${o.content}`).join('\n') : '';
      const resp = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({
          model: cfg.model || 'deepseek-chat',
          temperature: 0.3,
          messages: [
            { role: 'system', content: '你是资深课程助教，为题目生成简明解析。200 字以内，先讲为什么正确答案是这个，再点出其他选项错在哪。直接输出解析正文，不要加"解析："前缀。' },
            { role: 'user', content: `题目：${q.stem}${optText}\n正确答案：${q.answer.join('、')}` },
          ],
        }),
      });
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content ?? '';
      setAiExplain({ qid: q.id!, text, loading: false });
      // 写回题库的 explanation
      if (!q.explanation) {
        await db.quiz_questions.update(q.id!, { explanation: text, updatedAt: Date.now() });
        setQuestions(prev => prev.map(x => x.id === q.id ? { ...x, explanation: text } : x));
        toast.success('AI 解析已生成并保存');
      }
    } catch (e) {
      toast.error(`AI 解析失败：${(e as Error).message}`);
      setAiExplain(null);
    }
  }, [aiExplain]);

  const current: IQuizQuestion | undefined = questions[index];
  const isRecite = session?.mode === 'recite';
  const currentOptions = current ? optionsFor(current) : [];
  // 单选/判断：点选项即判；多选/填空：要手动提交
  const isImmediateJudge = current?.type === 'single' || current?.type === 'judge';
  // Q1: 统计题干中 ____ 的数量，决定填空题渲染几个输入框
  const blankCount = current?.type === 'fill' ? (current.stem.match(/_{2,}/g)?.length ?? 0) : 0;
  const fillInputCount = current?.type === 'fill' ? Math.max(1, blankCount) : 1;

  const setFillAt = useCallback((i: number, v: string) => {
    setFillInputs((prev) => {
      const next = prev.slice();
      next[i] = v;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const s = await quizSessionRepo.get(sessionId);
      if (!s) { setSession(null); return; }
      setSession(s);
      setIndex(s.currentIndex || 0);
      const qs = await getQuestionsByIds(s.questionIds);
      setQuestions(qs);
      // Q5: 从 attempts 表重建 answersMap / wrongMap，恢复中途退出的作答
      const pastAttempts = await db.quiz_attempts
        .where('sessionId')
        .equals(sessionId)
        .filter((a) => !a.deletedAt)
        .toArray();
      const am: Record<number, string[]> = {};
      const wm: Record<number, boolean> = {};
      for (const a of pastAttempts) {
        am[a.questionId] = a.userAnswer;
        wm[a.questionId] = !a.correct;
      }
      setAnswersMap(am);
      setWrongMap(wm);
      // Q7: exam 模式启动倒计时
      if (s.mode === 'exam' && s.timeLimitSec && !s.finishedAt) {
        const elapsed = Math.floor((Date.now() - s.startedAt) / 1000);
        setRemainingSec(Math.max(0, s.timeLimitSec - elapsed));
      }
      const favRows = await db.quiz_favorites
        .where('bankId')
        .equals(s.bankId)
        .filter((f) => !f.deletedAt)
        .toArray();
      setFavs(new Set(favRows.map((f) => f.questionId)));
    })();
    return () => { if (autoNextTimer.current) clearTimeout(autoNextTimer.current); };
  }, [sessionId]);

  // Q7: exam 模式倒计时，到时自动交卷
  useEffect(() => {
    if (remainingSec == null) return;
    if (remainingSec <= 0) {
      finishRef.current();
      return;
    }
    const t = setInterval(() => setRemainingSec((r) => (r == null ? null : r - 1)), 1000);
    return () => clearInterval(t);
  }, [remainingSec]);

  const recordAnswer = useCallback((userAnswer: string[]) => {
    if (!current || !session) return false;
    const ok = judge(current, userAnswer);
    setRevealed(true);
    setAnswersMap((m) => ({ ...m, [current.id!]: userAnswer }));
    setWrongMap((m) => ({ ...m, [current.id!]: !ok }));
    if (!ok) void bridgeToMistake(current);
    // 阶段二：无论对错都推进间隔复习调度（答对 box+1、答错归零并安排明天复习）
    void recordMistakeAnswer(current.id!, ok);
    // Q5: 每次作答立即写 quiz_attempts（recite 模式不写）
    if (session.mode !== 'recite') {
      const now = Date.now();
      void db.quiz_attempts.add({
        sessionId: session.id!,
        questionId: current.id!,
        bankId: session.bankId,
        userAnswer,
        correct: ok,
        durationMs: 0,
        answeredAt: now,
        marked: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: 0,
      } as never).catch(() => {});
    }
    return ok;
  }, [current, session]);

  const gotoIndex = useCallback((i: number) => {
    if (!session) return;
    if (autoNextTimer.current) { clearTimeout(autoNextTimer.current); autoNextTimer.current = null; }
    const q = questions[i];
    if (!q) return;
    setIndex(i);
    setSelected(answersMap[q.id!] ?? []);
    // Q1: 恢复已填答案（多空时为数组），否则重置为空串数组
    const saved = answersMap[q.id!];
    setFillInputs(saved && saved.length ? [...saved] : ['']);
    setRevealed(!!answersMap[q.id!] || isRecite);
    setSheetOpen(false);
    setAiExplain(null);
    if (sessionId) void quizSessionRepo.update(sessionId, { currentIndex: i });
  }, [questions, answersMap, isRecite, session, sessionId]);

  const toggleOption = useCallback((key: string) => {
    if (revealed || !current) return;
    if (isImmediateJudge) {
      // 单选/判断：即点即判
      setSelected([key]);
      const ok = recordAnswer([key]);
      // 答对自动跳下一题；答错停留看解析
      if (ok && index < questions.length - 1) {
        autoNextTimer.current = setTimeout(() => gotoIndex(index + 1), 800);
      }
    } else {
      // 多选：先勾选，再点提交
      setSelected((prev) =>
        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
      );
    }
  }, [revealed, current, isImmediateJudge, recordAnswer, index, questions.length, gotoIndex]);

  const submitAnswer = useCallback(() => {
    if (!current || !session || revealed) return;
    let userAnswer: string[] = [];
    if (current.type === 'fill') {
      // Q1: 收集所有空的输入（与题干中 ____ 数量一致），trim 后过滤空串
      userAnswer = fillInputs.slice(0, fillInputCount).map((s) => (s ?? '').trim()).filter(Boolean);
    } else if (current.type === 'short') {
      userAnswer = [(fillInputs[0] ?? '').trim()];
    } else {
      userAnswer = selected;
    }
    if (current.type !== 'short' && userAnswer.length === 0) {
      toast.info(current.type === 'multiple' ? '请先选择选项' : '请先作答');
      return;
    }
    recordAnswer(userAnswer);
  }, [current, session, selected, fillInputs, fillInputCount, revealed, recordAnswer]);

  const finish = useCallback(async () => {
    if (!session) return;
    // Q5: 防重交卷
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    const now = Date.now();

    // Q6: recite 背题模式不记录成绩
    if (session.mode === 'recite') {
      await quizSessionRepo.update(session.id!, { finishedAt: now, correctCount: 0, totalCount: questions.length, score: 0 });
      toast.info('背题模式不记录成绩');
      navigate(`/quiz/bank/${session.bankId}`);
      return;
    }

    // Q5: attempts 已在每次作答时写入，交卷只更新 session 统计
    const correctCount = Object.values(wrongMap).filter((w) => !w).length;
    const total = questions.length;
    const score = total ? Math.round((correctCount / total) * 100) : 0;
    await quizSessionRepo.update(session.id!, {
      finishedAt: now, correctCount, totalCount: total, score,
    });
    toast.success(`练习完成：${correctCount}/${total}（${score} 分）`);
    navigate(`/quiz/bank/${session.bankId}`);
  }, [session, wrongMap, questions.length, navigate]);

  // 暴露给倒计时 effect
  useEffect(() => {
    finishRef.current = () => { void finish(); };
  }, [finish]);

  const next = useCallback(() => {
    if (!session) return;
    if (index < questions.length - 1) gotoIndex(index + 1);
    else void finish();
  }, [index, questions.length, session, gotoIndex, finish]);

  const prev = useCallback(() => {
    if (index > 0) gotoIndex(index - 1);
  }, [index, gotoIndex]);

  const toggleFavorite = useCallback(async () => {
    if (!current || !session) return;
    const qid = current.id!;
    const set = new Set(favs);
    if (set.has(qid)) {
      const row = await db.quiz_favorites
        .where('questionId').equals(qid)
        .filter((f) => !f.deletedAt)
        .first();
      if (row) await quizFavoriteRepo.softDelete(row.id!);
      set.delete(qid);
    } else {
      await quizFavoriteRepo.create({ questionId: qid, bankId: session.bankId });
      set.add(qid);
    }
    setFavs(set);
  }, [current, session, favs]);

  // 顶部统计
  const answeredCount = Object.keys(answersMap).length;
  const correctCount = Object.values(wrongMap).filter((w) => !w).length;
  const wrongCount = Object.values(wrongMap).filter((w) => w).length;
  const favCount = favs.size;

  const typeGroups = useMemo(() => {
    const order = [
      { key: 'single', label: '一. 单选题' },
      { key: 'multiple', label: '二. 多选题' },
      { key: 'judge', label: '三. 判断题' },
      { key: 'fill', label: '四. 填空题' },
      { key: 'short', label: '五. 简答题' },
    ];
    return order
      .map((g) => ({
        ...g,
        items: questions.map((q, i) => ({ q, i })).filter((x) => x.q.type === g.key),
      }))
      .filter((g) => g.items.length > 0);
  }, [questions]);

  if (session === undefined) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">加载练习…</div>;
  }
  if (session === null || !current) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">会话不存在或已完成</p>
        <Button variant="outline" onClick={() => navigate('/quiz')}><Home className="h-4 w-4" /> 返回题库</Button>
      </div>
    );
  }

  const typeLabel = { single: '单选', multiple: '多选', judge: '判断', fill: '填空', short: '简答' }[current.type];

  return (
    <div className="mx-auto max-w-3xl">
      {/* 顶部统计栏（参考图） */}
      <GlassCard className="mb-4 grid grid-cols-4 divide-x divide-border/60 py-4">
        <button onClick={toggleFavorite} className="flex flex-col items-center gap-1.5">
          <Bookmark className={`h-7 w-7 ${favs.has(current.id!) ? 'fill-amber-400 text-amber-500' : 'text-foreground'}`} />
          <span className="text-[11px] text-muted-foreground">收藏 {favCount}</span>
        </button>
        <div className="flex flex-col items-center gap-1.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500 text-white">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <span className="text-[11px] text-muted-foreground">答对 {correctCount}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white">
            <XCircle className="h-5 w-5" />
          </span>
          <span className="text-[11px] text-muted-foreground">答错 {wrongCount}</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-lg font-semibold text-foreground">
            {answeredCount}<span className="text-muted-foreground">/{questions.length}</span>
          </span>
          <span className="text-[11px] text-muted-foreground">已做题</span>
        </div>
      </GlassCard>

      {/* 操作条 */}
      <div className="mb-4 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate(`/quiz/bank/${session.bankId}`)}>
          <ArrowLeft className="h-4 w-4" /> 退出
        </Button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.round((answeredCount / Math.max(questions.length, 1)) * 100)}%` }}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
          <Grid3X3 className="h-4 w-4" /> 答题卡
        </Button>
        {/* Q7: exam 模式倒计时 */}
        {remainingSec != null && session.mode === 'exam' && (
          <span className={`rounded-full px-3 py-1 text-xs font-mono ${remainingSec < 60 ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-primary/10 text-primary'}`}>
            {Math.floor(remainingSec / 60)}:{String(remainingSec % 60).padStart(2, '0')}
          </span>
        )}
        {/* Q6: recite 背题模式隐藏交卷 */}
        {!isRecite && (
          <Button variant="outline" size="sm" onClick={() => void finish()}>
            <Flag className="h-4 w-4" /> 交卷
          </Button>
        )}
      </div>

      {/* 题干 */}
      <GlassCard className="p-6">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{typeLabel}</span>
          <span>{current.chapter}</span>
          <span>难度 {current.difficulty}</span>
          {isImmediateJudge && !revealed ? (
            <span className="ml-auto text-[11px] text-muted-foreground">点选项即判</span>
          ) : null}
        </div>
        <h2 className="text-lg font-semibold leading-relaxed text-foreground">{cleanStemForDisplay(current)}</h2>

        {/* 选项区 */}
        {currentOptions.length > 0 ? (
          <div className="mt-5 space-y-2">
            {currentOptions.map((opt) => {
              const isSel = selected.includes(opt.key);
              const isCorrect = opt.correct;
              let cls = 'border-white/70 bg-white/40 dark:border-white/10 dark:bg-white/[0.06]';
              if (revealed) {
                if (isCorrect) cls = 'border-green-400/60 bg-green-500/15 text-green-700 dark:text-green-300';
                else if (isSel) cls = 'border-red-400/60 bg-red-500/15 text-red-700 dark:text-red-300';
              } else if (isSel) {
                cls = 'border-primary bg-primary/15 text-primary';
              }
              const isJudgeStyle = current.type === 'judge';
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => toggleOption(opt.key)}
                  disabled={revealed}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition-all ${cls}`}
                >
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center text-xs font-semibold ${isJudgeStyle ? 'rounded-full border border-current' : 'rounded-md bg-muted/60'}`}>
                    {isJudgeStyle ? (opt.key === '对' ? 'A' : 'B') : opt.key}
                  </span>
                  <span className="flex-1">{opt.content}</span>
                  {revealed && isCorrect ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : null}
                  {revealed && isSel && !isCorrect ? <XCircle className="h-5 w-5 text-red-500" /> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            {Array.from({ length: fillInputCount }).map((_, i) => (
              <input
                key={i}
                type="text"
                value={fillInputs[i] ?? ''}
                onChange={(e) => setFillAt(i, e.target.value)}
                disabled={revealed}
                onKeyDown={(e) => { if (e.key === 'Enter') submitAnswer(); }}
                placeholder={current.type === 'short'
                  ? '输入你的简答…'
                  : fillInputCount > 1 ? `第 ${i + 1} 空（回车提交）` : '输入答案，回车提交'}
                className="w-full rounded-xl border border-white/70 bg-white/50 px-4 py-3 text-sm outline-none backdrop-blur focus:border-primary dark:border-white/10 dark:bg-white/[0.08]"
              />
            ))}
          </div>
        )}

        {/* 试题讲解（提交后显示） */}
        {revealed ? (
          <div className="mt-5 space-y-3">
            <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${wrongMap[current.id!] ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-green-500/10 text-green-600 dark:text-green-400'}`}>
              {wrongMap[current.id!] ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {wrongMap[current.id!] ? '回答错误' : '回答正确'}
              <span className="ml-auto text-xs font-normal text-muted-foreground">
                正确答案：{current.answer.join(' / ')}
              </span>
            </div>
            <div className="rounded-xl border border-amber-200/60 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                <Lightbulb className="h-3.5 w-3.5" /> 试题讲解
              </div>
              <p className="text-sm leading-relaxed text-foreground">
                {current.explanation || '本题暂无解析，可结合教材或课件补充。'}
              </p>
              {/* AI 解析 */}
              {(!current.explanation || aiExplain?.qid === current.id) && (
                <div className="mt-3 border-t border-amber-200/60 pt-3 dark:border-amber-500/20">
                  {aiExplain?.qid === current.id && aiExplain.text ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-300">
                        <Sparkles className="h-3.5 w-3.5" /> AI 解析
                      </div>
                      <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{aiExplain.text}</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => void generateAiExplanation(current)}
                      disabled={aiExplain?.loading}
                      className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                      {aiExplain?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      {aiExplain?.loading ? 'AI 生成中…' : 'AI 生成解析'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* 操作按钮 */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!revealed && !isImmediateJudge ? (
            <Button onClick={() => void submitAnswer()}>
              <CheckCircle2 className="h-4 w-4" /> 提交答案
            </Button>
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={prev} disabled={index === 0}>
              <ArrowLeft className="h-4 w-4" /> 上题
            </Button>
            <Button onClick={next}>
              {index === questions.length - 1 ? '完成' : '下题'} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* 答题卡抽屉 */}
      {sheetOpen ? (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={() => setSheetOpen(false)}>
          <div
            className="absolute right-0 top-0 h-full w-80 overflow-y-auto bg-white/85 p-6 shadow-xl backdrop-blur-xl dark:bg-slate-900/85"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">答题卡</h3>
              <Button variant="ghost" size="sm" onClick={() => setSheetOpen(false)}>关闭</Button>
            </div>
            <div className="mb-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-primary" /> 当前</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-green-500/60" /> 已答对</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-red-500/60" /> 已答错</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-border" /> 未答</span>
            </div>
            {typeGroups.map((g) => (
              <div key={g.key} className="mb-5">
                <p className="mb-2 text-sm font-medium text-foreground">{g.label}（{g.items.length}题）</p>
                <div className="grid grid-cols-5 gap-2">
                  {g.items.map(({ q, i }) => {
                    const isCurrent = i === index;
                    const isAnswered = !!answersMap[q.id!];
                    const isWrong = wrongMap[q.id!];
                    let cls = 'border border-border bg-white/60 dark:bg-white/[0.05] text-foreground';
                    if (isCurrent) cls = 'border-primary bg-primary text-white';
                    else if (isAnswered && isWrong) cls = 'border-red-400 bg-red-500/30 text-red-700 dark:text-red-300';
                    else if (isAnswered) cls = 'border-green-400 bg-green-500/30 text-green-700 dark:text-green-300';
                    return (
                      <button
                        key={q.id}
                        onClick={() => gotoIndex(i)}
                        className={`flex h-10 items-center justify-center rounded-lg text-sm transition-all ${cls}`}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {!isRecite && (
              <Button className="mt-4 w-full" onClick={() => void finish()}>
                <Flag className="h-4 w-4" /> 交卷
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
