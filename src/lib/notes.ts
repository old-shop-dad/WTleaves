// 笔记文本工具：摘要提取（剥离代码块 / 链接 / 图片 / markdown 标记）
// EXPORTS: extractSummary

/**
 * 从 Markdown 正文提取纯文本摘要：
 * 1. 剥离围栏代码块与行内代码；
 * 2. 剥离图片 ![alt](url)；
 * 3. 链接 [text](url) -> text；
 * 4. 去掉标题/加粗/斜体等标记符号，压缩空白；
 * 5. 截取前 maxLen 字。
 */
export function extractSummary(content: string, maxLen = 100): string {
  let s = content || '';
  // 围栏代码块
  s = s.replace(/```[\s\S]*?```/g, ' ');
  // 行内代码
  s = s.replace(/`[^`]*`/g, ' ');
  // 图片 ![alt](url)
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  // 链接 [text](url) -> text
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  // 剩余 markdown 标记
  s = s.replace(/[#>*_~-]/g, '');
  // 压缩空白
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, maxLen);
}
