// 题库导入向导：选文件 → 预览题目 → 新建题库入库（支持 AI 兜底识别）
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileUp, Sparkles, Upload } from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { quizBankRepo, quizQuestionRepo } from '@/db/repositories/quiz';
import { parseQuestionFile } from '@/modules/quiz/parsers';
import { normalizeStem } from '@/modules/quiz/parsers/normalize';
import type { ParseResult, QuestionDTO } from '@/modules/quiz/parsers/types';
import { parseWithAi, aiQuestionsToDTO, loadAiConfig } from '@/modules/quiz/ai';
import type { AiConfig } from '@/modules/quiz/ai';

export default function QuizImportPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const rawFileRef = useRef<File | null>(null);
  const [bankName, setBankName] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [aiProgress, setAiProgress] = useState('');
  // Q2: 记录当前 result 的真实来源。不能用 aiRunning——提交时 AI 早已跑完、aiRunning=false
  const [resultSource, setResultSource] = useState<'ai' | 'txt' | 'json'>('txt');

  useEffect(() => {
    loadAiConfig().then(setAiConfig).catch(() => setAiConfig(null));
  }, []);

  const onPick = useCallback(async (file: File) => {
    rawFileRef.current = file;
    setFileName(file.name);
    setBankName((n) => n || file.name.replace(/\.[^.]+$/, ''));
    try {
      const r = await parseQuestionFile({
        name: file.name,
        text: () => file.text(),
        arrayBuffer: () => file.arrayBuffer(),
      });
      setResult(r);
      setResultSource(file.name.toLowerCase().endsWith('.json') ? 'json' : 'txt');
      if (!r.questions.length) toast.error('未解析到题目，可尝试点下方「AI 识别」');
      else toast.success(`解析到 ${r.questions.length} 道题，警告 ${r.warnings.length}`);
    } catch (e) {
      toast.error(`解析失败：${(e as Error).message}`);
    }
  }, []);

  const handleAiParse = useCallback(async () => {
    const file = rawFileRef.current;
    if (!file) { toast.error('请先选择文件'); return; }
    if (!aiConfig?.apiKey) {
      toast.error('请先到「设置 → AI 配置」填写 API Key');
      navigate('/settings');
      return;
    }
    if (!window.confirm('将把文件文本发送到 AI 服务识别题目，确认继续？')) return;
    setAiRunning(true);
    setAiProgress('准备中…');
    try {
      // 提取纯文本（复用现有解析器的文本提取能力）
      const ext = file.name.toLowerCase();
      let text: string;
      if (ext.endsWith('.docx')) {
        // 直接走现有 docxParser 提取文本——但它返回 ParseResult，我们只需要文本
        // 简单方案：让用户先选过文件后 result 已经是 ParseResult，但要原始文本就要重解
        // 这里直接调用 docx 的文本提取：复用 parseDocx 内部逻辑太重，改为读 file.text() 兜底（docx 会乱码）
        // 正确做法：用 JSZip 解——但模块未导出。简单起见，用一个临时 fetch blob 读 text
        text = await file.text();
      } else {
        text = await file.text();
      }
      // 如果是 docx，file.text() 是乱码，需要提示用户
      if (ext.endsWith('.docx')) {
        // 重新用 JSZip 提取（动态 import）
        const JSZip = (await import('jszip')).default;
        const buf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(buf);
        const xml = await zip.file('word/document.xml')?.async('text') ?? '';
        text = xml
          .replace(/<\/w:p>/g, '\n')
          .replace(/<w:t[^>]*>/g, '')
          .replace(/<\/w:t>/g, '')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      }

      const aiResult = await parseWithAi(text, {
        config: aiConfig,
        onProgress: (m) => setAiProgress(m),
      });
      const dtos = aiQuestionsToDTO(aiResult.questions);
      if (!dtos.length) {
        toast.warning('AI 未识别出题目');
      } else {
        setResult({
          questions: dtos,
          warnings: [],
          errors: [],
        });
        setResultSource('ai');
        toast.success(`AI 识别到 ${dtos.length} 道题`);
      }
    } catch (e) {
      toast.error(`AI 识别失败：${(e as Error).message}`);
    } finally {
      setAiRunning(false);
      setAiProgress('');
    }
  }, [aiConfig, navigate]);

  const commit = useCallback(async () => {
    if (!result || !result.questions.length) return;
    if (!bankName.trim()) { toast.error('请输入题库名称'); return; }
    setImporting(true);
    try {
      // Q3: 入库前按 normalizeStem 去重（同一文件内重复题干只保留第一道）
      const seen = new Set<string>();
      const unique: QuestionDTO[] = [];
      for (const q of result.questions) {
        const key = normalizeStem(q.stem);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(q);
      }
      const skipped = result.questions.length - unique.length;

      const bank = await quizBankRepo.create({
        name: bankName.trim(),
        description: fileName,
        courseId: null,
        // Q2: 用 resultSource 记录的真实来源，而非提交时早已为 false 的 aiRunning
        source: resultSource,
        questionCount: unique.length,
        tags: [],
        archived: false,
      });
      const now = Date.now();
      const rows = unique.map((q: QuestionDTO, i: number) => ({
        bankId: bank.id!,
        type: q.type,
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        chapter: q.chapter,
        difficulty: q.difficulty,
        tags: q.tags,
        order: i + 1,
        source: q.source,
        createdAt: now,
        updatedAt: now,
        deletedAt: 0,
      }));
      await quizQuestionRepo.bulkCreate(rows);
      toast.success(`已导入 ${unique.length} 道题到「${bank.name}」${skipped > 0 ? `，跳过 ${skipped} 道重复题` : ''}`);
      navigate(`/quiz/bank/${bank.id}`);
    } catch (e) {
      toast.error(`入库失败：${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  }, [result, bankName, fileName, navigate, resultSource]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => navigate('/quiz')}>
          <ArrowLeft className="h-4 w-4" /> 返回
        </Button>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">导入题库</h1>
      </div>

      <GlassCard className="p-6">
        <p className="text-sm font-medium text-foreground">1. 选择题库文件</p>
        <p className="mt-1 text-xs text-muted-foreground">
          支持 .docx（Word）、.txt、.json、.md。规则解析失败时可点「AI 识别」兜底。
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.json,.md,.markdown,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPick(f);
          }}
        />
        <Button className="mt-3" onClick={() => fileRef.current?.click()}>
          <FileUp className="h-4 w-4" /> 选择文件
        </Button>
        {fileName ? <p className="mt-2 text-xs text-muted-foreground">已选：{fileName}</p> : null}
      </GlassCard>

      {result ? (
        <>
          <GlassCard className="mt-4 p-6">
            <p className="text-sm font-medium text-foreground">2. 题库信息</p>
            <label className="mt-3 block text-xs text-muted-foreground">题库名称</label>
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/70 bg-white/50 px-4 py-2.5 text-sm outline-none focus:border-primary dark:border-white/10 dark:bg-white/[0.08]"
              placeholder="输入题库名称"
            />
          </GlassCard>

          <GlassCard className="mt-4 p-6">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                3. 预览（{result.questions.length} 题，警告 {result.warnings.length}）
              </p>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={aiRunning}
                onClick={() => void handleAiParse()}
              >
                <Sparkles className="h-4 w-4" />
                {aiRunning ? `AI 识别中…${aiProgress}` : aiConfig?.apiKey ? '用 AI 重新识别' : '配置 AI 后用 AI 识别'}
              </Button>
            </div>
            {result.warnings.length ? (
              <ul className="mt-2 space-y-1 text-xs text-amber-600 dark:text-amber-400">
                {result.warnings.slice(0, 10).map((w, i) => (
                  <li key={i}>第 {w.row} 行：{w.message}</li>
                ))}
              </ul>
            ) : null}
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto text-sm">
              {result.questions.slice(0, 50).map((q, i) => (
                <li key={i} className="rounded-lg bg-muted/30 p-3">
                  <p className="text-foreground"><span className="text-muted-foreground">{i + 1}. </span>{q.stem}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    [{q.type}] 答案：{q.answer.join(' / ')} · {q.chapter}
                  </p>
                </li>
              ))}
            </ul>
          </GlassCard>

          <Button className="mt-5 w-full" size="lg" disabled={importing || aiRunning} onClick={() => void commit()}>
            <Upload className="h-4 w-4" /> {importing ? '入库中…' : `确认导入 ${result.questions.length} 题`}
          </Button>
        </>
      ) : null}
    </div>
  );
}
