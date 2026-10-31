// 课表仓库：常规课程 + 调停课记录
import { db } from '@/db/db';
import { BaseRepository } from './base';
import type { IScheduleOverride, IScheduleSlot, WeekPatternStore } from '@/db/types';

// EXPORTS: slotRepo, overrideRepo

export interface BulkImportSlotInput {
  semesterId: number;
  title: string;
  dayOfWeek: number;
  startMin: number;
  endMin: number;
  location?: string;
  teacher?: string;
  weekPattern: WeekPatternStore;
  color: string;
  /** 原始周次文案，便于详情展示 */
  weeksText?: string;
  periodStart?: number;
  periodEnd?: number;
}

export interface BulkImportOptions {
  /** merge=相同位置+相同周次跳过；replace=同位置同周次跳过、同位置不同周次更新 */
  mode?: 'merge' | 'replace';
  onProgress?: (done: number, total: number) => void;
}

export interface BulkImportResult {
  /** 本次事务真正新建的课程（含自增 id） */
  created: IScheduleSlot[];
  /** replace 模式下被更新的课程（更新后的记录） */
  updated: IScheduleSlot[];
  /** merge 模式下被更新前的原始记录（用于撤销恢复） */
  before: IScheduleSlot[];
  /** 因重复（库内已有或同批次重复）被跳过的条数 */
  skippedDuplicate: number;
}

function weekSignature(s: Pick<IScheduleSlot, 'weekPattern'>): string {
  const p = s.weekPattern;
  if (!p) return 'all';
  if (p.type === 'weeks') return `weeks:${[...p.weeks].sort((a, b) => a - b).join(',')}`;
  if (p.type === 'odd' || p.type === 'even') return `${p.type}:${p.maxWeek ?? ''}`;
  return 'all';
}

/** 完整去重 key：课程名 + 星期 + 起止时间 + 周次 */
function dedupKey(s: Pick<IScheduleSlot, 'title' | 'dayOfWeek' | 'startMin' | 'endMin' | 'weekPattern'>): string {
  return `${(s.title || '').trim()}|${s.dayOfWeek}|${s.startMin}|${s.endMin}|${weekSignature(s)}`;
}

/** 同位置 key：课程名 + 星期 + 开始时间（不区分周次，用于 replace 定位） */
function slotKey(s: Pick<IScheduleSlot, 'title' | 'dayOfWeek' | 'startMin'>): string {
  return `${(s.title || '').trim()}|${s.dayOfWeek}|${s.startMin}`;
}

class SlotRepository extends BaseRepository<IScheduleSlot> {
  /**
   * 事务化批量导入：
   * - 整个读写包在 db.transaction('rw', schedule_slots) 中，中途失败整体回滚
   * - 同批次内去重包含周次，避免“1-8周”和“10-16周”两段互相吞掉
   * - replace 模式会把“同位置不同周次”的旧记录更新为新规则（修正重导入）
   */
  async bulkImport(
    items: BulkImportSlotInput[],
    semesterId: number,
    options: BulkImportOptions = {},
  ): Promise<BulkImportResult> {
    if (items.length === 0) return { created: [], updated: [], before: [], skippedDuplicate: 0 };
    const now = Date.now();
    const mode = options.mode ?? 'merge';
    const onProgress = options.onProgress;

    return db.transaction('rw', db.schedule_slots, async () => {
      const existing = await db.schedule_slots
        .where('semesterId')
        .equals(semesterId)
        .filter((s) => !s.deletedAt)
        .toArray();

      const existKeys = new Set(existing.map(dedupKey));
      const usedExisting = new Set<number>();
      const before: IScheduleSlot[] = [];
      const toAdd: Array<Omit<IScheduleSlot, 'id'>> = [];
      const toPut: IScheduleSlot[] = [];
      let skipped = 0;

      items.forEach((it, index) => {
        const key = dedupKey(it);
        if (existKeys.has(key)) {
          skipped++;
          onProgress?.(index + 1, items.length);
          return;
        }
        if (mode === 'replace') {
          const match = existing.find(
            (s) => s.id != null && !usedExisting.has(s.id) && slotKey(s) === slotKey(it),
          );
          if (match) {
            before.push({ ...match });
            usedExisting.add(match.id as number);
            existKeys.add(key);
            toPut.push({
              ...match,
              ...it,
              semesterId,
              updatedAt: now,
              deletedAt: 0,
              createdAt: match.createdAt,
            } as IScheduleSlot);
            onProgress?.(index + 1, items.length);
            return;
          }
        }
        existKeys.add(key);
        toAdd.push({ ...it, semesterId, createdAt: now, updatedAt: now, deletedAt: 0 });
        onProgress?.(index + 1, items.length);
      });

      if (toPut.length > 0) await db.schedule_slots.bulkPut(toPut);
      const created: IScheduleSlot[] = [];
      if (toAdd.length > 0) {
        const BATCH = 100;
        for (let i = 0; i < toAdd.length; i += BATCH) {
          const slice = toAdd.slice(i, i + BATCH);
          const ids = (await db.schedule_slots.bulkAdd(slice as IScheduleSlot[], {
            allKeys: true,
          })) as number[];
          slice.forEach((rec, idx) => created.push({ ...rec, id: ids[idx] }));
        }
      }
      return {
        created,
        updated: toPut.filter((r) => r.id != null),
        before,
        skippedDuplicate: skipped,
      };
    });
  }

  /** 撤销导入时恢复被 replace 覆盖的旧记录 */
  async restore(rows: IScheduleSlot[]): Promise<void> {
    const valid = rows.filter((r) => r.id != null);
    if (valid.length === 0) return;
    const now = Date.now();
    await db.transaction('rw', db.schedule_slots, async () => {
      await db.schedule_slots.bulkPut(valid.map((r) => ({ ...r, deletedAt: 0, updatedAt: now })));
    });
  }

  /**
   * 批量软删除（撤销导入用）。只软删尚未删除的记录，返回实际处理条数。
   */
  async softDeleteMany(ids: number[]): Promise<number> {
    const valid = Array.from(new Set(ids.filter((n) => Number.isInteger(n) && n > 0)));
    if (valid.length === 0) return 0;
    const now = Date.now();
    await db.transaction('rw', db.schedule_slots, async () => {
      const rows = await db.schedule_slots.bulkGet(valid);
      const updates = rows
        .filter((r): r is IScheduleSlot => !!r && !r.deletedAt)
        .map((r) => ({ ...r, deletedAt: now, updatedAt: now }));
      if (updates.length > 0) await db.schedule_slots.bulkPut(updates);
    });
    return valid.length;
  }
}

export const slotRepo = new SlotRepository(db.schedule_slots);
export const overrideRepo = new BaseRepository<IScheduleOverride>(db.schedule_overrides);
