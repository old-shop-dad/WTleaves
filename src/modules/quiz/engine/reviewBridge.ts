// 错题回流：刷题答错自动写入 mistakes 表（对齐现有字段）
// EXPORTS: bridgeToMistake

import { db } from '@/db/db';
import { dueAtForBox } from './reviewScheduler';
import type { IQuizQuestion } from '@/db/types';

// Q13: 本次会话已回流的 questionId，避免同一题反复答错反复查库
const bridgedInSession = new Set<number>();

interface MistakeRow {
  id?: number;
  subject: string;
  question: string;
  answer: string;
  source?: string;
  sourceId?: number | null;
  box: number;
  reviewedAt?: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
}

export async function bridgeToMistake(question: IQuizQuestion): Promise<void> {
  try {
    if (question.id == null) return;
    // Q13: 本次会话已回流过的题直接跳过，不查库
    if (bridgedInSession.has(question.id)) return;

    // 查重：同一题已回流过就只更新时间，不重复入库
    const existing = await db.mistakes
      .where('sourceId')
      .equals(question.id)
      .filter((m: MistakeRow) => !m.deletedAt && m.source === 'quiz')
      .first();

    bridgedInSession.add(question.id);

    const now = Date.now();
    if (existing) {
      await db.mistakes.update(existing.id!, { updatedAt: now, reviewedAt: now } as Partial<MistakeRow>);
      return;
    }

    const row: MistakeRow = {
      subject: question.chapter || '刷题错题',
      question: question.stem,
      answer: question.answer.join(' / '),
      source: 'quiz',
      sourceId: question.id ?? null,
      box: 0,
      reviewedAt: now,
      dueAt: dueAtForBox(0, now), // 明天安排复习
      createdAt: now,
      updatedAt: now,
      deletedAt: 0,
    };
    await db.mistakes.add(row);
  } catch (e) {
    // 索引未就绪或 DB 异常时静默降级，不影响答题主流程
    console.warn('bridgeToMistake failed:', e);
  }
}
