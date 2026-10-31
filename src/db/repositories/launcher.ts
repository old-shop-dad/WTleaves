// 快捷启动台仓库：分组 + 条目
import { db } from '@/db/db';
import { BaseRepository } from './base';
import type { ILauncherGroup, ILauncherItem } from '@/db/types';

// EXPORTS: launcherGroupRepo, launcherItemRepo

export const launcherGroupRepo = new BaseRepository<ILauncherGroup>(db.launcher_groups);

class LauncherItemRepository extends BaseRepository<ILauncherItem> {
  /** 原子自增打开次数（避免读旧值 +1 整体 put 的并发丢失更新） */
  async incrementOpenCount(id: number): Promise<void> {
    await db.launcher_items
      .where(':id')
      .equals(id)
      .modify((item) => {
        item.openCount = (item.openCount || 0) + 1;
        item.lastOpenedAt = Date.now();
      });
  }
}

export const launcherItemRepo = new LauncherItemRepository(db.launcher_items);

/**
 * L6：删除分组——单个事务内同时软删分组与其下所有入口，
 * 中途失败整体回滚，不留“组删了一半入口还在”的中间态。
 */
export async function deleteGroupCascade(groupId: number): Promise<void> {
  await db.transaction('rw', [db.launcher_groups, db.launcher_items], async () => {
    const items = await db.launcher_items.where('groupId').equals(groupId).toArray();
    for (const it of items) {
      if (!it.deletedAt && it.id != null) await launcherItemRepo.softDelete(it.id);
    }
    await launcherGroupRepo.softDelete(groupId);
  });
}
