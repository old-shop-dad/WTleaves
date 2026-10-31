// 刷题模块统一题目契约（所有解析器输出此结构）
// EXPORTS: QuestionDTO, ParseResult, ParseWarning, ParseError

export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'short';

export interface QuestionOption {
  key: string;
  content: string;
  correct: boolean;
}

export interface QuestionDTO {
  type: QuestionType;
  stem: string;
  options: QuestionOption[];
  answer: string[];
  explanation: string;
  chapter: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  source: string;
}

export interface ParseWarning {
  row: number;
  message: string;
}

export interface ParseError {
  row: number;
  message: string;
  raw?: string;
}

export interface ParseResult {
  questions: QuestionDTO[];
  warnings: ParseWarning[];
  errors: ParseError[];
}

export function emptyResult(): ParseResult {
  return { questions: [], warnings: [], errors: [] };
}
