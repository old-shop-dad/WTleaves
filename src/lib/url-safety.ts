// 外链安全：仅允许 http/https/mailto，统一新窗口 + noopener
// EXPORTS: isSafeUrl, safeLinkProps, normalizeUrl

const ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:'];

export function isSafeUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return ALLOWED_PROTOCOLS.includes(u.protocol);
  } catch {
    return false;
  }
}

/** 给 <a> 的稳定属性（默认新窗口打开） */
export function safeLinkProps(): { target: '_blank'; rel: 'noopener noreferrer' } {
  return { target: '_blank', rel: 'noopener noreferrer' };
}

/** 缺少协议时补 https://，非法返回空串 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
