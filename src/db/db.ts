// Dexie 实例（数据库名 studydesk，全项目唯一命名空间）
import Dexie, { type Table } from 'dexie';
import { DB_SCHEMA } from './schema';
import type {
  IAssignment, IAttachment, IBudget, ICalendarEvent, IChatConversation, IChatMessage, IDiaryEntry,
  IFocusSession, IFinanceRecord, IGrade, IHabit, IHabitLog,
  ILauncherGroup, ILauncherItem, IMistake, INote, INoteSnapshot,
  IQuizAttempt, IQuizBank, IQuizFavorite, IQuizQuestion, IQuizSession,
  IReadingItem, IScheduleOverride, IScheduleSlot, ISemester, ISetting,
  ISubject, ISubtask,
} from './types';

export class StudyDeskDB extends Dexie {
  semesters!: Table<ISemester, number>;
  schedule_slots!: Table<IScheduleSlot, number>;
  schedule_overrides!: Table<IScheduleOverride, number>;
  assignments!: Table<IAssignment, number>;
  subtasks!: Table<ISubtask, number>;
  notes!: Table<INote, number>;
  note_snapshots!: Table<INoteSnapshot, number>;
  attachments!: Table<IAttachment, number>;
  launcher_groups!: Table<ILauncherGroup, number>;
  launcher_items!: Table<ILauncherItem, number>;
  settings!: Table<ISetting, string>;
  habits!: Table<IHabit, number>;
  habit_logs!: Table<IHabitLog, number>;
  focus_sessions!: Table<IFocusSession, number>;
  mistakes!: Table<IMistake, number>;
  grades!: Table<IGrade, number>;
  reading_items!: Table<IReadingItem, number>;
  calendar_events!: Table<ICalendarEvent, number>;
  diary_entries!: Table<IDiaryEntry, number>;
  finance_records!: Table<IFinanceRecord, number>;
  budgets!: Table<IBudget, number>;
  subjects!: Table<ISubject, number>;
  // Quiz 刷题模块（V2 schema）
  quiz_banks!: Table<IQuizBank, number>;
  quiz_questions!: Table<IQuizQuestion, number>;
  quiz_sessions!: Table<IQuizSession, number>;
  quiz_attempts!: Table<IQuizAttempt, number>;
  quiz_favorites!: Table<IQuizFavorite, number>;
  // AI 聊天模块（V3）
  chat_conversations!: Table<IChatConversation, number>;
  chat_messages!: Table<IChatMessage, number>;

  constructor() {
    super('studydesk');
    this.version(1).stores(DB_SCHEMA);
    // V2：新增 quiz 七表 + mistakes 追加 source 字段（upgrade 补默认值）
    this.version(2)
      .stores({
        quiz_banks: '++id, name, courseId, archived, updatedAt, deletedAt',
        quiz_questions: '++id, bankId, chapter, type, [bankId+order], deletedAt',
        quiz_sessions: '++id, bankId, mode, startedAt, finishedAt, deletedAt',
        quiz_attempts: '++id, sessionId, questionId, bankId, correct, answeredAt, deletedAt',
        quiz_favorites: '++id, questionId, bankId, createdAt, deletedAt',
      })
      .upgrade(async (tx) => {
        await tx.table('mistakes').toCollection().modify((m: IMistake & { source?: string; sourceId?: number | null }) => {
          if (m.source === undefined) m.source = 'manual';
          if (m.sourceId === undefined) m.sourceId = null;
        });
      });

    // V3：AI 聊天
    this.version(3).stores({
      chat_conversations: '++id, title, model, updatedAt, deletedAt',
      chat_messages: '++id, conversationId, role, createdAt, [conversationId+createdAt]',
    });

    // V4：mistakes 表补 sourceId 索引（错题回流按 sourceId 查重必需）
    this.version(4).stores({
      mistakes: '++id, subject, box, reviewedAt, sourceId, deletedAt',
    });

    // V5：assignments 表加 completedAt 索引（"今日完成数"按完成时间统计，而非 updatedAt）
    this.version(5).stores({
      assignments: '++id, semesterId, dueAt, status, priority, completedAt, deletedAt, createdAt',
    });

    // V6：mistakes 加 dueAt 索引（间隔复习待办队列按 dueAt 查询）
    this.version(6).stores({
      mistakes: '++id, subject, box, reviewedAt, sourceId, dueAt, deletedAt',
    });
  }
}

export const db = new StudyDeskDB();
