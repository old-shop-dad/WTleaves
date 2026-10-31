// 通用仓库基类：软删除 CRUD（所有业务表统一走它，禁止页面直接操作 Dexie）
import type { Table } from 'dexie';
import type { IBaseEntity } from '@/db/types';

export class BaseRepository<T extends IBaseEntity> {
  constructor(protected table: Table<T, number>) {}

  /**
   * 未删除的全部记录（按 id 倒序）。
   * 优先走 deletedAt 索引（避免 filter().sortBy() 全表内存加载——Dexie 官方 Design 反对的写法）；
   * 无 deletedAt 索引的表（如 note_snapshots）自动回退 filter 方案。
   */
  async list(): Promise<T[]> {
    try {
      const rows = await this.table.where('deletedAt').equals(0).toArray();
      return rows.sort((a, b) => (b.id as number) - (a.id as number));
    } catch {
      return this.table
        .filter((r) => !r.deletedAt)
        .sortBy('id')
        .then((rows) => rows.reverse());
    }
  }

  /** 回收站：已删除记录（按删除时间倒序） */
  async listDeleted(): Promise<T[]> {
    try {
      const rows = await this.table.where('deletedAt').above(0).toArray();
      return rows.sort((a, b) => (b.deletedAt as number) - (a.deletedAt as number));
    } catch {
      return this.table
        .filter((r) => r.deletedAt)
        .sortBy('id')
        .then((rows) => rows.reverse());
    }
  }

  /** 从回收站恢复 */
  async restore(id: number): Promise<T | undefined> {
    const row = await this.table.get(id);
    if (!row) return undefined;
    const next = { ...row, deletedAt: 0, updatedAt: Date.now() } as T;
    await this.table.put(next);
    return next;
  }

  /** 硬清理指定时间之前删除的记录（回收站 30 天自动清理用） */
  async purgeOlderThan(ts: number): Promise<number> {
    let removed = 0;
    try {
      const rows = await this.table.where('deletedAt').above(0).toArray();
      for (const r of rows) {
        if ((r.deletedAt as number) < ts) {
          await this.table.delete(r.id as number);
          removed++;
        }
      }
    } catch {
      const rows = await this.table.filter((r) => r.deletedAt).toArray();
      for (const r of rows) {
        if ((r.deletedAt as number) < ts) {
          await this.table.delete(r.id as number);
          removed++;
        }
      }
    }
    return removed;
  }

  async get(id: number): Promise<T | undefined> {
    const row = await this.table.get(id);
    return row && !row.deletedAt ? row : undefined;
  }

  async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & { id?: number }): Promise<T> {
    const now = Date.now();
    const record = { ...data, createdAt: now, updatedAt: now, deletedAt: 0 } as unknown as T;
    const id = await this.table.add(record);
    return { ...record, id };
  }

  async update(id: number, patch: Partial<T>): Promise<T | undefined> {
    const row = await this.table.get(id);
    if (!row || row.deletedAt) return undefined;
    const next = { ...row, ...patch, updatedAt: Date.now() } as T;
    await this.table.put(next);
    return next;
  }

  /** 软删除 */
  async softDelete(id: number): Promise<void> {
    const row = await this.table.get(id);
    if (!row) return;
    await this.table.put({ ...row, deletedAt: Date.now(), updatedAt: Date.now() } as T);
  }

  /** 硬删除（仅回收站清理用） */
  async hardDelete(id: number): Promise<void> {
    await this.table.delete(id);
  }

  async bulkCreate(items: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>>): Promise<number[]> {
    const now = Date.now();
    const records = items.map((it) => ({ ...it, createdAt: now, updatedAt: now, deletedAt: 0 })) as unknown as T[];
    return this.table.bulkAdd(records, { allKeys: true }) as Promise<number[]>;
  }

  /**
   * 多表写事务 helper：级联删除、批量导入等多表写入统一走它，
   * 避免散落的裸事务与孤儿数据（Dexie 事务是多表一致性的唯一手段）。
   */
  protected withTransaction<R>(
    tables: Array<Table<unknown, number | string>>,
    fn: () => Promise<R>,
    mode: 'rw' = 'rw',
  ): Promise<R> {
    return this.table.db.transaction(mode, tables, fn);
  }

  async count(): Promise<number> {
    try {
      return await this.table.where('deletedAt').equals(0).count();
    } catch {
      return this.table.filter((r) => !r.deletedAt).count();
    }
  }
}
