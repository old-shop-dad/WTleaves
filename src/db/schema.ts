// Dexie schema v1：全部业务表 + 索引（软删除用 deletedAt=0 表示正常）
// EXPORTS: DB_SCHEMA

export const DB_SCHEMA = {
  semesters: '++id, name, isCurrent, startDate, deletedAt, updatedAt',
  schedule_slots: '++id, semesterId, dayOfWeek, startMin, deletedAt',
  schedule_overrides: '++id, date, semesterId, kind, deletedAt',
  assignments: '++id, semesterId, dueAt, status, priority, deletedAt, createdAt',
  subtasks: '++id, assignmentId, done, sortOrder, deletedAt',
  notes: '++id, title, tags, quick, deletedAt, createdAt, updatedAt',
  note_snapshots: '++id, noteId, createdAt',
  attachments: '++id, noteId, name, deletedAt',
  launcher_groups: '++id, name, sortOrder, deletedAt',
  launcher_items: '++id, groupId, name, url, sortOrder, openCount, deletedAt',
  settings: 'key',
  habits: '++id, name, daysOfWeek, deletedAt',
  habit_logs: '++id, habitId, date, done, deletedAt',
  focus_sessions: '++id, taskId, startedAt, deletedAt',
  mistakes: '++id, subject, box, reviewedAt, deletedAt',
  grades: '++id, semesterId, courseName, date, deletedAt',
  reading_items: '++id, title, status, deletedAt',
  calendar_events: '++id, date, title, deletedAt',
  diary_entries: '++id, date, mood, deletedAt',
  finance_records: '++id, date, categoryId, type, deletedAt',
  budgets: '++id, name, categoryId, deletedAt',
  subjects: '++id, name, deletedAt',
} as const;
