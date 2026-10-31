// DOCX 题库解析器：用 JSZip 解出 word/document.xml，正则提取纯文本后走 TXT 解析
// EXPORTS: parseDocx

import JSZip from 'jszip';
import { parseTxt } from './txtParser';
import type { ParseResult } from './types';

export async function parseDocx(file: { name: string; text: () => Promise<string>; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<ParseResult> {
  let buf: ArrayBuffer;
  try {
    buf = await file.arrayBuffer();
  } catch (e) {
    return { questions: [], warnings: [], errors: [{ row: 0, message: `文件读取失败：${(e as Error).message}` }] };
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    return { questions: [], warnings: [], errors: [{ row: 0, message: '不是有效的 .docx 文件（zip 解析失败）' }] };
  }

  const docFile = zip.file('word/document.xml');
  if (!docFile) {
    return { questions: [], warnings: [], errors: [{ row: 0, message: 'docx 内未找到 word/document.xml，可能不是 Word 文档' }] };
  }

  const xml = await docFile.async('text');

  // 把 <w:p> 段落转成换行，<w:tab/> 转制表符，其他 <w:r> 内 <w:t> 是文本
  let text = xml
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<w:br\s*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:t[^>]*>/g, '')
    .replace(/<\/w:t>/g, '');

  // 去掉剩余所有 XML 标签
  text = text.replace(/<[^>]+>/g, '');
  // 解码常见 XML 实体
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  const result = parseTxt(text);
  if (!result.questions.length && !result.errors.length) {
    result.warnings.push({ row: 0, message: 'docx 提取到纯文本但未识别出题目结构，请确认格式为「题号.题干 / 选项 / 答案：/ 解析：」' });
  }
  return result;
}
