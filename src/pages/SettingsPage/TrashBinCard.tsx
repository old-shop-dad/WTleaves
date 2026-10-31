// 回收站：聚合核心业务表的已删除记录，支持恢复 / 彻底删除 / 清理 30 天前
import { useCallback, useEffect, useState } from 'react';
import { ArchiveRestore, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import GlassCard from '@/components/glass/GlassCard';
import { Button } from '@/components/ui/button';
import { assignmentRepo, subtaskRepo } from '@/db/repositories/assignments';
import { budgetRepo, financeRecordRepo } from '@/db/repositories/finance';
import { habitRepo } from '@/db/repositories/lifestyle';
import { launcherItemRepo } from '@/db/repositories/launcher';
import { noteRepo } from '@/db/repositories/notes';
import { quizBankRepo } from '@/db/repositories/quiz';
import { slotRepo } from '@/db/repositories/schedule';

interface TrashEntry {
  key: string;
  kind: string;
  label: string;
  deletedAt: number;
  restore: () => Promise<void>;
  purge: () => Promise<void>;
}

const THIRTY_DAYS = 30 * 86400000;

export default function TrashBinCard() {
  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const lists = await Promise.all([
        noteRepo.listDeleted().then((rs) => rs.map((r) => ({ kind: '笔记', label: r.title, id: r.id!, deletedAt: r.deletedAt! }))),
        assignmentRepo.listDeleted().then((rs) => rs.map((r) => ({ kind: '任务', label: r.title, id: r.id!, deletedAt: r.deletedAt! }))),
        slotRepo.listDeleted().then((rs) => rs.map((r) => ({ kind: '课程', label: r.title, id: r.id!, deletedAt: r.deletedAt! }))),
        financeRecordRepo.listDeleted().then((rs) => rs.map((r) => ({ kind: '账单', label: r.note || `¥${r.amount}`, id: r.id!, deletedAt: r.deletedAt! }))),
        habitRepo.listDeleted().then((rs) => rs.map((r) => ({ kind: '习惯', label: r.name, id: r.id!, deletedAt: r.deletedAt! }))),
        launcherItemRepo.listDeleted().then((rs) => rs.map((r) => ({ kind: '入口', label: r.name, id: r.id!, deletedAt: r.deletedAt! }))),
        quizBankRepo.listDeleted().then((rs) => rs.map((r) => ({ kind: '题库', label: r.name, id: r.id!, deletedAt: r.deletedAt! }))),
      ]);
      const flat = lists.flat().sort((a, b) => b.deletedAt - a.deletedAt);
      const entries: TrashEntry[] = flat.map((e) => {
        const restore = async () => {
          const repo =
            e.kind === '笔记' ? noteRepo : e.kind === '任务' ? assignmentRepo : e.kind === '课程' ? slotRepo
            : e.kind === '账单' ? financeRecordRepo : e.kind === '习惯' ? habitRepo
            : e.kind === '入口' ? launcherItemRepo : quizBankRepo;
          await repo.restore(e.id);
          toast.success(`已恢复「${e.label}」`);
          await reload();
        };
        const purge = async () => {
          const repo =
            e.kind === '笔记' ? noteRepo : e.kind === '任务' ? assignmentRepo : e.kind === '课程' ? slotRepo
            : e.kind === '账单' ? financeRecordRepo : e.kind === '习惯' ? habitRepo
            : e.kind === '入口' ? launcherItemRepo : quizBankRepo;
          await repo.hardDelete(e.id);
          toast.success(`已彻底删除「${e.label}」`);
          await reload();
        };
        return { key: `${e.kind}-${e.id}`, kind: e.kind, label: e.label, deletedAt: e.deletedAt, restore, purge };
      });
      setEntries(entries);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const purgeOld = useCallback(async () => {
    const cutoff = Date.now() - THIRTY_DAYS;
    const repos = [noteRepo, assignmentRepo, slotRepo, financeRecordRepo, habitRepo, launcherItemRepo, quizBankRepo];
    let total = 0;
    for (const repo of repos) {
      total += await repo.purgeOlderThan(cutoff);
    }
    // 顺带清理子任务孤儿（任务硬删时子任务未级联的兜底）
    const subDeleted = await subtaskRepo.listDeleted();
    for (const s of subDeleted) {
      if ((s.deletedAt as number) < cutoff) {
        await subtaskRepo.hardDelete(s.id as number);
        total++;
      }
    }
    toast.success(total > 0 ? `已清理 ${total} 条 30 天前的记录` : '没有超过 30 天的删除记录');
    await reload();
  }, [reload]);

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <ArchiveRestore className="h-4 w-4 text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">最近删除（回收站）</h2>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void purgeOld()} disabled={loading && entries.length === 0}>
          <Trash2 className="h-3.5 w-3.5" /> 清理 30 天前
        </Button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        误删的课程、任务、笔记、账单等会先进入回收站，可在此恢复；超过 30 天的记录可一键彻底清理。
      </p>
      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">加载中…</p>
      ) : entries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">回收站是空的。</p>
      ) : (
        <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {entries.map((e) => (
            <div key={e.key} className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm">
              <span className="rounded-full bg-danger/10 px-2 py-0.5 text-[11px] text-danger">{e.kind}</span>
              <span className="min-w-0 flex-1 truncate text-foreground">{e.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtTime(e.deletedAt)}</span>
              <Button size="sm" variant="ghost" className="h-7 w-7 shrink-0 p-0" onClick={() => void e.restore()} title="恢复">
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 shrink-0 p-0 text-danger hover:bg-danger/10"
                onClick={() => void e.purge()}
                title="彻底删除"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
