// 任务看板：待办 / 进行中 / 已完成 三列拖拽流转
import type { ReactNode } from 'react';
import { DndContext, PointerSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import TaskCard from './TaskCard';
import type { AssignmentStatus, IAssignment, ISubtask } from '@/db/types';

const COLUMNS: Array<{ status: AssignmentStatus; label: string }> = [
  { status: 'todo', label: '待办' },
  { status: 'doing', label: '进行中' },
  { status: 'done', label: '已完成' },
];

interface TaskBoardProps {
  assignments: IAssignment[];
  subtasks: ISubtask[];
  now: number;
  onMove: (id: number, status: AssignmentStatus) => void;
  onEdit: (a: IAssignment) => void;
}

function SortableTaskCard(props: { assignment: IAssignment; subtasks: ISubtask[]; now: number; onEdit: (a: IAssignment) => void }) {
  const { assignment, subtasks, now, onEdit } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `task-${assignment.id}`,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'z-10 opacity-80')}
    >
      {/* K5：拖拽监听只绑在手柄上，避免吞掉编辑按钮的点击 */}
      <div
        {...attributes}
        {...listeners}
        className="flex h-4 cursor-grab items-center justify-center text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
        title="拖拽调整"
      >
        <GripVertical className="h-3 w-3" />
      </div>
      <TaskCard assignment={assignment} subtasks={subtasks} now={now} board onEdit={onEdit} />
    </div>
  );
}

/** 单列容器：注册为 droppable，使拖入空列也能命中 col-<status> 目标 */
function TaskColumn({ status, label, count, children }: { status: AssignmentStatus; label: string; count: number; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `col-${status}` });
  return (
    <div
      ref={setNodeRef}
      className="rounded-2xl border border-white/50 bg-white/35 p-2.5 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04]"
    >
      <div className="mb-2 flex items-center justify-between px-1.5">
        <h3 className="text-[13px] font-semibold text-foreground">{label}</h3>
        <span className="rounded-full bg-white/60 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground dark:bg-white/10">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function TaskBoard({ assignments, subtasks, now, onMove, onEdit }: TaskBoardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (!activeId.startsWith('task-')) return;
    const taskId = Number(activeId.slice(5));
    let target: AssignmentStatus | null = null;
    if (overId.startsWith('col-')) {
      target = overId.slice(4) as AssignmentStatus;
    } else if (overId.startsWith('task-')) {
      const overTask = assignments.find((a) => a.id === Number(overId.slice(5)));
      if (overTask) target = overTask.status;
    }
    if (taskId != null && target) onMove(taskId, target);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = assignments
            .filter((a) => a.status === col.status)
            .sort((a, b) => (a.dueAt ?? Number.POSITIVE_INFINITY) - (b.dueAt ?? Number.POSITIVE_INFINITY));
          return (
            <TaskColumn key={col.status} status={col.status} label={col.label} count={items.length}>
              <SortableContext items={items.map((a) => `task-${a.id}`)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2.5">
                  {items.map((a) => (
                    <SortableTaskCard key={a.id} assignment={a} subtasks={subtasks.filter((s) => s.assignmentId === a.id)} now={now} onEdit={onEdit} />
                  ))}
                </div>
              </SortableContext>
            </TaskColumn>
          );
        })}
      </div>
    </DndContext>
  );
}
