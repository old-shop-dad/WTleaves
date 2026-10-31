// 题目文本归一化：判断题答案映射、stem 去重归一、选项 key 标准化
// EXPORTS: normalizeJudgeAnswer, normalizeStem, normalizeOptionKey, inferQuestionType

/** 判断题各种写法统一映射为 '对' | '错'；非判断题返回 null */
export function normalizeJudgeAnswer(raw: string): '对' | '错' | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (['对', '正确', '是', '√', '✓', 't', 'true', 'y', 'yes', '1', 'right', 'correct'].includes(v)) return '对';
  if (['错', '错误', '否', '×', 'x', 'f', 'false', 'n', 'no', '0', 'wrong', 'incorrect'].includes(v)) return '错';
  return null;
}

/** stem 归一化（用于去重）：去所有空白、去标点、小写 */
export function normalizeStem(stem: string): string {
  return stem
    .replace(/\s+/g, '')
    .replace(/[，。！？；：""''（）()[\]【】、,.;:!?'"~`]/g, '')
    .toLowerCase();
}

/** 选项 key 标准化：'A'/'a'/1/'1'/'A.'/'A、'/'A)' → 'A' */
export function normalizeOptionKey(raw: string): string {
  const v = raw.trim().toUpperCase();
  const m = v.match(/^([A-Z])/);
  if (m) return m[1];
  // 数字 1-26 映射 A-Z
  const n = Number(v);
  if (Number.isFinite(n) && n >= 1 && n <= 26) return String.fromCharCode(64 + n);
  return v;
}

/** 根据选项与答案数量推断题型 */
export function inferQuestionType(
  optionCount: number,
  answerCount: number,
): 'single' | 'multiple' | 'judge' | 'fill' | 'short' {
  if (optionCount === 0) return answerCount >= 1 ? 'short' : 'fill';
  if (optionCount === 2 && answerCount === 1) {
    const k = answerCount; // placeholder
    void k;
    return 'judge';
  }
  if (answerCount === 1) return 'single';
  return 'multiple';
}
