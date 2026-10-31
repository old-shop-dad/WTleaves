// AI 输出 → QuestionDTO
// EXPORTS: aiQuestionToDTO, aiQuestionsToDTO

import type { AiQuestion } from './types';
import type { QuestionDTO, QuestionOption, QuestionType } from '../parsers/types';
import { normalizeJudgeAnswer } from '../parsers/normalize';

/** 把答案字符串拆成数组："AB" / "A,B" / "A、B" / "北京" → ["A","B"] 或 ["北京"] */
function splitAnswer(raw: string): string[] {
  const v = raw.trim();
  if (!v) return [];
  // 纯字母组合（选择题答案）
  if (/^[A-Ha-h\s,，、|/]+$/.test(v)) {
    return v.replace(/[^A-Ha-h]/g, '').toUpperCase().split('');
  }
  // 多空答案用 、, 分隔
  return v.split(/[、,，|/]/).map((s) => s.trim()).filter(Boolean);
}

export function aiQuestionToDTO(q: AiQuestion): QuestionDTO {
  // 选项
  let options: QuestionOption[] = [];
  if (q.options && q.options.length > 0) {
    options = q.options.map((raw, i) => {
      const m = raw.match(/^\s*([A-Ha-h])\s*[.、)）:：]?\s*(.+)$/);
      const key = m ? m[1].toUpperCase() : String.fromCharCode(65 + i);
      const content = m ? m[2].trim() : raw;
      return { key, content, correct: false };
    });
  }

  // 答案
  let answer: string[];
  const judge = normalizeJudgeAnswer(q.answer);
  if (judge) {
    answer = [judge];
  } else {
    answer = splitAnswer(q.answer);
  }

  // 题型推断
  let type: QuestionType;
  if (options.length === 0) {
    type = answer.length === 1 && (answer[0] === '对' || answer[0] === '错') ? 'judge' : 'fill';
  } else if (answer.length > 1) {
    type = 'multiple';
  } else {
    type = 'single';
  }

  // 选项 correct 同步
  options.forEach((o) => { o.correct = answer.includes(o.key); });

  return {
    type,
    stem: q.stem,
    options,
    answer,
    explanation: q.explanation,
    chapter: '未分类',
    difficulty: 3,
    tags: [],
    source: 'ai',
  };
}

export function aiQuestionsToDTO(list: AiQuestion[]): QuestionDTO[] {
  return list
    .map(aiQuestionToDTO)
    .filter((dto) => dto.stem && dto.answer.length > 0);
}
