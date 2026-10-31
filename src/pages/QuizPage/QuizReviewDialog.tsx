// 今日待复习弹窗：列出到期错题，就地做对/错复习（推进 box 调度）
import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { db } from '@/db/db';
import { dueAtForBox, MAX_BOX, listDueMistakes, recordMistakeAnswer } from '@/modules/quiz/engine/reviewScheduler';
import type { IMistake } from '@/db/types';

interface QuizReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReviewed: () => void;
}

export default function QuizReviewDialog({ open, onOpenChange, onReviewed }: QuizReviewDialogProps) {
  const [items, setItems] = useState<IMistake[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listDueMistakes());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  const apply = useCallback(
    async (m: IMistake, correct: boolean) => {
      const now = Date.now();
      try {
        if (m.sourceId != null) {
          await recordMistakeAnswer(m.sourceId, correct);
        } else {
          // 手动录入错题（无 sourceId）：就地推进 box
          const nextBox = correct ? Math.min((m.box ?? 0) + 1, MAX_BOX + 1) : 0;
          await db.mistakes.update(m.id!, {
            box: nextBox,
            reviewedAt: now,
            updatedAt: now,
            dueAt: nextBox > MAX_BOX ? dueAtForBox(MAX_BOX, now) : dueAtForBox(nextBox, now),
          });
        }
        toast.success(correct ? '已标记答对，进入下一轮复习' : '已标记答错，明天再复习');
        onReviewed();
        await reload();
      } catch {
        toast.error('复习记录失败');
      }
    },
    [onReviewed, reload],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>今日待复习</DialogTitle>
          <DialogDescription>按间隔重复调度到期错题，答对推进、答错明天再来</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">加载中…</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">今天没有待复习的错题 🎉</p>
          ) : (
            items.map((m) => (
              <div key={m.id} className="rounded-xl border border-white/60 bg-white/50 p-3 dark:border-white/10 dark:bg-white/[0.05]">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{m.subject}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    box {Math.min(m.box ?? 0, MAX_BOX)} · 到期
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">{m.question}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">答案：{m.answer}</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => void apply(m, true)}>
                    <Check className="h-3.5 w-3.5" /> 答对了
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-xs text-danger hover:bg-danger/10" onClick={() => void apply(m, false)}>
                    <X className="h-3.5 w-3.5" /> 还不会
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
