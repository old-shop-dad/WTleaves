// 课程详情：循环课程与本周调整的操作入口
import { CalendarClock, MapPin, Pencil, Trash2, User, Undo2, XCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { minutesToClock } from '@/lib/dates';
import { formatWeekPattern } from '@/lib/semester';
import type { CourseOccurrence } from '@/lib/schedule/occurrences';
import { courseTimeOf, formatPeriodRange, type Period } from '@/lib/schedule/periods';
import type { IScheduleSlot } from '@/db/types';

interface CourseDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence: CourseOccurrence | null;
  dateKey: string;
  slot?: IScheduleSlot;
  periods: Period[];
  totalWeeks: number;
  onEdit: (slot: IScheduleSlot) => void;
  onDelete: (slot: IScheduleSlot) => void;
  onOff: (slot: IScheduleSlot, dateKey: string) => void;
  onMove: (slot: IScheduleSlot, dateKey: string) => void;
  onUndoOverride: (overrideId: number) => void;
}

export default function CourseDetailDialog({
  open,
  onOpenChange,
  occurrence,
  dateKey,
  slot,
  periods,
  totalWeeks,
  onEdit,
  onDelete,
  onOff,
  onMove,
  onUndoOverride,
}: CourseDetailDialogProps) {
  if (!occurrence) return null;
  const isException = occurrence.change != null;
  const t = courseTimeOf(occurrence, periods);
  const timeText = `${minutesToClock(t.startMin)} - ${minutesToClock(t.endMin)}`;
  const periodText =
    t.startSlot != null && t.endSlot != null
      ? `${formatPeriodRange(t.startSlot, t.endSlot)} ${timeText}`
      : timeText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {occurrence.title}
            {isException && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                {occurrence.change === 'moved' ? '本周调课' : '本周补课'}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {dateKey} · {periodText}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="h-4 w-4 shrink-0" />
            <span>
              {slot
                ? formatWeekPattern(slot.weekPattern, totalWeeks)
                : '单次安排'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4 shrink-0" />
            <span>{occurrence.location || '未填写地点'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4 shrink-0" />
            <span>{occurrence.teacher || '未填写老师'}</span>
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-start">
          {slot && (
            <Button variant="outline" onClick={() => onEdit(slot)}>
              <Pencil className="h-4 w-4" /> 编辑循环课程
            </Button>
          )}
          {slot && (
            <Button variant="outline" onClick={() => onOff(slot, dateKey)}>
              <XCircle className="h-4 w-4" /> 本周停课
            </Button>
          )}
          {slot && (
            <Button variant="outline" onClick={() => onMove(slot, dateKey)}>
              <CalendarClock className="h-4 w-4" /> 本周调课
            </Button>
          )}
          {occurrence.overrideId != null && (
            <Button variant="outline" onClick={() => onUndoOverride(occurrence.overrideId as number)}>
              <Undo2 className="h-4 w-4" /> 撤销本次调整
            </Button>
          )}
          {slot && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => onDelete(slot)}
            >
              <Trash2 className="h-4 w-4" /> 删除课程
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
