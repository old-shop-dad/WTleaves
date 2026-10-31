// 会话构建器：按七种模式取题，生成 QuizSession
// EXPORTS: buildSession, BuildSessionInput

import { db } from '@/db/db';
import type { IQuizQuestion, IQuizSession, PracticeMode } from '@/db/types';
import { listQuestionsByBank, listWrongQuestionIds } from '@/db/repositories/quiz';

export interface BuildSessionInput {
  bankId: number;
  mode: PracticeMode;
  chapter?: string;
  count?: number;
  timeLimitSec?: number;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function buildSession(input: BuildSessionInput): Promise<IQuizSession> {
  const { bankId, mode, chapter, count, timeLimitSec } = input;
  let questions: IQuizQuestion[] = [];

  switch (mode) {
    case 'sequential':
      questions = await listQuestionsByBank(bankId, chapter ? { chapter } : undefined);
      break;
    case 'recite':
      questions = await listQuestionsByBank(bankId, chapter ? { chapter } : undefined);
      break;
    case 'random': {
      const all = await listQuestionsByBank(bankId);
      questions = shuffle(all).slice(0, count ?? all.length);
      break;
    }
    case 'chapter':
      // Q8: 未选章节时不过滤，显示全部
      questions = await listQuestionsByBank(bankId, chapter ? { chapter } : undefined);
      break;
    case 'exam': {
      const all = await listQuestionsByBank(bankId);
      questions = shuffle(all).slice(0, count ?? Math.min(20, all.length));
      break;
    }
    case 'wrong': {
      const wrongIds = await listWrongQuestionIds(bankId);
      if (wrongIds.length) {
        const rows = await db.quiz_questions.where('id').anyOf(wrongIds).toArray();
        questions = shuffle(rows.filter((r) => !r.deletedAt));
      }
      break;
    }
    case 'favorite': {
      const favs = await db.quiz_favorites
        .where('bankId')
        .equals(bankId)
        .filter((f) => !f.deletedAt)
        .toArray();
      if (favs.length) {
        const rows = await db.quiz_questions.where('id').anyOf(favs.map((f) => f.questionId)).toArray();
        questions = shuffle(rows.filter((r) => !r.deletedAt));
      }
      break;
    }
  }

  const questionIds = questions.map((q) => q.id!).filter((id): id is number => typeof id === 'number');
  const now = Date.now();

  const session = await db.quiz_sessions.add({
    bankId,
    mode,
    questionIds,
    startedAt: now,
    finishedAt: null,
    timeLimitSec: timeLimitSec ?? null,
    score: null,
    correctCount: 0,
    totalCount: questionIds.length,
    currentIndex: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: 0,
  });

  return {
    id: session,
    bankId,
    mode,
    questionIds,
    startedAt: now,
    finishedAt: null,
    timeLimitSec: timeLimitSec ?? null,
    score: null,
    correctCount: 0,
    totalCount: questionIds.length,
    currentIndex: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: 0,
  };
}
