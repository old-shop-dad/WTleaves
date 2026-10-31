// 启动台入口表单：新增 / 编辑（名称、URL、所属分组）
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { launcherItemRepo } from '@/db/repositories/launcher';
import { isSafeUrl, normalizeUrl } from '@/lib/url-safety';
import type { ILauncherItem } from '@/db/types';

interface EntryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ILauncherItem | null;
  groups: Array<{ id: number; name: string }>;
  onSaved: () => void;
}

export default function EntryFormDialog({ open, onOpenChange, initial, groups, onSaved }: EntryFormDialogProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [groupId, setGroupId] = useState(initial ? String(initial.groupId) : String(groups[0]?.id ?? ''));

  const submit = async () => {
    if (!name.trim()) {
      toast.error('请填写名称');
      return;
    }
    const normalized = normalizeUrl(url);
    if (!isSafeUrl(normalized)) {
      toast.error('请输入有效的 http/https 链接');
      return;
    }
    if (!groupId) {
      toast.error('请先创建分组');
      return;
    }
    const payload = {
      name: name.trim(),
      url: normalized,
      groupId: Number(groupId),
    };
    // L5：DB 操作加 try/catch，失败 toast 提示且弹窗保持打开（数据不丢）
    try {
      if (initial?.id != null) {
        await launcherItemRepo.update(initial.id, payload);
        toast.success('入口已更新');
      } else {
        const group = await launcherItemRepo.list();
        const maxOrder = group
          .filter((i) => i.groupId === Number(groupId))
          .reduce((m, i) => Math.max(m, i.sortOrder), -1);
        await launcherItemRepo.create({ ...payload, sortOrder: maxOrder + 1, openCount: 0 });
        toast.success('入口已添加');
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(`保存失败：${(e as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? '编辑入口' : '添加入口'}</DialogTitle>
          <DialogDescription>填写名称与网址，归属到对应分组</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="entry-name">名称</Label>
            <Input id="entry-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="如：学习通" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entry-url">网址</Label>
            <Input id="entry-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <Label>分组</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue placeholder="选择分组" /></SelectTrigger>
              <SelectContent>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
