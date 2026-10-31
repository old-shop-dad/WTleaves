// 从不同文件类型提取纯文本，给 AI 解析
// EXPORTS: extractTextFromFile

import * as XLSX from 'xlsx';

/**
 * 支持：
 * - .txt/.csv：直接读文本
 * - .xlsx/.xls：转成 CSV 文本
 * - .docx：JSZip 解 word/document.xml
 * - .pdf/.png/.jpg：暂不支持（提示用户粘贴文本）
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.txt') || name.endsWith('.csv')) {
    return await file.text();
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheets: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
      sheets.push(`=== ${sheetName} ===\n${csv}`);
    }
    return sheets.join('\n\n');
  }

  if (name.endsWith('.docx')) {
    const buf = await file.arrayBuffer();
    const zip = new (await import('jszip')).default();
    const zipObj = await zip.loadAsync(buf);
    const docFile = zipObj.file('word/document.xml');
    if (!docFile) throw new Error('不是有效的 docx 文件');
    const xml = await docFile.async('text');
    // 简单 XML 解析：把 </w:p> 换成换行，去掉所有标签
    return xml
      .replace(/<w:p[^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  if (name.endsWith('.pdf')) {
    throw new Error('PDF 暂不支持自动解析，请把 PDF 内容复制为文本粘贴到下方输入框');
  }

  if (name.match(/\.(png|jpe?g|webp|bmp)$/)) {
    throw new Error('图片暂不支持自动解析，请先 OCR 成文字后粘贴到下方输入框');
  }

  throw new Error(`不支持的文件类型：${file.name}`);
}
