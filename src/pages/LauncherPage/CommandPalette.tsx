// 命令面板（Ctrl+K）：搜索入口并打开 / 页面导航 / 快捷动作
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { ArrowUpRight, Globe, LayoutGrid, ListPlus, NotebookPen, Plus, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { launcherItemRepo } from '@/db/repositories/launcher';
import { isSafeUrl } from '@/lib/url-safety';
// openCount 原子递增见 launcherItemRepo.incrementOpenCount（L7）
import type { ILauncherItem } from '@/db/types';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddEntry: () => void;
}

const NAV_ACTIONS = [
  { id: 'today', label: '打开今日仪表盘', keywords: 'today 今日', to: '/today' },
  { id: 'schedule', label: '打开课表', keywords: 'schedule 课表 课程', to: '/schedule' },
  { id: 'tasks', label: '打开任务', keywords: 'tasks 任务 作业 ddl', to: '/tasks' },
  { id: 'notes', label: '打开笔记', keywords: 'notes 笔记 记录', to: '/notes' },
  { id: 'settings', label: '打开设置', keywords: 'settings 设置 备份 主题', to: '/settings' },
];

export default function CommandPalette({ open, onOpenChange, onAddEntry }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<ILauncherItem[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    void launcherItemRepo
      .list()
      .then((list) => {
        setQuery('');
        setEntries(list);
      })
      .catch(() => {});
  }, [open]);

  const openEntry = useCallback(
    (item: ILauncherItem) => {
      onOpenChange(false);
      if (isSafeUrl(item.url)) {
        window.open(item.url, '_blank', 'noopener,noreferrer');
      }
      // L7：Dexie 原子递增，替代读快照 +1 写回的 lost update
      void launcherItemRepo.incrementOpenCount(item.id as number).catch(() => {});
    },
    [onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>命令面板</DialogTitle>
        </DialogHeader>
        <Command className="rounded-2xl bg-white/80 backdrop-blur-2xl dark:bg-black/70">
          <div className="flex items-center gap-2 border-b border-white/40 px-4 dark:border-white/10">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="搜索入口、页面或动作…"
              className="h-12 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-[340px] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
              没有找到「{query}」
            </Command.Empty>

            <Command.Group heading="入口">
              {entries.map((item) => (
                <Command.Item
                  key={item.id}
                  value={`entry-${item.name}`}
                  onSelect={() => openEntry(item)}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground data-[selected=true]:bg-primary/10"
                >
                  <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </Command.Item>
              ))}
              {entries.length === 0 ? (
                <Command.Item
                  value="add-entry"
                  onSelect={() => {
                    onOpenChange(false);
                    onAddEntry();
                  }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground data-[selected=true]:bg-primary/10"
                >
                  <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>添加常用入口</span>
                </Command.Item>
              ) : null}
            </Command.Group>

            <Command.Group heading="页面">
              {NAV_ACTIONS.map((a) => (
                <Command.Item
                  key={a.id}
                  value={a.keywords}
                  onSelect={() => {
                    onOpenChange(false);
                    navigate(a.to);
                  }}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground data-[selected=true]:bg-primary/10"
                >
                  <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{a.label}</span>
                </Command.Item>
              ))}
            </Command.Group>

            <Command.Group heading="快捷动作">
              <Command.Item
                value="quick-note"
                onSelect={() => {
                  onOpenChange(false);
                  navigate('/notes');
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground data-[selected=true]:bg-primary/10"
              >
                <NotebookPen className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>新建笔记</span>
              </Command.Item>
              <Command.Item
                value="quick-task"
                onSelect={() => {
                  onOpenChange(false);
                  navigate('/tasks');
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground data-[selected=true]:bg-primary/10"
              >
                <ListPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>添加任务</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
