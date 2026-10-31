// 间隔复习调度：mistakes.box 驱动的待复习队列（阶段二激活）
// EXPORTS: REVIEW_INTERVALS_DAYS, dueAtForBox, recordMistakeAnswer, listDueMistakes, countDueToday

import { db } from '@/db/db';
import type { IMistake } from '@/db/types';

// box 0..N 对应的复习间隔（天）。box 达到 MAX_BOX 视为已掌握，不再安排复习
export const REVIEW_INTERVALS_DAYS = [1, 2, 4, 7, 15, 30];
export const MAX_BOX = 5;

/** 某 box 的下次复习时间（box 越深间隔越长；box>=MAX_BOX 返回远期） */
export function dueAtForBox(box: number, now: number = Date.now()): number {
  const idx = Math.min(Math.max(box, 0), REVIEW_INTERVALS_DAYS.length - 1);
  return now + REVIEW_INTERVALS_DAYS[idx] * 86400000;
}

/**
 * 记录一次错题作答结果（quiz 回流 / 错题复习共用）：
 * - 答错：box 归零，明天再复习（立即安排）
 * - 答对：box+1，按间隔推进；达到 MAX_BOX 视为已掌握
 */
export async function recordMistakeAnswer(questionId: number, correct: boolean): Promise<void> {
  const now = Date.now();
  const existing = await db.mistakes
    .where('sourceId')
    .equals(questionId)
    .filter((m) => !m.deletedAt && m.source === 'quiz')
    .first();

  if (!existing) {
    // 无记录：仅答错时新建错题（答对不需要建）
    if (!correct) {
      // 无题目信息可回填（调用方在无记录答对场景不会走到这里），由 bridgeToMistake 负责新建
      return;
    }
    return;
  }

  const nextBox = correct ? Math.min((existing.box ?? 0) + 1, MAX_BOX + 1) : 0;
  const patch: Partial<IMistake> = {
    box: nextBox,
    reviewedAt: now,
    updatedAt: now,
  };
  if (nextBox > MAX_BOX) {
    // 已掌握：不再安排复习（dueAt 置远期，保留记录供统计）
    patch.dueAt = dueAtForBox(MAX_BOX, now);
  } else {
    patch.dueAt = dueAtForBox(nextBox, now);
  }
  await db.mistakes.update(existing.id!, patch);
}

/** 待复习错题：未删除 且（dueAt 为空的历史数据 或 已到复习时间） */
export async function listDueMistakes(now: number = Date.now()): Promise<IMistake[]> {
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);
  const end = dayEnd.getTime();
  const rows = await db.mistakes
    .filter((m) => !m.deletedAt && m.box <= MAX_BOX && (m.dueAt == null || m.dueAt <= end))
    .toArray();
  return rows.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
}

/** 今日待复习数量（首页卡片/角标用） */
export async function countDueToday(now: number = Date.now()): Promise<number> {
  const rows = await listDueMistakes(now);
  return rows.length;
}
