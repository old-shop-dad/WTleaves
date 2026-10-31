// 文本归一化：全角转半角、统一符号、保留换行
// EXPORTS: normalizeText, splitLines, looksLocation, looksTeacher, cleanCell

export function normalizeText(input: unknown): string {
  if (input == null) return '';
  let s = String(input);
  s = s
    .replace(/\r\n?/g, '\n')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ',')
    .replace(/；/g, ';')
    .replace(/：/g, ':')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/【/g, '[')
    .replace(/】/g, ']')
    .replace(/\u3000/g, ' ')
    .replace(/[～~—–]/g, '-')
    .replace(/[ \t]+/g, ' ');
  return s.trim();
}

export function splitLines(text: string): string[] {
  return normalizeText(text).split('\n').map((l) => l.trim()).filter(Boolean);
}

export function cleanCell(input: unknown): string {
  return normalizeText(input)
    .replace(/^\s+|\s+$/g, '')
    .replace(/\n{3,}/g, '\n\n');
}

const LOCATION_RE = /(楼|室|馆|场|区|号|栋|座|阶|教\d|A\d|B\d|C\d|D\d)/i;
const TEACHER_RE = /(老师|教师|教授|讲师|助教|teacher)/i;

export function looksLocation(text: string): boolean {
  const s = text.trim();
  if (!s || s.length > 24) return false;
  if (/^(无|暂无|-|—|\/)$/.test(s)) return false;
  return LOCATION_RE.test(s);
}

export function looksTeacher(text: string): boolean {
  const s = text.trim();
  if (!s || s.length > 16) return false;
  if (TEACHER_RE.test(s)) return true;
  // “王老师/李教授”之外的常见写法：2~4 个汉字（不含地点特征）
  return /^[\u4e00-\u9fa5·]{2,4}$/.test(s) && !looksLocation(s);
}
