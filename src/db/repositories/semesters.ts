// 学期仓库
import { db } from '@/db/db';
import { BaseRepository } from './base';
import type { IAssignment, IScheduleSlot, ISemester } from '@/db/types';

// EXPORTS: semesterRepo

class SemesterRepository extends BaseRepository<ISemester> {
  async getCurrent(): Promise<ISemester | undefined> {
    const all = await this.list();
    return all.find((s) => s.isCurrent) ?? all[0];
  }

  // S4: 新建学期时在 transaction 中清除其他学期的 isCurrent，避免两个"当前学期"
  async create(data: Omit<ISemester, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<ISemester> {
    const now = Date.now();
    const record = { ...data, createdAt: now, updatedAt: now, deletedAt: 0 } as unknown as ISemester;
    const id = await db.transaction('rw', db.semesters, async () => {
      const all = await db.semesters.toArray();
      for (const s of all) {
        if (s.isCurrent) await db.semesters.update(s.id!, { isCurrent: false, updatedAt: now });
      }
      return await db.semesters.add(record);
    });
    return { ...record, id };
  }

  // S5: 列出所有未删除学期（含历史）
  async listAll(): Promise<ISemester[]> {
    return db.semesters.filter((s) => !s.deletedAt).toArray();
  }

  // S5: 设为当前
  async setCurrent(id: number): Promise<void> {
    const now = Date.now();
    await db.transaction('rw', db.semesters, async () => {
      const all = await db.semesters.toArray();
      for (const s of all) {
        await db.semesters.update(s.id!, { isCurrent: s.id === id, updatedAt: now });
      }
    });
  }

  // S5: 删除前检查是否有课表/任务引用
  async hasReferences(id: number): Promise<{ slots: number; assignments: number }> {
    const slots = await db.schedule_slots.where('semesterId').equals(id).filter((s) => !s.deletedAt).count();
    const assignments = await db.assignments.where('semesterId').equals(id).filter((a) => !a.deletedAt).count();
    return { slots, assignments };
  }

  // 阶段一：删除学期并级联软删其课表/任务（事务保证一致性，避免孤儿数据）
  async removeWithReferences(id: number): Promise<{ slots: number; assignments: number }> {
    const now = Date.now();
    return db.transaction('rw', [db.semesters, db.schedule_slots, db.assignments], async () => {
      const sem = await db.semesters.get(id);
      if (!sem) return { slots: 0, assignments: 0 };
      await db.semesters.put({ ...sem, deletedAt: now, updatedAt: now });
      // 级联软删该学期下的课表与任务
      let slots = 0;
      let assignments = 0;
      await db.schedule_slots
        .where('semesterId').equals(id)
        .filter((s) => !s.deletedAt)
        .each((s) => {
          slots++;
          db.schedule_slots.put({ ...s, deletedAt: now, updatedAt: now } as IScheduleSlot);
        });
      await db.assignments
        .where('semesterId').equals(id)
        .filter((a) => !a.deletedAt)
        .each((a) => {
          assignments++;
          db.assignments.put({ ...a, deletedAt: now, updatedAt: now } as IAssignment);
        });
      return { slots, assignments };
    });
  }
}

export const semesterRepo = new SemesterRepository(db.semesters);
