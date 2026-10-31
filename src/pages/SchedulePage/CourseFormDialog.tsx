// 课程表单：新增 / 编辑循环课程（周次点选、颜色、时间、冲突提示）
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { slotRepo } from '@/db/repositories/schedule';
import { clockToMinutes, minutesToClock } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { COURSE_COLORS } from '@/data/course';
import { findConflictsWith, describeWeeks, type ScheduleConflict } from '@/lib/schedule/conflicts';
import WeekPatternEditor from './components/WeekPatternEditor';
import { patternToWeeks, weeksToPattern } from './components/weekPattern';
import type { IScheduleSlot } from '@/db/types';

const WEEKDAY_OPTIONS = [
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
  { value: '0', label: '周日' },
];

interface CourseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  semesterId: number | null;
  totalWeeks: number;
  initial?: IScheduleSlot | null;
  /** 点击空白格时的预填 */
  defaultDayOfWeek?: number;
  defaultStartMin?: number;
  onSaved: () => void;
}

export default function CourseFormDialog({
  open,
  onOpenChange,
  semesterId,
  totalWeeks,
  initial,
  defaultDayOfWeek,
  defaultStartMin,
  onSaved,
}: CourseFormDialogProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [dayOfWeek, setDayOfWeek] = useState(String(initial?.dayOfWeek ?? defaultDayOfWeek ?? 1));
  const [start, setStart] = useState(
    initial ? minutesToClock(initial.startMin) : defaultStartMin != null ? minutesToClock(defaultStartMin) : '08:00',
  );
  const [end, setEnd] = useState(
    initial
      ? minutesToClock(initial.endMin)
      : defaultStartMin != null
        ? minutesToClock(Math.min(24 * 60 - 1, defaultStartMin + 45))
        : '08:45',
  );
  const [location, setLocation] = useState(initial?.location ?? '');
  const [teacher, setTeacher] = useState(initial?.teacher ?? '');
  const [color, setColor] = useState(initial?.color ?? COURSE_COLORS[0]);
  const [weeks, setWeeks] = useState<number[]>(() =>
    initial
      ? patternToWeeks(initial.weekPattern, totalWeeks)
      : Array.from({ length: Math.max(1, totalWeeks || 20) }, (_, i) => i + 1),
  );
  // 阶段四：时间冲突检测（轻提示，不强制阻止）
  const [pendingConflicts, setPendingConflicts] = useState<ScheduleConflict[] | null>(null);

  const doSave = async () => {
    const startMin = clockToMinutes(start);
    const endMin = clockToMinutes(end);
    const payload = {
      title: title.trim(),
      dayOfWeek: Number(dayOfWeek),
      startMin,
      endMin,
      location: location.trim() || undefined,
      teacher: teacher.trim() || undefined,
      color,
      weekPattern: weeksToPattern(weeks, totalWeeks),
    };
    if (initial?.id != null) {
      await slotRepo.update(initial.id, payload);
      toast.success('课程已更新（所有上课周生效）');
    } else {
      if (semesterId == null) {
        toast.error('请先创建学期');
        return;
      }
      await slotRepo.create({ semesterId, ...payload });
      toast.success('课程已添加');
    }
    onOpenChange(false);
    onSaved();
  };

  const submit = async () => {
    if (!title.trim()) {
      toast.error('请填写课程名称');
      return;
    }
    if (weeks.length === 0) {
      toast.error('请至少选择一个上课周次');
      return;
    }
    const startMin = clockToMinutes(start);
    const endMin = clockToMinutes(end);
    if (endMin <= startMin) {
      toast.error('结束时间需晚于开始时间');
      return;
    }
    const payload = {
      title: title.trim(),
      dayOfWeek: Number(dayOfWeek),
      startMin,
      endMin,
      location: location.trim() || undefined,
      teacher: teacher.trim() || undefined,
      color,
      weekPattern: weeksToPattern(weeks, totalWeeks),
    };
    // 阶段四：保存前检测与已有课程的时间+周次重叠（不强制阻止，弹轻提示）
    try {
      const existing = await slotRepo.list();
      const conflicts = findConflictsWith(
        existing.filter((s) => s.semesterId === semesterId),
        payload,
        initial?.id,
        totalWeeks,
      );
      if (conflicts.length > 0) {
        setPendingConflicts(conflicts);
        return;
      }
    } catch {
      // 冲突查询失败不阻断保存
    }
    await doSave();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑课程' : '添加课程'}</DialogTitle>
          <DialogDescription>
            {initial ? '修改会作用于所有上课周；只想调整某一周，请在课程卡片里使用「本周调整」。' : '选择这门课在哪些周上，支持单双周与自定义周次。'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="course-title">课程名称</Label>
            <Input id="course-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：高等数学" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>星期</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger><SelectValue placeholder="选择星期" /></SelectTrigger>
                <SelectContent>
                  {WEEKDAY_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-start">开始</Label>
              <Input id="course-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-end">结束</Label>
              <Input id="course-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>上课周次</Label>
            <WeekPatternEditor totalWeeks={totalWeeks} value={weeks} onChange={setWeeks} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="course-location">地点</Label>
              <Input id="course-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="如：教3-201" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-teacher">老师</Label>
              <Input id="course-teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)} placeholder="如：王老师" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>颜色</Label>
            <div className="flex flex-wrap gap-2">
              {COURSE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 rounded-full transition-transform',
                    color === c && 'scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background',
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`选择颜色 ${c}`}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void submit()}>{initial ? '保存' : '添加'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* 阶段四：时间冲突轻提示（仍可强行保存） */}
    <AlertDialog open={pendingConflicts != null} onOpenChange={(v) => !v && setPendingConflicts(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>课程时间冲突</AlertDialogTitle>
          <AlertDialogDescription>
            与已有课程存在时间重叠（重叠于周次与时段如下）。重叠的课会在课表中并排显示，确认无误后仍可保存。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl bg-white/40 p-3 text-sm dark:bg-white/[0.06]">
          {pendingConflicts?.map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full bg-danger/70" />
              <span className="flex-1 truncate">
                {c.a.title} × {c.b.title}（{describeWeeks(c.overlapWeeks)} ·{' '}
                {minutesToClock(c.a.startMin)}-{minutesToClock(c.a.endMin)}）
              </span>
            </div>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>取消保存</AlertDialogCancel>
          <AlertDialogAction onClick={() => void doSave()}>仍要保存</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
