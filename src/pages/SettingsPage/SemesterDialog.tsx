// 学期编辑对话框：名称 / 起止日期 / 设为当前学期
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { semesterRepo } from '@/db/repositories/semesters';
import { firstMondayOf } from '@/lib/semester';
import type { ISemester } from '@/db/types';

function fmtDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

interface SemesterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semester: ISemester | null;
  onSaved: () => void;
}

function weeksBetween(start: string, end: string): number {
  if (!start || !end) return 18;
  // S6: 本地时区解析，避免 UTC 差一天
  const diff = new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime();
  if (Number.isNaN(diff) || diff < 0) return 18;
  return Math.max(1, Math.round(diff / (7 * 24 * 3600 * 1000)) + 1);
}

export default function SemesterDialog({ open, onOpenChange, semester, onSaved }: SemesterDialogProps) {
  // 父组件通过 key 在打开时强制重挂载，确保 state 从最新 semester 初始化
  const [name, setName] = useState(semester?.name ?? '');
  const [start, setStart] = useState(semester?.startDate ?? '');
  const [end, setEnd] = useState(semester?.endDate ?? '');

  const submit = async () => {
    if (!name.trim()) {
      toast.error('请填写学期名称');
      return;
    }
    // 周次引擎依赖开始日期；结束日期用于判断学期是否结束
    if (!start || !end) {
      toast.error('请填写学期开始日期和结束日期');
      return;
    }
    // S6: end < start 校验
    if (new Date(end + 'T00:00:00').getTime() < new Date(start + 'T00:00:00').getTime()) {
      toast.error('结束日期不能早于开始日期');
      return;
    }
    const payload = {
      name: name.trim(),
      startDate: start,
      endDate: end,
      totalWeeks: weeksBetween(start, end),
      isCurrent: semester?.isCurrent ?? true,
    };
    if (semester?.id != null) {
      await semesterRepo.update(semester.id, payload);
      toast.success('学期已更新');
    } else {
      await semesterRepo.create(payload);
      toast.success('学期已创建');
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{semester ? '编辑学期' : '新建学期'}</DialogTitle>
          <DialogDescription>设置学期名称与起止日期，课表与任务按学期归档。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="sem-name">学期名称</Label>
            <Input id="sem-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：2026 秋季学期" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sem-start">开始日期</Label>
              <Input id="sem-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sem-end">结束日期</Label>
              <Input id="sem-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {start && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {firstMondayOf(start)
                ? `第 1 周：${fmtDate(firstMondayOf(start) as Date)}（周一）起算；单双周与指定周次都以这里为基准。`
                : '开始日期格式无效，请重新选择。'}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void submit()}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
