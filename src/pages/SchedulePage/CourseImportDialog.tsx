// 课程导入对话框：网格/扁平/CSV 规则解析 + AI 兜底 + 可编辑周次预览
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Sparkles, FileText,
  Undo2, Loader2, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { slotRepo, type BulkImportSlotInput } from '@/db/repositories/schedule';
import { settingsRepo } from '@/db/repositories/settings';
import { COURSE_COLORS } from '@/data/course';
import { extractTextFromFile } from '@/modules/schedule/ai/extractText';
import { parseCoursesWithAi } from '@/modules/schedule/ai/client';
import { parseScheduleRows, parseCsvText, type ParsedCourse } from '@/modules/schedule/import';
import { parseIcsCourses } from '@/modules/schedule/ics';
import { DEFAULT_PERIODS, type Period } from '@/lib/schedule/periods';
import { formatWeekPattern, parseWeekText } from '@/lib/semester';
import type { AiCourse } from '@/modules/schedule/ai/types';
import type { IScheduleSlot } from '@/db/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterId: number | null;
  totalWeeks?: number;
  periods?: Period[];
  /** 学期开始日期（ICS 导入时用于换算周次） */
  semesterStart?: string;
  onImported: () => void;
}

interface RowPreview extends ParsedCourse {
  color: string;
  weekInput: string;
  error?: string;
}

interface LastImport {
  ids: number[];
  before: IScheduleSlot[];
  at: number;
  semesterId: number;
}

const UNDO_KEY = 'schedule.lastCourseImport';

function randomColor(): string {
  return COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)];
}

function toRow(c: ParsedCourse, totalWeeks: number): RowPreview {
  return {
    ...c,
    color: randomColor(),
    weekInput: c.weeksText ?? formatWeekPattern(c.weekPattern, totalWeeks),
    error: c.error,
  };
}

function rowKey(r: ParsedCourse, totalWeeks: number): string {
  return `${r.title}|${r.dayOfWeek}|${r.startMin}|${r.endMin}|${formatWeekPattern(r.weekPattern, totalWeeks)}`;
}

function aiToParsed(c: AiCourse, totalWeeks: number): ParsedCourse {
  const weekPattern = typeof c.weekPattern === 'string'
    ? ({ type: c.weekPattern } as ParsedCourse['weekPattern'])
    : c.weekPattern;
  return {
    title: c.title,
    dayOfWeek: c.dayOfWeek,
    startMin: c.startMin,
    endMin: c.endMin,
    location: c.location,
    teacher: c.teacher,
    weekPattern,
    weeksText: c.weeksText || formatWeekPattern(weekPattern, totalWeeks),
    periodStart: c.periodStart,
    periodEnd: c.periodEnd,
  };
}

export default function CourseImportDialog({
  open,
  onOpenChange,
  semesterId,
  totalWeeks = 20,
  periods = DEFAULT_PERIODS,
  semesterStart,
  onImported,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RowPreview[]>([]);
  const [rawText, setRawText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastImport, setLastImport] = useState<LastImport | null>(null);

  useEffect(() => {
    if (!open) return;
    settingsRepo.get<LastImport | null>(UNDO_KEY, null).then((v) => {
      setLastImport(v && v.ids.length > 0 ? { ...v, before: v.before ?? [] } : null);
    });
  }, [open]);

  const addCourses = useCallback((courses: ParsedCourse[], sourceWarnings: string[]) => {
    setRows((prev) => {
      const seen = new Set(prev.map((r) => rowKey(r, totalWeeks)));
      const next = [...prev];
      for (const c of courses) {
        const k = rowKey(c, totalWeeks);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(toRow(c, totalWeeks));
      }
      return next;
    });
    if (sourceWarnings.length > 0) {
      setWarnings((prev) => [...new Set([...prev, ...sourceWarnings])].slice(0, 12));
    }
  }, [totalWeeks]);

  const parseWorkbook = useCallback(async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      toast.error('Excel 文件里没有工作表');
      return;
    }
    let total = 0;
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const gridRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1, defval: '', raw: false,
      }) as unknown[][];
      if (gridRows.length === 0) continue;
      const merges = (sheet['!merges'] ?? []).map((m) => ({
        s: { r: m.s.r, c: m.s.c },
        e: { r: m.e.r, c: m.e.c },
      }));
      const result = parseScheduleRows(gridRows, merges, { totalWeeks, periods });
      if (result.courses.length > 0) {
        total += result.courses.length;
        addCourses(result.courses, result.warnings);
      }
    }
    if (total === 0) {
      toast.info('规则解析没有识别到课程，可尝试 AI 解析');
    } else {
      toast.success(`规则解析：识别到 ${total} 门课，请在预览中核对周次`);
    }
    // 同时提取文本，便于 AI 兜底
    try {
      const text = await extractTextFromFile(file);
      setRawText(typeof text === 'string' ? text : String(text ?? ''));
    } catch { /* 非致命 */ }
  }, [addCourses, periods, totalWeeks]);

  const handleFilePick = useCallback(async (file: File) => {
    const name = file.name.toLowerCase();
    setParsing(true);
    setRows([]);
    setWarnings([]);
    setProgress('解析文件中…');
    try {
      if (name.endsWith('.csv')) {
        const text = await file.text();
        const result = parseCsvText(text, { totalWeeks, periods });
        if (result.courses.length > 0) {
          addCourses(result.courses, result.warnings);
          toast.success(`CSV 解析：识别到 ${result.courses.length} 门课`);
        } else {
          setRawText(text);
          toast.info('CSV 规则解析失败，可点「AI 解析」');
        }
      } else if (name.endsWith('.ics')) {
        if (!semesterStart) {
          toast.error('请先在设置中填写学期开始日期，再导入 ICS');
          return;
        }
        const text = await file.text();
        const courses = parseIcsCourses(text, { startDate: semesterStart, totalWeeks });
        if (courses.length === 0) {
          toast.error('ICS 中没有落在本学期的课程');
          return;
        }
        addCourses(courses.map((c) => ({ ...c, source: 'ICS 导入' })), ['ICS 已按学期第 1 周的周一换算周次']);
        toast.success(`ICS 解析：识别到 ${courses.length} 门课`);
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        await parseWorkbook(file);
      } else {
        const text = await extractTextFromFile(file);
        if (!text || !text.trim()) {
          toast.error('文件内容为空，没有可识别的文字');
          return;
        }
        setRawText(text);
        setProgress('文本已提取，点「AI 解析」识别课程');
        toast.success(`已提取 ${text.length} 字，点「AI 解析」识别`);
      }
    } catch (e) {
      toast.error(`解析失败：${(e as Error).message}`);
    } finally {
      setParsing(false);
      setProgress('');
    }
  }, [addCourses, parseWorkbook, periods, semesterStart, totalWeeks]);

  const handleAiParse = useCallback(async () => {
    if (!rawText.trim()) {
      toast.info('请先上传文件或粘贴课程表文字');
      return;
    }
    setParsing(true);
    setProgress('调用 AI 解析中…');
    try {
      const courses = await parseCoursesWithAi(rawText, (msg) => setProgress(msg), {
        totalWeeks,
        periods,
      });
      if (courses.length === 0) {
        toast.info('AI 没有识别到课程，请检查文本');
        return;
      }
      addCourses(courses.map((c) => aiToParsed(c, totalWeeks)), []);
      toast.success(`AI 识别出 ${courses.length} 门课`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setParsing(false);
      setProgress('');
    }
  }, [addCourses, periods, rawText, totalWeeks]);

  const updateWeekInput = (index: number, value: string) => {
    setRows((prev) => prev.map((row, i) => {
      if (i !== index) return row;
      const pattern = parseWeekText(value, totalWeeks);
      return {
        ...row,
        weekInput: value,
        weekPattern: pattern ?? row.weekPattern,
        error: pattern ? undefined : '周次格式错（示例 1-16周 / 1-8,10-16周 / 单周）',
      };
    }));
  };

  const updateTitle = (index: number, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, title: value } : row)));
  };

  const validRows = useMemo(
    () => rows.filter((r) => !r.error && r.title.trim() && r.weekInput.trim()),
    [rows],
  );
  const badCount = rows.length - validRows.length;

  const undoImport = useCallback(async (record: LastImport) => {
    const before = record.before ?? [];
    setImporting(true);
    setProgress('撤销中…');
    try {
      await slotRepo.softDeleteMany(record.ids);
      if (before.length > 0) await slotRepo.restore(before);
      await settingsRepo.remove(UNDO_KEY);
      setLastImport(null);
      toast.success(`已撤销本次导入（${record.ids.length} 门新增${before.length > 0 ? `，${before.length} 门恢复` : ''}）`);
      onImported();
    } catch (e) {
      toast.error(`撤销失败：${(e as Error).message}`);
    } finally {
      setImporting(false);
      setProgress('');
    }
  }, [onImported]);

  const doImport = useCallback(async () => {
    if (validRows.length === 0) {
      toast.error('没有可导入的有效行');
      return;
    }
    if (semesterId == null) {
      toast.error('请先在设置页设置当前学期');
      return;
    }
    setImporting(true);
    setProgress('准备写入…');
    try {
      const payload: BulkImportSlotInput[] = validRows.map((r) => ({
        semesterId,
        title: r.title.trim(),
        dayOfWeek: r.dayOfWeek,
        startMin: Math.max(0, Math.min(r.startMin, 1440)),
        endMin: Math.max(0, Math.min(r.endMin, 1440)),
        location: r.location,
        teacher: r.teacher,
        weekPattern: r.weekPattern as BulkImportSlotInput['weekPattern'],
        weeksText: r.weekInput,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        color: r.color,
      }));

      const result = await slotRepo.bulkImport(payload, semesterId, {
        mode,
        onProgress: (done, total) => setProgress(`写入课程 ${done}/${total}…`),
      });

      if (result.created.length === 0 && result.updated.length === 0) {
        toast.info(`没有需要写入的课程（${result.skippedDuplicate} 条已存在）`);
        return;
      }

      const ids = result.created.map((c) => c.id as number);
      const record: LastImport = {
        ids,
        before: result.before,
        at: Date.now(),
        semesterId,
      };
      await settingsRepo.set(UNDO_KEY, record);
      setLastImport(record);

      const parts = [`新增 ${result.created.length} 门`];
      if (result.updated.length > 0) parts.push(`更新 ${result.updated.length} 门`);
      if (result.skippedDuplicate > 0) parts.push(`跳过 ${result.skippedDuplicate} 条重复`);
      toast.success(parts.join('，'), {
        action: ids.length > 0
          ? { label: '撤销', onClick: () => void undoImport(record) }
          : undefined,
      });
      setRows([]);
      setRawText('');
      setWarnings([]);
      setProgress('');
      onOpenChange(false);
      onImported();
    } catch (e) {
      toast.error(`导入失败：${(e as Error).message}`);
    } finally {
      setImporting(false);
      setProgress('');
    }
  }, [mode, onImported, onOpenChange, semesterId, undoImport, validRows]);

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (importing) return;
      setWarnings([]);
      if (!o) { setRows([]); setRawText(''); setProgress(''); }
      onOpenChange(o);
    }}>
      <DialogContent className="!flex max-h-[92vh] max-w-5xl flex-col overflow-y-auto">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> 导入课程
          </DialogTitle>
          <DialogDescription>
            支持教务 Excel 网格表、扁平表、WakeUp CSV、Word/PDF/文本；规则解析后可逐行核对并修正周次再导入。
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.ics,.txt,.docx,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFilePick(f);
            e.target.value = '';
          }}
        />

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={parsing || importing}>
            <Upload className="h-4 w-4" /> 选择文件
          </Button>
          <Button variant="secondary" onClick={() => void handleAiParse()} disabled={parsing || importing || !rawText.trim()}>
            <Sparkles className="h-4 w-4" /> AI 解析
          </Button>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            导入方式
            <Select value={mode} onValueChange={(v) => setMode(v as 'merge' | 'replace')}>
              <SelectTrigger className="h-8 w-[132px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="merge">合并（跳过重复）</SelectItem>
                <SelectItem value="replace">覆盖同位置课程</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {lastImport && lastImport.ids.length > 0 && (
            <Button
              variant="ghost"
              className="text-warning-foreground"
              disabled={importing || parsing}
              onClick={() => void undoImport(lastImport)}
            >
              <Undo2 className="h-4 w-4" /> 撤销上次导入（{lastImport.ids.length}）
            </Button>
          )}
          {(parsing || importing) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
        </div>

        <Textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="也可以直接粘贴从教务系统 / PDF / 图片 OCR 复制的课程表文字，然后点「AI 解析」"
          rows={3}
          className="shrink-0 font-mono text-xs"
        />

        {warnings.length > 0 && (
          <details className="shrink-0 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <summary className="flex cursor-pointer items-center gap-1">
              <Info className="h-3.5 w-3.5" /> 解析提示（{warnings.length}）
            </summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </details>
        )}

        <div className="min-h-[120px] overflow-auto">
          {rows.length > 0 ? (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                <tr className="border-b border-border/60 text-left">
                  <th className="p-2 font-medium">课程名</th>
                  <th className="p-2 font-medium">星期</th>
                  <th className="p-2 font-medium">时间</th>
                  <th className="p-2 font-medium">周次（可改）</th>
                  <th className="p-2 font-medium">地点</th>
                  <th className="p-2 font-medium">老师</th>
                  <th className="p-2 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${i}-${r.title}`} className="border-b border-border/30 align-top">
                    <td className="p-1.5">
                      <Input
                        value={r.title}
                        onChange={(e) => updateTitle(i, e.target.value)}
                        className="h-8 min-w-[120px] text-xs"
                      />
                    </td>
                    <td className="p-2">{['日', '一', '二', '三', '四', '五', '六'][r.dayOfWeek]}</td>
                    <td className="whitespace-nowrap p-2 tabular-nums">
                      {String(Math.floor(r.startMin / 60)).padStart(2, '0')}:{String(r.startMin % 60).padStart(2, '0')}
                      {' - '}
                      {String(Math.floor(r.endMin / 60)).padStart(2, '0')}:{String(r.endMin % 60).padStart(2, '0')}
                    </td>
                    <td className="p-1.5">
                      <Input
                        value={r.weekInput}
                        onChange={(e) => updateWeekInput(i, e.target.value)}
                        className={`h-8 min-w-[148px] text-xs ${r.error ? 'border-destructive' : ''}`}
                      />
                    </td>
                    <td className="max-w-[120px] truncate p-2">{r.location || '-'}</td>
                    <td className="max-w-[90px] truncate p-2">{r.teacher || '-'}</td>
                    <td className="p-2">
                      {r.error ? (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertTriangle className="h-3 w-3" />{r.error}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-success">
                          <CheckCircle2 className="h-3 w-3" />有效
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/60 bg-muted/20 text-muted-foreground">
              <FileText className="h-6 w-6" />
              <p className="text-xs">选择文件或粘贴文本后，解析结果会显示在这里</p>
              <p className="text-[11px]">Excel 网格 / 扁平表 / WakeUp CSV 走规则解析；Word/PDF 走 AI</p>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 shrink-0 border-t pt-3">
          <Button variant="outline" onClick={() => { setRows([]); setRawText(''); setWarnings([]); }} disabled={importing || parsing}>
            清空
          </Button>
          <Button onClick={() => void doImport()} disabled={validRows.length === 0 || importing || parsing}>
            {importing ? '导入中…' : `导入 ${validRows.length} 门${badCount > 0 ? `（跳过 ${badCount} 行）` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
