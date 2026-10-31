// JSON 题库解析器：支持两种结构
//   ① 数组：[{...}, {...}]
//   ② 对象：{ questions: [...] }
// 字段名兼容：stem/question/title、options/choices、answer/correct/answerKeys
// EXPORTS: parseJson

import type { ParseResult, QuestionDTO, QuestionOption, QuestionType } from './types';
import { emptyResult } from './types';

interface RawItem {
  stem?: string; question?: string; title?: string;
  type?: string;
  options?: Array<{ key?: string; content?: string; text?: string; correct?: boolean } | string>;
  answer?: string[] | string; correct?: string[] | string; answerKeys?: string[];
  explanation?: string; analysis?: string;
  chapter?: string; category?: string;
  difficulty?: number;
  tags?: string[];
}

export function parseJson(text: string): ParseResult {
  const result = emptyResult();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    result.errors.push({ row: 0, message: `JSON 解析失败：${(e as Error).message}` });
    return result;
  }

  const arr: RawItem[] = Array.isArray(raw)
    ? raw as RawItem[]
    : (raw as { questions?: RawItem[] })?.questions ?? [];

  if (!Array.isArray(arr) || !arr.length) {
    result.errors.push({ row: 0, message: '未找到题目数组（顶层数组或 {questions:[...]}）' });
    return result;
  }

  arr.forEach((item, i) => {
    const row = i + 1;
    try {
      const q = normalizeItem(item, row, result);
      if (q) result.questions.push(q);
    } catch (e) {
      result.errors.push({ row, message: (e as Error).message });
    }
  });

  return result;
}

function normalizeItem(item: RawItem, row: number, result: ParseResult): QuestionDTO | null {
  const stem = (item.stem || item.question || item.title || '').toString().trim();
  if (!stem) {
    result.errors.push({ row, message: '题干为空' });
    return null;
  }

  // 统一选项
  const options: QuestionOption[] = [];
  if (Array.isArray(item.options)) {
    item.options.forEach((opt, idx) => {
      if (typeof opt === 'string') {
        options.push({ key: String.fromCharCode(65 + idx), content: opt, correct: false });
      } else if (opt && typeof opt === 'object') {
        const key = opt.key || String.fromCharCode(65 + idx);
        options.push({
          key,
          content: opt.content || opt.text || '',
          correct: !!opt.correct,
        });
      }
    });
  }

  // 统一答案
  let answer: string[] = [];
  const rawAns = item.answer ?? item.correct ?? item.answerKeys;
  if (Array.isArray(rawAns)) answer = rawAns.map((s) => String(s).trim()).filter(Boolean);
  else if (rawAns != null) answer = String(rawAns).split(/[，,、|｜\s]+/).map((s) => s.trim()).filter(Boolean);

  // Q11: 先尊重源数据 options.correct；answer 字段用于校验/兜底
  const correctFromOptions = options.filter((o) => o.correct).map((o) => o.key);
  if (!answer.length && correctFromOptions.length) {
    answer = correctFromOptions;
  } else if (correctFromOptions.length && answer.length) {
    // 两者都有：以 options.correct 为准，answer 作为校验日志
    answer = correctFromOptions;
  }

  // 选项 correct 标记同步（key 统一转大写比较，兼容小写/中文 key）
  const answerKeys = answer.map((a) => a.toUpperCase());
  options.forEach((o) => { o.correct = answerKeys.includes(o.key.toUpperCase()); });

  // 推断题型
  let type: QuestionType = (item.type as QuestionType) || 'fill';
  if (!item.type) {
    if (options.length === 0) type = answer.length ? 'fill' : 'short';
    else if (options.length === 2 && (answer[0] === '对' || answer[0] === '错')) type = 'judge';
    else type = answer.length > 1 ? 'multiple' : 'single';
  }

  if (answer.length === 0 && type !== 'short') {
    result.errors.push({ row, message: '无答案' });
    return null;
  }

  return {
    type,
    stem,
    options,
    answer,
    explanation: item.explanation || item.analysis || '',
    chapter: item.chapter || item.category || '未分类',
    difficulty: (item.difficulty as 1|2|3|4|5) || 3,
    tags: item.tags || [],
    source: 'json',
  };
}
