// 任务仓库：作业/DDL + 子任务
import { db } from '@/db/db';
import { BaseRepository } from './base';
import type { IAssignment, ISubtask } from '@/db/types';

// EXPORTS: assignmentRepo, subtaskRepo

class AssignmentRepository extends BaseRepository<IAssignment> {
  /** K4：删除任务时在同一事务中级联软删其所有子任务，避免孤儿数据 */
  async deleteWithSubtasks(id: number): Promise<void> {
    await db.transaction('rw', db.assignments, db.subtasks, async () => {
      const a = await db.assignments.get(id);
      if (a && !a.deletedAt) {
        await db.assignments.put({ ...a, deletedAt: Date.now(), updatedAt: Date.now() });
      }
      const subs = await db.subtasks.where('assignmentId').equals(id).toArray();
      for (const s of subs) {
        if (!s.deletedAt) await db.subtasks.put({ ...s, deletedAt: Date.now() });
      }
    });
  }
}

export const assignmentRepo = new AssignmentRepository(db.assignments);
export const subtaskRepo = new BaseRepository<ISubtask>(db.subtasks);
