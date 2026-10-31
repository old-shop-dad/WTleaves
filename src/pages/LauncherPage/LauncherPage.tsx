// 快捷启动台：分组 + 入口网格 + 拖拽排序/跨组归类 + 打开计数 + 搜索过滤 + Ctrl+K 命令面板
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext, pointerWithin, PointerSensor, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, rectSortingStrategy, SortableContext, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowUpRight, ChevronDown, ChevronUp, FolderPlus, LayoutGrid, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import GlassCard from '@/components/glass/GlassCard';
import EmptyState from '@/components/glass/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deleteGroupCascade, launcherGroupRepo, launcherItemRepo } from '@/db/repositories/launcher';
import { seedIfEmpty } from '@/data/seed';
import { isSafeUrl } from '@/lib/url-safety';
import { cn } from '@/lib/utils';
import EntryFormDialog from './EntryFormDialog';
import type { ILauncherGroup, ILauncherItem } from '@/db/types';

interface LauncherSnapshot {
  groups: ILauncherGroup[];
  items: ILauncherItem[];
}

const PALETTE = ['#4A90D9', '#5BAE6F', '#F2903D', '#8B74C8', '#4FB3C4', '#E5B93E'];
const GROUP_PREFIX = 'group-';

export default function LauncherPage() {
  const [snapshot, setSnapshot] = useState<LauncherSnapshot | null>(null);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ILauncherItem | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [deletingGroup, setDeletingGroup] = useState<ILauncherGroup | null>(null);
  const [deletingItem, setDeletingItem] = useState<ILauncherItem | null>(null);
  // 阶段四：分组折叠状态（仅前端记忆，刷新恢复展开）
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const fetchData = useCallback(async (): Promise<LauncherSnapshot> => {
    await seedIfEmpty();
    const [groups, items] = await Promise.all([launcherGroupRepo.list(), launcherItemRepo.list()]);
    return { groups, items };
  }, []);

  const reload = useCallback(() => {
    fetchData()
      .then(setSnapshot)
      .catch(() => {});
  }, [fetchData]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 唤起全局命令面板（全局 CommandPalette 自管开关，这里通过派发快捷键事件触发）
  const openGlobalPalette = useCallback(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  }, []);

  const groups = useMemo(
    () => [...(snapshot?.groups ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [snapshot],
  );

  const itemsById = useMemo(() => {
    const map = new Map<number, ILauncherItem>();
    for (const i of snapshot?.items ?? []) map.set(i.id as number, i);
    return map;
  }, [snapshot]);

  // 每个分组的完整有序 ID 列表：始终基于全量 items 计算（含搜索时隐藏的项），
  // 拖拽/排序落库时据此重排全部条目，避免只写可见项导致清空搜索后顺序错乱。
  const groupItemIds = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const i of snapshot?.items ?? []) {
      const arr = map.get(i.groupId) ?? [];
      arr.push(i.id as number);
      map.set(i.groupId, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ia = itemsById.get(a);
        const ib = itemsById.get(b);
        return (ia?.sortOrder ?? 0) - (ib?.sortOrder ?? 0) || (ib?.openCount || 0) - (ia?.openCount || 0);
      });
    }
    return map;
  }, [snapshot, itemsById]);

  // 搜索词（小写），用于在渲染时从全量分组中筛出可见入口
  const queryLower = query.trim().toLowerCase();

  const visibleIdsOfGroup = useCallback(
    (gid: number): number[] => {
      const ids = groupItemIds.get(gid) ?? [];
      if (!queryLower) return ids;
      return ids.filter((id) => {
        const it = itemsById.get(id);
        return !!it && (it.name.toLowerCase().includes(queryLower) || it.url.toLowerCase().includes(queryLower));
      });
    },
    [groupItemIds, itemsById, queryLower],
  );

  const itemColor = (groupId: number, itemId: number): string => {
    const ids = groupItemIds.get(groupId) ?? [];
    const idx = ids.indexOf(itemId);
    return PALETTE[(groupId + Math.max(0, idx)) % PALETTE.length];
  };

  // 虚拟「常用」组：openCount >= 5 的入口自动收录，按使用次数降序（不可手动拖拽）
  const frequentItems = useMemo(
    () =>
      [...(snapshot?.items ?? [])]
        .filter((i) => (i.openCount || 0) >= 5)
        .sort((a, b) => (b.openCount || 0) - (a.openCount || 0)),
    [snapshot],
  );

  // L4：先 window.open，再 fire-and-forget 异步计数，打开不依赖 DB 写入成功
  const openEntry = useCallback((item: ILauncherItem) => {
    if (isSafeUrl(item.url)) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
    // L7：原子递增（读快照 +1 整体 put 会 lost update），失败静默不影响打开
    void launcherItemRepo.incrementOpenCount(item.id as number).catch(() => {});
  }, []);

  const persistSort = async (groupId: number, ids: number[]) => {
    for (let i = 0; i < ids.length; i++) {
      await launcherItemRepo.update(ids[i], { sortOrder: i });
    }
  };

  const moveToGroup = async (itemId: number, toGroupId: number, insertIndex: number) => {
    const item = itemsById.get(itemId);
    if (!item) return;
    const fromGroupId = item.groupId;
    const targetIds = (groupItemIds.get(toGroupId) ?? []).filter((id) => id !== itemId);
    const idx = Math.max(0, Math.min(insertIndex, targetIds.length));
    targetIds.splice(idx, 0, itemId);
    await launcherItemRepo.update(itemId, { groupId: toGroupId });
    await persistSort(toGroupId, targetIds);
    if (fromGroupId !== toGroupId) {
      const remain = (groupItemIds.get(fromGroupId) ?? []).filter((id) => id !== itemId);
      await persistSort(fromGroupId, remain);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as number;
    const activeItem = itemsById.get(activeId);
    if (!activeItem) return;

    // 落到分组容器（拖到组内空白区）→ 移到该组末尾
    if (typeof over.id === 'string' && over.id.startsWith(GROUP_PREFIX)) {
      const toGroupId = Number(over.id.slice(GROUP_PREFIX.length));
      if (toGroupId !== activeItem.groupId) {
        await moveToGroup(activeId, toGroupId, Number.MAX_SAFE_INTEGER);
        reload();
      }
      return;
    }

    const overItem = itemsById.get(over.id as number);
    if (!overItem) return;
    const fromGroupId = activeItem.groupId;
    const toGroupId = overItem.groupId;

    if (fromGroupId === toGroupId) {
      // 同组内重排
      const ids = [...(groupItemIds.get(fromGroupId) ?? [])];
      const from = ids.indexOf(activeId);
      const to = ids.indexOf(over.id as number);
      if (from < 0 || to < 0) return;
      const next = arrayMove(ids, from, to);
      await persistSort(fromGroupId, next);
      reload();
    } else {
      // 跨组：插到 over 项位置
      const targetIds = groupItemIds.get(toGroupId) ?? [];
      const toIndex = targetIds.indexOf(over.id as number);
      await moveToGroup(activeId, toGroupId, toIndex);
      reload();
    }
  };

  const createGroup = useCallback(async () => {
    const name = newGroupName.trim();
    if (!name) {
      toast.error('请填写分组名称');
      return;
    }
    const maxOrder = groups.reduce((m, g) => Math.max(m, g.sortOrder), -1);
    await launcherGroupRepo.create({ name, sortOrder: maxOrder + 1 });
    setNewGroupName('');
    setNewGroupOpen(false);
    toast.success('分组已创建');
    reload();
  }, [newGroupName, groups, reload]);

  const confirmDeleteGroup = useCallback(async () => {
    if (!deletingGroup?.id) return;
    // L6：事务内同时软删分组与组内入口，中途失败整体回滚
    try {
      await deleteGroupCascade(deletingGroup.id);
      toast.success('分组已删除');
    } catch (e) {
      toast.error(`删除失败：${(e as Error).message}`);
    }
    setDeletingGroup(null);
    reload();
  }, [deletingGroup, reload]);

  const confirmDeleteItem = useCallback(async () => {
    if (deletingItem?.id != null) {
      await launcherItemRepo.softDelete(deletingItem.id);
      toast.success('入口已删除');
      setDeletingItem(null);
      reload();
    }
  }, [deletingItem, reload]);

  if (!snapshot) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        加载启动台…
      </div>
    );
  }

  const allItems = snapshot.items;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">启动台</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {allItems.length} 个入口 · {groups.length} 个分组
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            onClick={openGlobalPalette}
            className="gap-2 text-muted-foreground"
          >
            <Search className="h-4 w-4" /> Ctrl+K
          </Button>
          <Button variant="outline" onClick={() => setNewGroupOpen(true)}>
            <FolderPlus className="h-4 w-4" /> 新建分组
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> 添加入口
          </Button>
        </div>
      </div>

      <div className="mb-4 max-w-md">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索入口名称或网址…"
          className="rounded-full bg-white/40 dark:bg-white/[0.06]"
        />
      </div>

      {/* 虚拟「常用」组：openCount >= 5 自动收录，按使用次数降序，不可拖拽 */}
      {frequentItems.length > 0 && !query.trim() && (
        <GlassCard className="mb-5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-foreground">常用</h2>
            <span className="rounded-full bg-white/60 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground dark:bg-white/10">
              {frequentItems.length}
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground">使用 5 次以上自动收录 · 按使用频率排序</span>
          </div>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
            {frequentItems.map((item, i) => (
              <EntryTile key={item.id} item={item} color={PALETTE[i % PALETTE.length]} onOpen={openEntry} onDelete={setDeletingItem} />
            ))}
          </div>
        </GlassCard>
      )}

      {groups.length === 0 ? (
        <GlassCard>
          <EmptyState
            title="还没有常用入口"
            description="创建分组并添加常用网站，一键直达"
            icon={<LayoutGrid className="h-6 w-6" />}
            actionLabel="添加入口"
            onAction={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          />
        </GlassCard>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragEnd={(e) => void handleDragEnd(e)}
        >
          <div className="space-y-5">
            {groups.map((g) => {
              const gid = g.id as number;
              const itemIds = visibleIdsOfGroup(gid);
              if (queryLower && itemIds.length === 0) return null;
              // 搜索时强制展开，避免结果被折叠遮住
              const collapsed = !queryLower && collapsedGroups.has(gid);
              return (
                <DroppableGroup key={g.id} groupId={gid}>
                  <GlassCard className={cn('p-4', collapsed && 'pb-3')}>
                    <div className="mb-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(gid)) next.delete(gid);
                            else next.add(gid);
                            return next;
                          })
                        }
                        className="flex items-center gap-1.5 rounded-lg p-1 -m-1 text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                        title={collapsed ? '展开分组' : '折叠分组'}
                      >
                        {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                        <h2 className="text-[15px] font-semibold text-foreground">{g.name}</h2>
                      </button>
                      <span className="rounded-full bg-white/60 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground dark:bg-white/10">
                        {itemIds.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDeletingGroup(g)}
                        className="ml-auto rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover/card:opacity-100"
                        title="删除分组"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    {collapsed ? (
                      <p className="pb-1 text-center text-[11px] text-muted-foreground/60">
                        {itemIds.length} 个入口已折叠
                      </p>
                    ) : itemIds.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        {query.trim() ? '没有匹配的入口' : '此分组还没有入口，可拖入其他组的入口'}
                      </p>
                    ) : (
                      <SortableContext items={itemIds} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
                          {itemIds.map((id) => {
                            const item = itemsById.get(id);
                            if (!item) return null;
                            return (
                              <SortableEntry
                                key={id}
                                item={item}
                                color={itemColor(gid, id)}
                                onOpen={openEntry}
                                onDelete={setDeletingItem}
                              />
                            );
                          })}
                        </div>
                      </SortableContext>
                    )}
                  </GlassCard>
                </DroppableGroup>
              );
            })}
          </div>
        </DndContext>
      )}

      {/* 添加入口 / 新建分组（命令面板由全局 Layout 统一提供） */}
      <EntryFormDialog
        key={editing?.id ?? 'new'}
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        groups={groups.map((g) => ({ id: g.id as number, name: g.name }))}
        onSaved={reload}
      />

      <AlertDialog open={newGroupOpen} onOpenChange={setNewGroupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>新建分组</AlertDialogTitle>
            <AlertDialogDescription>输入分组名称，用于归类常用入口。</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void createGroup()}
            placeholder="如：学习、工具、娱乐"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void createGroup()}>创建</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletingGroup != null} onOpenChange={(o) => !o && setDeletingGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除分组</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{deletingGroup?.name}」吗？组内 {deletingGroup ? (snapshot.items.filter((i) => i.groupId === deletingGroup.id).length) : 0} 个入口将一并删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteGroup()}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除入口确认 */}
      <AlertDialog open={deletingItem != null} onOpenChange={(o) => !o && setDeletingItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除入口</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除「{deletingItem?.name}」吗？删除后无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteItem()}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** 可接收拖入入口的分组容器 */
function DroppableGroup({ groupId, children }: { groupId: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${GROUP_PREFIX}${groupId}` });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-3xl transition-all',
        isOver && 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background',
      )}
    >
      {children}
    </div>
  );
}/** 纯展示入口卡片（虚拟常用组用，不可拖拽） */
function EntryTile({
  item,
  color,
  onOpen,
  onDelete,
}: {
  item: ILauncherItem;
  color: string;
  onOpen: (item: ILauncherItem) => void;
  onDelete?: (item: ILauncherItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => void onOpen(item)}
      className="group relative flex flex-col items-center gap-2"
    >
      <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-[0_6px_16px_-8px_rgba(30,60,70,0.5)] transition-transform group-hover:scale-105">
        <span className="absolute inset-0 rounded-2xl" style={{ backgroundColor: color }} />
        <span className="relative text-lg font-bold">{item.name.charAt(0).toUpperCase()}</span>
        <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-white/85 text-[10px] text-foreground opacity-0 shadow transition-opacity group-hover:opacity-100 dark:bg-black/60 dark:text-white">
          <ArrowUpRight className="h-2.5 w-2.5" />
        </span>
        {onDelete && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onDelete(item);
              }
            }}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-danger text-white opacity-0 shadow-md transition-opacity hover:bg-danger/80 group-hover:opacity-100"
            title="删除入口"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
        )}
      </span>
      <span className="max-w-full truncate text-xs text-foreground">{item.name}</span>
      <span className="text-[10px] text-muted-foreground">打开 {item.openCount || 0} 次</span>
    </button>
  );
}

/** 可拖拽入口卡片（真实分组用，包一层 dnd-kit 拖拽壳） */
function SortableEntry({
  item,
  color,
  onOpen,
  onDelete,
}: {
  item: ILauncherItem;
  color: string;
  onOpen: (item: ILauncherItem) => void;
  onDelete?: (item: ILauncherItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id as number,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group flex cursor-grab touch-manipulation flex-col items-center gap-2',
        isDragging && 'z-10 opacity-60',
      )}
    >
      <EntryTile item={item} color={color} onOpen={onOpen} onDelete={onDelete} />
    </div>
  );
}
