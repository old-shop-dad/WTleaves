// 解析器统一入口：按文件名后缀分发到对应解析器
// EXPORTS: parseQuestionFile, supportedExtensions

import type { ParseResult } from './types';
import { parseTxt } from './txtParser';
import { parseJson } from './jsonParser';
import { parseDocx } from './docxParser';

export const supportedExtensions = ['.txt', '.json', '.md', '.markdown', '.docx'];

interface ParsableFile {
  name: string;
  text: () => Promise<string>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

export async function parseQuestionFile(file: ParsableFile): Promise<ParseResult> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.docx')) {
    return parseDocx(file);
  }
  if (name.endsWith('.json')) {
    const text = await file.text();
    return parseJson(text);
  }
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.markdown')) {
    const text = await file.text();
    return parseTxt(text);
  }

  // 兜底：尝试 JSON 再 TXT
  try {
    const text = await file.text();
    return parseJson(text);
  } catch {
    const text = await file.text();
    return parseTxt(text);
  }
}
