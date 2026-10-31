// 任务表单：新增 / 编辑任务（类型、优先级、截止、预计时长、备注）
import { useState } from 'react';
import { format } from 'date-fns';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { assignmentRepo } from '@/db/repositories/assignments';
import { TYPE_OPTIONS, PRIORITY_OPTIONS } from './task-meta';
import type { AssignmentPriority, AssignmentType, IAssignment } from '@/db/types';

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: IAssignment | null;
  onSaved: () => void;
}

export default function TaskFormDialog({ open, onOpenChange, initial, onSaved }: TaskFormDialogProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [type, setType] = useState<AssignmentType>(initial?.type ?? 'homework');
  const [priority, setPriority] = useState<AssignmentPriority>(initial?.priority ?? 'medium');
  const [dueDate, setDueDate] = useState(initial ? format(new Date(initial.dueAt), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
  const [dueTime, setDueTime] = useState(initial ? format(new Date(initial.dueAt), 'HH:mm') : '23:59');
  const [estimatedMin, setEstimatedMin] = useState(initial?.estimatedMin != null ? String(initial.estimatedMin) : '');
  const [note, setNote] = useState(initial?.note ?? '');

  const submit = async () => {
    if (!title.trim()) {
      toast.error('请填写任务标题');
      return;
    }
    // K2：截止日期为空时 dueAt 设为 undefined（不写 NaN 入库）
    const dueAt = dueDate ? new Date(`${dueDate}T${dueTime || '23:59'}:00`).getTime() : undefined;
    if (dueAt != null && Number.isNaN(dueAt)) {
      toast.error('截止日期格式不正确');
      return;
    }
    // K7：estimatedMin 校验 NaN/负数，非法值丢弃
    const estRaw = estimatedMin.trim();
    const estNum = estRaw ? Number(estRaw) : NaN;
    const estMin = Number.isFinite(estNum) && estNum >= 0 ? Math.round(estNum) : undefined;
    const payload = {
      title: title.trim(),
      type,
      priority,
      dueAt,
      estimatedMin: estMin,
      note: note.trim() || undefined,
    };
    if (initial?.id != null) {
      await assignmentRepo.update(initial.id, payload);
      toast.success('任务已更新');
    } else {
      await assignmentRepo.create({ ...payload, status: 'todo' });
      toast.success('任务已添加');
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑任务' : '添加任务'}</DialogTitle>
          <DialogDescription>设置类型、优先级与截止时间</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">任务标题</Label>
            <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：高数习题册" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={type} onValueChange={(v) => setType(v as AssignmentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>优先级</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as AssignmentPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-date">截止日期</Label>
              <Input id="task-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-time">截止时间</Label>
              <Input id="task-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-est">预计时长（分钟，可选）</Label>
            <Input id="task-est" type="number" min={5} step={5} value={estimatedMin} onChange={(e) => setEstimatedMin(e.target.value)} placeholder="如：90" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-note">备注（可选）</Label>
            <Textarea id="task-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="补充说明" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void submit()}>{initial ? '保存' : '添加'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
