// 生活方式仓库：习惯 / 打卡 / 专注（V2 模块数据，今日页统计会读取）
import { db } from '@/db/db';
import { BaseRepository } from './base';
import type { IFocusSession, IHabit, IHabitLog } from '@/db/types';

// EXPORTS: habitRepo, habitLogRepo, focusRepo

export const habitRepo = new BaseRepository<IHabit>(db.habits);

class HabitLogRepository extends BaseRepository<IHabitLog> {
  /** 按习惯 id 批量索引查询（避免全量 list 后再 JS 过滤） */
  async findByHabitIds(ids: number[]): Promise<IHabitLog[]> {
    if (ids.length === 0) return [];
    const rows = await db.habit_logs.where('habitId').anyOf(ids).toArray();
    return rows.filter((r) => !r.deletedAt);
  }
}
export const habitLogRepo = new HabitLogRepository(db.habit_logs);

export const focusRepo = new BaseRepository<IFocusSession>(db.focus_sessions);
