// 数据实体类型（I 前缀）。软删除字段 deletedAt：0=正常，>0=删除时间戳
// EXPORTS:
//  ISemester{id,name,startDate,endDate,totalWeeks,isCurrent,createdAt,updatedAt,deletedAt}
//  IScheduleSlot{id,semesterId,title,dayOfWeek,startMin,endMin,location,teacher,weekPattern,color,createdAt,updatedAt,deletedAt}
//  IScheduleOverride{id,date,semesterId,kind,slotId,title,startMin,endMin,location,note,createdAt,deletedAt}
//  IAssignment{id,semesterId,title,type,dueAt,status,priority,note,estimatedMin,createdAt,updatedAt,deletedAt}
//  ISubtask{id,assignmentId,title,done,sortOrder,createdAt,deletedAt}
//  INote{id,title,content,format,tags,quick,createdAt,updatedAt,deletedAt}
//  INoteSnapshot{id,noteId,content,createdAt}
//  IAttachment{id,noteId,name,size,mime,opfsPath,hash,createdAt}
//  ILauncherGroup{id,name,sortOrder,createdAt,deletedAt}
//  ILauncherItem{id,groupId,name,url,sortOrder,openCount,lastOpenedAt,createdAt,deletedAt}
//  ISetting{key,value}
//  IHabit{id,name,icon,color,daysOfWeek,createdAt,updatedAt,deletedAt}
//  IHabitLog{id,habitId,date,done,createdAt}
//  IFocusSession{id,taskId,label,kind,startedAt,endedAt,durationMin,createdAt}
//  IMistake{id,subject,question,answer,source,box,reviewedAt,createdAt,updatedAt,deletedAt}
//  IGrade{id,semesterId,courseName,score,credit,date,createdAt,deletedAt}
//  IReadingItem{id,title,author,status,progress,rating,createdAt,updatedAt,deletedAt}
//  ICalendarEvent{id,date,title,startMin,endMin,color,createdAt,deletedAt}
//  IDiaryEntry{id,date,mood,content,encrypted,createdAt,updatedAt,deletedAt}
//  IFinanceRecord{id,date,categoryId,amount,note,type,createdAt,deletedAt}
//  IBudget{id,name,amount,categoryId,createdAt,deletedAt}
//  ISubject{id,name,color,createdAt,deletedAt}

export interface IBaseEntity {
  id?: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}

export interface ISemester extends IBaseEntity {
  name: string;
  startDate: string; // yyyy-MM-dd
  endDate: string;
  totalWeeks: number;
  isCurrent: boolean;
}

export interface IScheduleSlot extends IBaseEntity {
  semesterId: number;
  title: string;
  dayOfWeek: number; // 0=周日 … 6=周六
  startMin: number;
  endMin: number;
  location?: string;
  teacher?: string;
  weekPattern: WeekPatternStore;
  color?: string;
}

export type WeekPatternStore =
  | { type: 'all' }
  | { type: 'odd'; maxWeek?: number }
  | { type: 'even'; maxWeek?: number }
  | { type: 'weeks'; weeks: number[] };

export interface IScheduleOverride extends IBaseEntity {
  date: string; // yyyy-MM-dd：off=停课日期，move=调到的新日期，added=补课日期
  fromDate?: string; // move 专用：原上课日期（跨周调课时必填，不填则按同周推导）
  semesterId: number;
  kind: 'off' | 'move' | 'added';
  slotId?: number;
  title?: string;
  startMin?: number;
  endMin?: number;
  location?: string;
  note?: string;
}

export type AssignmentType = 'homework' | 'exam' | 'report' | 'reading' | 'other';
export type AssignmentStatus = 'todo' | 'doing' | 'done';
export type AssignmentPriority = 'high' | 'medium' | 'low';

export interface IAssignment extends IBaseEntity {
  semesterId?: number;
  title: string;
  type: AssignmentType;
  dueAt?: number; // 时间戳；无截止日期时为 undefined
  status: AssignmentStatus;
  priority: AssignmentPriority;
  note?: string;
  estimatedMin?: number;
  completedAt?: number; // 标记完成的时间戳（统计"今日完成数"用，避免编辑备注刷新 updatedAt 误计）
}

export interface ISubtask extends IBaseEntity {
  assignmentId: number;
  title: string;
  done: boolean;
  sortOrder: number;
}

export interface INote extends IBaseEntity {
  title: string;
  content: string;
  format: 'markdown' | 'plain';
  tags: string[];
  quick: boolean;
}

export interface INoteSnapshot extends IBaseEntity {
  noteId: number;
  content: string;
}

export interface IAttachment extends IBaseEntity {
  noteId: number;
  name: string;
  size: number;
  mime: string;
  opfsPath: string;
  hash: string;
}

export interface ILauncherGroup extends IBaseEntity {
  name: string;
  sortOrder: number;
}

export interface ILauncherItem extends IBaseEntity {
  groupId: number;
  name: string;
  url: string;
  sortOrder: number;
  openCount: number;
  lastOpenedAt?: number;
}

export interface ISetting {
  key: string;
  value: string;
}

export interface IHabit extends IBaseEntity {
  name: string;
  icon?: string;
  color?: string;
  daysOfWeek: number[];
}

export interface IHabitLog extends IBaseEntity {
  habitId: number;
  date: string; // yyyy-MM-dd
  done: boolean;
}

export interface IFocusSession extends IBaseEntity {
  taskId?: number;
  label?: string;
  kind: 'pomodoro' | 'custom';
  startedAt: number;
  endedAt?: number;
  durationMin: number;
}

export interface IMistake extends IBaseEntity {
  subject: string;
  question: string;
  answer: string;
  source?: string;
  box: number; // 间隔重复盒子
  reviewedAt?: number;
  dueAt?: number; // 下次复习截止时间戳（阶段二：待复习队列调度用）
}

export interface IGrade extends IBaseEntity {
  semesterId?: number;
  courseName: string;
  score: number;
  credit: number;
  date: string;
}

export interface IReadingItem extends IBaseEntity {
  title: string;
  author?: string;
  status: 'reading' | 'done' | 'wish';
  progress: number; // 0-100
  rating?: number;
}

export interface ICalendarEvent extends IBaseEntity {
  date: string; // yyyy-MM-dd
  title: string;
  startMin?: number;
  endMin?: number;
  color?: string;
}

export interface IDiaryEntry extends IBaseEntity {
  date: string;
  mood: string;
  content: string;
  encrypted: boolean;
}

export interface IFinanceRecord extends IBaseEntity {
  date: string;
  categoryId: string;
  amount: number;
  note?: string;
  type: 'income' | 'expense';
}

export interface IBudget extends IBaseEntity {
  name: string;
  amount: number;
  categoryId: string;
}

export interface ISubject extends IBaseEntity {
  name: string;
  color: string;
}

// ============ Quiz 刷题模块（V1）============

export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'short';
export type PracticeMode =
  | 'sequential' | 'random' | 'chapter' | 'exam'
  | 'wrong' | 'favorite' | 'recite';

export interface QuizOption {
  key: string;   // 'A' | 'B' | ...
  content: string;
  correct: boolean;
}

export interface IQuizBank extends IBaseEntity {
  name: string;
  description: string;
  courseId?: number | null;
  source: string;
  questionCount: number;
  tags: string[];
  archived: boolean;
}

export interface IQuizQuestion extends IBaseEntity {
  bankId: number;
  type: QuestionType;
  stem: string;
  options: QuizOption[];
  answer: string[];
  explanation: string;
  chapter: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  order: number;
  source: string;
}

export interface IQuizSession extends IBaseEntity {
  bankId: number;
  mode: PracticeMode;
  questionIds: number[];
  startedAt: number;
  finishedAt?: number | null;
  timeLimitSec?: number | null;
  score?: number | null;
  correctCount: number;
  totalCount: number;
  currentIndex: number;
}

export interface IQuizAttempt extends IBaseEntity {
  sessionId: number;
  questionId: number;
  bankId: number;
  userAnswer: string[];
  correct: boolean;
  durationMs: number;
  answeredAt: number;
  marked: boolean;
}

export interface IQuizFavorite extends IBaseEntity {
  questionId: number;
  bankId: number;
}

// AI 聊天模块（V3 schema）
export interface IChatConversation extends IBaseEntity {
  title: string;        // 对话标题（默认取首条用户消息前 20 字）
  model: string;        // 用的模型名
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  summary?: string;     // 早期对话摘要（上下文裁剪后注入，见 ChatPage）
}

export interface IChatMessage extends IBaseEntity {
  conversationId: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: number;
  // tool 角色消息用于在历史里还原工具调用卡片（Dexie 不强制字段）
  toolName?: string;
  toolOk?: boolean;
}

// mistakes 追加字段（Dexie 不强制字段，upgrade 补默认值）：
//   source?: string        // 'manual' | 'quiz'
//   sourceId?: number | null // quiz 错题对应的 quiz_question.id
