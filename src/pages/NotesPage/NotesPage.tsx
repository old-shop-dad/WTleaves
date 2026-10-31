// 笔记列表页：标题 / 标签 / 更新时间 / 新建 / 删除
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { NotebookPen, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import GlassCard from '@/components/glass/GlassCard';
import EmptyState from '@/components/glass/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { noteRepo } from '@/db/repositories/notes';
import { seedIfEmpty } from '@/data/seed';
import { NotebookText } from 'lucide-react';
import { extractSummary } from '@/lib/notes';
import type { INote } from '@/db/types';

export default function NotesPage() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<INote[] | null>(null);
  const [deleting, setDeleting] = useState<INote | null>(null);
  const [query, setQuery] = useState('');

  const fetchData = useCallback(async (): Promise<INote[]> => {
    await seedIfEmpty();
    return noteRepo.list();
  }, []);

  const reload = useCallback(() => {
    fetchData()
      .then(setNotes)
      .catch((e) => toast.error(`加载失败：${(e as Error).message}`));
  }, [fetchData]);

  useEffect(() => {
    reload();
  }, [reload]);

  // N1：新建不立即落库空笔记，跳编辑器后首次输入才创建
  const createNote = useCallback(() => {
    navigate('/notes/new');
  }, [navigate]);

  const confirmDelete = useCallback(async () => {
    if (deleting?.id != null) {
      try {
        // 级联软删：笔记 + 快照 + 附件，避免孤儿数据残留
        await db.transaction('rw', db.notes, db.note_snapshots, db.attachments, async () => {
          await noteRepo.softDelete(deleting.id!);
          const snaps = await db.note_snapshots.where('noteId').equals(deleting.id).toArray();
          for (const s of snaps) {
            if (!s.deletedAt) await db.note_snapshots.put({ ...s, deletedAt: Date.now(), updatedAt: Date.now() });
          }
          const atts = await db.attachments.where('noteId').equals(deleting.id).toArray();
          for (const a of atts) {
            if (!a.deletedAt) await db.attachments.put({ ...a, deletedAt: Date.now(), updatedAt: Date.now() });
          }
        });
        toast.success('笔记已删除');
      } catch (e) {
        toast.error(`删除失败：${(e as Error).message}`);
      }
      setDeleting(null);
      reload();
    }
  }, [deleting, reload]);

  // N3：按标题 + 内容过滤
  const filtered = useMemo(() => {
    const list = notes ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }, [notes, query]);

  if (!notes) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载笔记…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">笔记</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{notes.length} 篇笔记 · Markdown 编辑</p>
        </div>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索标题 / 内容 / 标签…"
            className="h-9 w-56 pl-8"
          />
        </div>
        <Button onClick={() => void createNote()}>
          <Plus className="h-4 w-4" /> 新建笔记
        </Button>
      </div>

      {filtered.length === 0 ? (
        <GlassCard>
          <EmptyState
            title={notes.length === 0 ? '还没有笔记' : '没有匹配的笔记'}
            description={notes.length === 0 ? '记录课堂要点、灵感和读书摘录' : '换个关键词试试'}
            icon={<NotebookText className="h-6 w-6" />}
            actionLabel={notes.length === 0 ? '新建笔记' : undefined}
            onAction={notes.length === 0 ? () => void createNote() : undefined}
          />
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((n) => (
            <GlassCard key={n.id} className="group p-4">
              <button type="button" onClick={() => navigate(`/notes/${n.id}`)} className="block w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">{n.title}</h2>
                  <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                </div>
                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {extractSummary(n.content, 120) || '空白笔记'}
                </p>
              </button>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-1">
                  {n.tags.slice(0, 3).map((t) => (
                    <span key={t} className="rounded-full bg-accent/70 px-2 py-px text-[10px] text-accent-foreground">
                      #{t}
                    </span>
                  ))}
                  {n.tags.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground/70">
                      {format(new Date(n.updatedAt ?? n.createdAt ?? 0), 'M月d日 HH:mm')}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => setDeleting(n)}
                  className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                  title="删除笔记"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <AlertDialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除笔记</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{deleting?.title}」吗？历史快照将一并保留但不可访问。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
