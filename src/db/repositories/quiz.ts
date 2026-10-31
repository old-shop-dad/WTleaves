// Quiz 刷题模块仓库：题库/题目/会话/作答/收藏
import { db } from '@/db/db';
import { BaseRepository } from './base';
import type {
  IQuizAttempt, IQuizBank, IQuizFavorite, IQuizQuestion, IQuizSession,
} from '@/db/types';

// EXPORTS: quizBankRepo, quizQuestionRepo, quizSessionRepo, quizAttemptRepo, quizFavoriteRepo

export const quizBankRepo = new BaseRepository<IQuizBank>(db.quiz_banks);
export const quizQuestionRepo = new BaseRepository<IQuizQuestion>(db.quiz_questions);
export const quizSessionRepo = new BaseRepository<IQuizSession>(db.quiz_sessions);
export const quizAttemptRepo = new BaseRepository<IQuizAttempt>(db.quiz_attempts);
export const quizFavoriteRepo = new BaseRepository<IQuizFavorite>(db.quiz_favorites);

/** 某题库下未删除题目，按 order 升序 */
export async function listQuestionsByBank(
  bankId: number,
  opts?: { chapter?: string },
): Promise<IQuizQuestion[]> {
  const rows = await db.quiz_questions
    .where('bankId')
    .equals(bankId)
    .filter((q) => !q.deletedAt)
    .toArray();
  const filtered = opts?.chapter ? rows.filter((q) => q.chapter === opts.chapter) : rows;
  return filtered.sort((a, b) => a.order - b.order);
}

/** 按 questionIds 批量取题（保持传入顺序） */
export async function getQuestionsByIds(ids: number[]): Promise<IQuizQuestion[]> {
  if (!ids.length) return [];
  const rows = await db.quiz_questions.where('id').anyOf(ids).toArray();
  const map = new Map(rows.filter((r) => !r.deletedAt).map((r) => [r.id, r]));
  return ids.map((id) => map.get(id)).filter((r): r is IQuizQuestion => !!r);
}

/** 某题库下已作答过的题目 id（用于"错题练习"取错题） */
export async function listWrongQuestionIds(bankId: number): Promise<number[]> {
  const attempts = await db.quiz_attempts
    .where('bankId')
    .equals(bankId)
    .filter((a) => !a.deletedAt && !a.correct)
    .toArray();
  return [...new Set(attempts.map((a) => a.questionId))];
}

/** 某题是否已被收藏 */
export async function isFavorite(questionId: number): Promise<boolean> {
  const row = await db.quiz_favorites
    .where('questionId')
    .equals(questionId)
    .filter((f) => !f.deletedAt)
    .first();
  return !!row;
}
