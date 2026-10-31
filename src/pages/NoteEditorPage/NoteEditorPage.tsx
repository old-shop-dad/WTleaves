// 笔记编辑器：Markdown 编辑、防抖自动保存、历史快照、标签、删除
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Camera, Check, Download, History, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import GlassCard from '@/components/glass/GlassCard';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { db } from '@/db/db';
import { noteRepo, snapshotRepo } from '@/db/repositories/notes';
import { seedIfEmpty } from '@/data/seed';
import MilkdownEditor from './MilkdownEditor';
import type { INote, INoteSnapshot } from '@/db/types';

const MAX_SNAPSHOTS = 20;

export default function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [note, setNote] = useState<INote | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<INoteSnapshot[]>([]);
  const [restoreTick, setRestoreTick] = useState(0);
  const debounceRef = useRef<number | null>(null);
  const contentRef = useRef('');
  const dirtyRef = useRef(false);
  // 始终持有最新 note，供卸载/beforeunload 的闭包读取，避免 stale closure 拿不到 id
  const noteRef = useRef<INote | null>(null);
  useEffect(() => { noteRef.current = note; }, [note]);

  const fetchNote = useCallback(async (): Promise<INote | null> => {
    await seedIfEmpty();
    if (!id || isNew) return null;
    return noteRepo.get(Number(id));
  }, [id, isNew]);

  const applyNote = useCallback(
    (n: INote | null) => {
      if (!n) {
        toast.error('笔记不存在');
        navigate('/notes');
        return;
      }
      setNote(n);
      contentRef.current = n.content;
    },
    [navigate],
  );

  useEffect(() => {
    if (isNew) {
      // N1：新建不立即落库空笔记，首次输入时才创建
      const draft: INote = { id: undefined, title: '', content: '', format: 'markdown', tags: [], quick: false };
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNote(draft);
      contentRef.current = '';
      return;
    }
    fetchNote()
      .then(applyNote)
      .catch(() => toast.error('加载笔记失败'));
  }, [fetchNote, applyNote, isNew]);

  // N1：首次输入时创建笔记，之后路由替换到真实 id
  const ensureNote = useCallback(
    async (title: string, content: string): Promise<INote> => {
      const cur = noteRef.current;
      if (cur?.id != null) return cur;
      const created = await noteRepo.create({
        title: title.trim() || '未命名笔记',
        content,
        format: 'markdown',
        tags: [],
        quick: false,
      });
      setNote(created);
      noteRef.current = created;
      contentRef.current = created.content;
      navigate(`/notes/${created.id}`, { replace: true });
      return created;
    },
    [navigate],
  );

  // 卸载前补一份快照（内容有变化时）
  const snapshotOnLeave = useCallback(() => {
    const current = contentRef.current;
    const n = noteRef.current;
    if (!dirtyRef.current || !n?.id) return;
    void (async () => {
      try {
        const noteId = n.id as number;
        const all = (await snapshotRepo.list())
          .filter((s) => s.noteId === noteId)
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        if (all[0]?.content === current) {
          dirtyRef.current = false;
          return;
        }
        await snapshotRepo.create({ noteId, content: current });
        // E2：dirtyRef=false 移到 create 成功之后，创建失败不会永久吞掉后续快照
        dirtyRef.current = false;
        const rest = (await snapshotRepo.list())
          .filter((s) => s.noteId === noteId)
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
        for (const old of rest.slice(MAX_SNAPSHOTS)) {
          if (old.id != null) await snapshotRepo.softDelete(old.id);
        }
      } catch {
        // 卸载快照尽力而为，不阻断
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      // 卸载兜底：清除未触发的防抖定时器，把最后一次输入立即落库，避免 800ms 内切走丢内容
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const n = noteRef.current;
      if (dirtyRef.current && n?.id != null) {
        void noteRepo.update(n.id, { content: contentRef.current });
      }
      snapshotOnLeave();
    };
  }, [snapshotOnLeave]);

  // 关闭标签页/刷新兜底 flush（IndexedDB 写入尽力而为）
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const n = noteRef.current;
      if (dirtyRef.current && n?.id != null) {
        void noteRepo.update(n.id, { content: contentRef.current });
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const scheduleSave = useCallback(
    (md: string) => {
      contentRef.current = md;
      dirtyRef.current = true;
      setSaveState('saving');
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void (async () => {
          try {
            let n = noteRef.current;
            if (!n || n.id == null) {
              // N1：新笔记首次输入时创建
              n = await ensureNote(noteRef.current?.title ?? '', md);
            }
            await noteRepo.update(n.id, { content: md });
            dirtyRef.current = false;
            setSaveState('saved');
          } catch {
            toast.error('保存失败');
          }
        })();
      }, 800);
    },
    [ensureNote],
  );

  const saveTitle = useCallback(
    async (title: string) => {
      const next = title.trim() || '未命名笔记';
      let n = noteRef.current;
      try {
        if (!n || n.id == null) {
          n = await ensureNote(next, contentRef.current);
        }
        await noteRepo.update(n.id, { title: next });
        setNote((prev) => (prev ? { ...prev, title: next } : prev));
      } catch {
        toast.error('标题保存失败');
      }
    },
    [ensureNote],
  );

  const saveTags = useCallback(
    async (raw: string) => {
      const n = noteRef.current;
      if (!n || n.id == null) return;
      const tags = raw
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8);
      await noteRepo.update(n.id, { tags });
      setNote((prev) => (prev ? { ...prev, tags } : prev));
    },
    [],
  );

  // E3：手动快照不受 dirty 限制，只要内容非空就创建
  const takeSnapshot = useCallback(async () => {
    const n = noteRef.current;
    if (!n || n.id == null) { toast.message('请先输入内容'); return; }
    const current = contentRef.current;
    if (!current.trim()) { toast.message('内容为空，无需快照'); return; }
    try {
      await snapshotRepo.create({ noteId: n.id, content: current });
      const all = (await snapshotRepo.list())
        .filter((s) => s.noteId === n.id)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      for (const old of all.slice(MAX_SNAPSHOTS)) {
        if (old.id != null) await snapshotRepo.softDelete(old.id);
      }
      toast.success('快照已保存');
    } catch {
      toast.error('快照保存失败');
    }
  }, []);

  // 阶段三：历史版本列表（快照只写不读 → 补查看/还原闭环）
  const openHistory = useCallback(async () => {
    const n = noteRef.current;
    if (!n || n.id == null) { toast.message('请先输入内容'); return; }
    const all = (await snapshotRepo.list())
      .filter((s) => s.noteId === n.id)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    setSnapshots(all);
    setHistoryOpen(true);
  }, []);

  const restoreSnapshot = useCallback(
    async (s: INoteSnapshot) => {
      const n = noteRef.current;
      if (!n || n.id == null) return;
      try {
        await noteRepo.update(n.id, { content: s.content });
        contentRef.current = s.content;
        dirtyRef.current = false;
        setNote((prev) => (prev ? { ...prev, content: s.content } : prev));
        setRestoreTick((t) => t + 1); // 强制重挂编辑器加载还原内容
        setHistoryOpen(false);
        toast.success('已还原到该版本');
      } catch {
        toast.error('还原失败');
      }
    },
    [],
  );

  // E4+E6：删除前 flush 标题/内容，并在事务中级联软删 snapshots/attachments
  const doDelete = useCallback(async () => {
    const n = noteRef.current;
    if (!n?.id) return;
    try {
      await noteRepo.update(n.id, { title: n.title.trim() || '未命名笔记', content: contentRef.current });
    } catch { /* flush 失败不阻断删除 */ }
    try {
      await db.transaction('rw', db.notes, db.note_snapshots, db.attachments, async () => {
        const noteRow = await db.notes.get(n.id as number);
        if (noteRow && !noteRow.deletedAt) {
          await db.notes.put({ ...noteRow, deletedAt: Date.now(), updatedAt: Date.now() });
        }
        const snaps = await db.note_snapshots.where('noteId').equals(n.id as number).toArray();
        for (const s of snaps) {
          if (!s.deletedAt) await db.note_snapshots.put({ ...s, deletedAt: Date.now() });
        }
        const atts = await db.attachments.where('noteId').equals(n.id as number).toArray();
        for (const a of atts) {
          if (!a.deletedAt) await db.attachments.put({ ...a, deletedAt: Date.now() });
        }
      });
      toast.success('笔记已删除');
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`);
    }
    navigate('/notes');
  }, [navigate]);

  // 阶段四：导出笔记为 PDF（Electron 端 printToPDF + 保存对话框；Web 降级浏览器打印）
  const exportPdf = useCallback(async () => {
    try {
      // 先把未落盘的编辑立即保存
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const n = noteRef.current;
      if (dirtyRef.current && n?.id != null) {
        await noteRepo.update(n.id, { content: contentRef.current });
        dirtyRef.current = false;
        setSaveState('saved');
      }
    } catch { /* 保存失败不阻断导出 */ }
    const api = (window as unknown as { electronAPI?: { printNoteToPdf?: (title: string) => Promise<{ ok: boolean; filePath?: string; reason?: string }> } }).electronAPI;
    if (api?.printNoteToPdf) {
      try {
        const r = await api.printNoteToPdf(noteRef.current?.title ?? '笔记');
        if (r.ok) toast.success(`已导出 PDF：${r.filePath}`);
        else if (r.reason === 'cancelled') { /* 用户取消 */ }
        else toast.error(`导出失败：${r.reason ?? '未知原因'}`);
      } catch (e) {
        toast.error(`导出失败：${(e as Error).message}`);
      }
      return;
    }
    // Web 环境降级：浏览器打印对话框，用户可选"另存为 PDF"
    const saved = document.body.classList.contains('printing-note');
    document.body.classList.add('printing-note');
    try {
      window.print();
    } finally {
      if (!saved) document.body.classList.remove('printing-note');
    }
  }, []);

  if (!note) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载笔记…
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-30 -mx-4 mb-4 flex flex-wrap items-center gap-2.5 rounded-2xl border border-white/40 bg-white/70 px-3 py-2.5 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/70 no-print sm:-mx-6 sm:px-4">
        <button
          type="button"
          onClick={() => navigate('/notes')}
          className="flex h-9 items-center gap-1.5 rounded-full border border-white/60 bg-white/80 px-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-white dark:border-white/10 dark:bg-white/[0.1] dark:hover:bg-white/[0.16]"
          title="返回笔记列表"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>返回笔记</span>
        </button>
        <Input
          value={note.title}
          onChange={(e) => setNote((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
          onBlur={(e) => void saveTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="未命名笔记"
          className="h-9 max-w-sm border-none bg-transparent px-0 text-lg font-bold text-foreground shadow-none focus-visible:ring-0"
        />
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {saveState === 'saving' ? (
            '保存中…'
          ) : saveState === 'saved' ? (
            <span className="flex items-center gap-1 text-success">
              <Check className="h-3.5 w-3.5" /> 已保存
            </span>
          ) : (
            `上次编辑 ${note.updatedAt ? format(new Date(note.updatedAt), 'M月d日 HH:mm') : '—'}`
          )}
        </span>
        <Button variant="outline" size="sm" onClick={() => void takeSnapshot()}>
          <Camera className="h-3.5 w-3.5" /> 快照
        </Button>
        <Button variant="outline" size="sm" onClick={() => void openHistory()}>
          <History className="h-3.5 w-3.5" /> 历史
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportPdf()}>
          <Download className="h-3.5 w-3.5" /> 导出 PDF
        </Button>
        <Button variant="outline" size="sm" className="text-danger hover:bg-danger/10" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-3.5 w-3.5" /> 删除
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 no-print">
        <Input
          key={note.id ?? 'new'}
          defaultValue={note.tags.join('，')}
          onBlur={(e) => void saveTags(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          placeholder="标签（逗号分隔）"
          className="h-8 w-56 rounded-full bg-white/40 text-xs dark:bg-white/[0.06]"
        />
        <span className="text-[11px] text-muted-foreground">内容自动保存，离开时生成快照</span>
      </div>

      <GlassCard className="p-2 sm:p-4">
        <div className="milkdown-glass">
          <MilkdownEditor key={`${note.id ?? 'new'}-${restoreTick}`} initialContent={note.content} onUpdate={scheduleSave} />
        </div>
      </GlassCard>

      {/* 历史版本 */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>历史版本</DialogTitle>
            <DialogDescription>快照在离开页面或手动保存时生成，最多保留 {MAX_SNAPSHOTS} 份</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {snapshots.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">还没有历史版本，编辑内容后离开页面会自动生成快照</p>
            ) : (
              snapshots.map((s) => (
                <div key={s.id} className="rounded-xl border border-white/60 bg-white/50 p-3 dark:border-white/10 dark:bg-white/[0.05]">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {s.createdAt ? format(new Date(s.createdAt), 'M月d日 HH:mm:ss') : '—'}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto h-7 text-xs"
                      onClick={() => void restoreSnapshot(s)}
                    >
                      <RotateCcw className="h-3 w-3" /> 还原到此刻
                    </Button>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {s.content.slice(0, 200) || '（空内容）'}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 移动端悬浮返回按钮（兜底，滚动到任何位置都可见） */}
      <button
        type="button"
        onClick={() => navigate('/notes')}
        className="fixed bottom-20 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-lg dark:bg-primary sm:hidden"
        title="返回笔记列表"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除笔记</AlertDialogTitle>
            <AlertDialogDescription>确定删除「{note.title || '未命名笔记'}」吗？删除后无法恢复，历史快照与附件将一并删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doDelete()}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
