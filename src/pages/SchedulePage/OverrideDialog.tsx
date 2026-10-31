// 本周调整：调课 / 补课（写入 schedule_overrides，不影响其他周）
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { overrideRepo } from '@/db/repositories/schedule';
import { clockToMinutes, minutesToClock, toDateKey, weekdayOf } from '@/lib/dates';
import type { IScheduleSlot } from '@/db/types';

export type OverrideMode = 'move' | 'added';

interface OverrideDialogProps {
  open: boolean;
  mode: OverrideMode;
  onOpenChange: (open: boolean) => void;
  semesterId: number | null;
  base?: IScheduleSlot | null;
  dateKey: string;
  onSaved: () => void;
}

function shiftDate(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export default function OverrideDialog({
  open,
  mode,
  onOpenChange,
  semesterId,
  base,
  dateKey,
  onSaved,
}: OverrideDialogProps) {
  const isMove = mode === 'move';
  const [title, setTitle] = useState(base?.title ?? '');
  const [date, setDate] = useState(dateKey);
  const [start, setStart] = useState(minutesToClock(base?.startMin ?? 8 * 60));
  const [end, setEnd] = useState(minutesToClock(base?.endMin ?? (base?.startMin ?? 8 * 60) + 45));
  const [location, setLocation] = useState(base?.location ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (semesterId == null) {
      toast.error('请先设置当前学期');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error('请选择日期');
      return;
    }
    const startMin = clockToMinutes(start);
    const endMin = clockToMinutes(end);
    if (endMin <= startMin) {
      toast.error('结束时间需晚于开始时间');
      return;
    }
    if (!isMove && !title.trim()) {
      toast.error('请填写补课名称');
      return;
    }
    setSaving(true);
    try {
      if (isMove && base?.id != null) {
        await overrideRepo.create({
          date,
          fromDate: dateKey,
          semesterId,
          kind: 'move',
          slotId: base.id,
          title: title.trim() || base.title,
          startMin,
          endMin,
          location: location.trim() || undefined,
          note: `由 ${dateKey} 调至 ${date}`,
        });
        toast.success(`已调到 ${date}（${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][weekdayOf(new Date(`${date}T00:00:00`))]}）`);
      } else {
        await overrideRepo.create({
          date,
          semesterId,
          kind: 'added',
          title: title.trim(),
          startMin,
          endMin,
          location: location.trim() || undefined,
          note: '临时补课',
        });
        toast.success(`已添加 ${date} 的补课`);
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isMove ? '本周调课' : '本周补课'}</DialogTitle>
          <DialogDescription>
            {isMove ? `把「${base?.title ?? '课程'}」从 ${dateKey} 调到另一天/时段，仅本周生效。` : `在 ${dateKey} 临时增加一节课，仅本次生效。`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="ov-title">课程名称</Label>
            <Input id="ov-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：高等数学" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ov-date">{isMove ? '调到哪一天' : '补课日期'}</Label>
            <div className="flex gap-2">
              <Input id="ov-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <Button type="button" variant="outline" onClick={() => setDate(shiftDate(date, 1))}>+1 天</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ov-start">开始</Label>
              <Input id="ov-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-end">结束</Label>
              <Input id="ov-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ov-location">地点</Label>
            <Input id="ov-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="如：教3-201" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void submit()} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
