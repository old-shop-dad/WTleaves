// TXT/DOCX 题库解析器（鲁棒版）：
//   支持多种现实格式：
//   ① 题型上下文行："填空题"/"判断题"/"简答题"/"单选题"/"多选题" 独占一行
//   ② 括号答案：题干...（答案） 或 (答案)；判断题 √/× → 对/错
//   ③ 题号 + 选项：1. 题干 / A. xx / B. xx / 答案：B / 解析：xx
//   ④ 显式答案行：答案：/正确答案：/参考答案：/【答案】
//   ⑤ 显式解析行：解析：/分析：/说明：
//   没有答案的行自动跳过（避免把背诵知识点当题目）
// EXPORTS: parseTxt

import type { ParseResult, QuestionOption, QuestionType } from './types';
import { emptyResult } from './types';
import { normalizeJudgeAnswer, normalizeOptionKey } from './normalize';

// 题型上下文行
const TYPE_CONTEXT_RE = /^\s*(?:[一二三四五六七八九十\d]+[、.．]?\s*)?(填空题|判断题|简答题|单选题|多选题|选择题|名词解释|论述题)\s*[：:]?\s*$/;
// 题号行
const STEM_RE = /^\s*(?:[（(]?\s*)(\d{1,4})\s*[.、．)）:：]\s*(.+)$/;
// 选项行
const OPTION_RE = /^\s*([A-Ha-h])\s*[.、．)）:：\]】]\s*(.+)$/;
// 显式答案行
const ANSWER_RE = /^\s*(?:【?\s*(?:正确)?答案\s*】?|参考答案|Ans(?:wer)?)\s*[:：]\s*(.+)$/i;
// 显式解析行
const EXPLAIN_RE = /^\s*(?:【?\s*(?:解析|分析|说明|解释)\s*】?)\s*[:：]\s*(.*)$/i;

function typeFromContext(label: string): QuestionType {
  if (label.includes('判断')) return 'judge';
  if (label.includes('简答') || label.includes('论述') || label.includes('名词')) return 'short';
  if (label.includes('多选')) return 'multiple';
  if (label.includes('单选') || label.includes('选择')) return 'single';
  return 'fill';
}

/** 从一行末尾的括号里提取答案："xxx。（RDD）" / "xxx。（√）" / "xxx (A)" */
function extractInlineAnswer(line: string): { stem: string; answer: string[] | null } {
  // 从末尾找括号
  const m = line.match(/[（(]([^（）()]+)[）)]\s*[.。．]?\s*$/);
  if (!m) return { stem: line, answer: null };
  const inner = m[1].trim();
  // 判断题 √/×
  if (/^[√✓对正确是的TtYy1]+$/.test(inner)) return { stem: line.slice(0, m.index).trim(), answer: ['对'] };
  if (/^[×XxFfNn0错否]+$/.test(inner)) return { stem: line.slice(0, m.index).trim(), answer: ['错'] };
  // 多个答案用 | 、 分隔
  const parts = inner.split(/[|｜、,，/]/).map((s) => s.trim()).filter(Boolean);
  return { stem: line.slice(0, m.index).trim(), answer: parts.length ? parts : [inner] };
}

export function parseTxt(text: string): ParseResult {
  const result = emptyResult();
  const lines = text.split(/\r?\n/);

  let currentType: QuestionType | null = null; // 题型上下文
  let pending: {
    stem: string;
    options: QuestionOption[];
    answer: string[];
    explanation: string;
    chapter: string;
  } | null = null;

  const flush = (rowNum: number) => {
    if (!pending) return;
    const p = pending;
    pending = null;
    if (!p.stem) return;
    // 没有答案：跳过（无答案无法刷题），计 warning
    if (p.answer.length === 0) {
      result.warnings.push({ row: rowNum, message: `无答案已跳过：${p.stem.slice(0, 30)}` });
      return;
    }
    // 题型推断
    let type: QuestionType = currentType ?? 'fill';
    if (p.options.length > 0) {
      type = p.answer.length > 1 ? 'multiple' : 'single';
    } else if (type === 'fill' && p.answer.length === 1 && /^(对|错)$/.test(p.answer[0])) {
      type = 'judge';
    }
    // 选项 correct 标记
    const options = p.options.map((o) => ({
      ...o,
      correct: p.answer.includes(o.key),
    }));
    // 答案 key 标准化
    const answer = p.options.length
      ? p.answer.map((a) => normalizeOptionKey(a))
      : p.answer;

    result.questions.push({
      type,
      stem: p.stem,
      options,
      answer,
      explanation: p.explanation,
      chapter: p.chapter || '未分类',
      difficulty: 3,
      tags: [],
      source: 'txt',
    });
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    // 题型上下文行
    const typeM = line.match(TYPE_CONTEXT_RE);
    if (typeM && line.length < 15) {
      flush(i + 1);
      currentType = typeFromContext(typeM[1]);
      continue;
    }

    // 显式答案行
    const ansM = line.match(ANSWER_RE);
    if (ansM && pending) {
      const rawAns = ansM[1].trim();
      // 判断题
      const j = normalizeJudgeAnswer(rawAns);
      if (j) pending.answer = [j];
      else if (pending.options.length > 0 || currentType === 'single' || currentType === 'multiple') {
        // Q9: 选择/判断题才做字母清洗；填空题不洗，保留原文答案
        const keys = rawAns.replace(/[^A-Ha-h]/g, '').toUpperCase().split('');
        pending.answer = keys.length ? keys : [rawAns];
      } else {
        pending.answer = [rawAns];
      }
      continue;
    }

    // 显式解析行
    const expM = line.match(EXPLAIN_RE);
    if (expM && pending) {
      pending.explanation = expM[1]?.trim() ?? '';
      continue;
    }

    // 题号开头的新题
    const stemM = line.match(STEM_RE);
    if (stemM) {
      flush(i + 1);
      let stemText = stemM[2];
      let answer: string[] = [];
      // 题号行也可能带括号答案
      const inline = extractInlineAnswer(stemText);
      if (inline.answer) {
        stemText = inline.stem;
        answer = inline.answer;
      }
      pending = {
        stem: stemText,
        options: [],
        answer,
        explanation: '',
        chapter: '',
      };
      continue;
    }

    // 选项行
    const optM = line.match(OPTION_RE);
    if (optM && pending) {
      pending.options.push({
        key: normalizeOptionKey(optM[1]),
        content: optM[2].trim(),
        correct: false,
      });
      continue;
    }

    // 普通行：如果没有 pending，尝试作为新题（无题号场景）
    if (!pending) {
      // 检测行内括号答案
      const inline = extractInlineAnswer(line);
      if (inline.answer && currentType) {
        pending = {
          stem: inline.stem,
          options: [],
          answer: inline.answer,
          explanation: '',
          chapter: '',
        };
        continue;
      }
      // 无括号、无题号：如果是"填空题"上下文，整行当题干但没答案 → 先存着，等下一行看有没有括号
      // 但为了不把背诵知识点当题，仅在当前题型是 fill/judge 且行较长时尝试
      if (currentType && line.length > 8) {
        pending = {
          stem: line,
          options: [],
          answer: [],
          explanation: '',
          chapter: '',
        };
        continue;
      }
      continue;
    }

    // 已有 pending：可能是多行题干 / 选项后答案 / 括号答案
    // Q10: 行首是"数字+顿号/点"就视为新题开始，不依赖上一句是否以标点结尾
    if (STEM_RE.test(line)) {
      flush(i + 1);
      const newStemM = line.match(STEM_RE)!;
      let stemText = newStemM[2];
      let answer: string[] = [];
      const inline = extractInlineAnswer(stemText);
      if (inline.answer) { stemText = inline.stem; answer = inline.answer; }
      pending = { stem: stemText, options: [], answer, explanation: '', chapter: '' };
      continue;
    }
    // 先试括号答案
    const inline = extractInlineAnswer(line);
    if (inline.answer) {
      // 上一句已完结（以句末标点结尾）→ 当前行是新题，flush 旧题
      const prevDone = /[。.!？!？]$/.test(pending.stem);
      if (prevDone || pending.answer.length > 0) {
        flush(i + 1);
        pending = {
          stem: inline.stem,
          options: [],
          answer: inline.answer,
          explanation: '',
          chapter: '',
        };
        continue;
      }
      // 当前题还没答案且上一句未完 → 把这行的答案接上（多行题干）
      pending.stem = (pending.stem + ' ' + inline.stem).trim();
      pending.answer = inline.answer;
      continue;
    }
    // 否则拼到题干末尾（多行题干）
    pending.stem = (pending.stem + ' ' + line).trim();
  }

  flush(lines.length);
  return result;
}
