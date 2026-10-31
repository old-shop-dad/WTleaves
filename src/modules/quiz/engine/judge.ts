// 判题逻辑：单选/多选/判断严格比对，填空忽略大小写与首尾空格
// EXPORTS: judge

import type { IQuizQuestion } from '@/db/types';

export function judge(question: IQuizQuestion, userAnswer: string[]): boolean {
  const correct = [...question.answer];
  const user = [...userAnswer];

  if (question.type === 'fill' || question.type === 'short') {
    // 填空/简答：每个正确答案至少匹配一个用户答案（trim + 忽略大小写）
    return correct.every((c) =>
      user.some((u) => u.trim().toLowerCase() === c.trim().toLowerCase()),
    );
  }

  // 选择题（single/multiple/judge）：排序后严格相等
  const a = correct.slice().sort();
  const b = user.slice().sort();
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}
