// 设置仓库（key-value，localStorage 之外的持久配置走 IndexedDB）
import { db } from '@/db/db';
import type { ISetting } from '@/db/types';

// EXPORTS: settingsRepo

export const settingsRepo = {
  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const row: ISetting | undefined = await db.settings.get(key);
      return row ? (JSON.parse(row.value) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    await db.settings.put({ key, value: JSON.stringify(value) });
  },
  async remove(key: string): Promise<void> {
    await db.settings.delete(key);
  },
};
