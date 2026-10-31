// 颜色工具：安全地为 hex 色值追加 alpha 通道
// EXPORTS: colorWithAlpha

/**
 * 为 6 位 hex 色值追加 alpha（hex 字符串，如 '22' = 约 13% 不透明度）。
 * 非标准 hex（如命名色、rgb()、已经带 alpha 的色值）原样返回，避免拼出非法 CSS。
 */
export function colorWithAlpha(color: string | undefined | null, alphaHex: string): string {
  if (!color) return `#cccccc${alphaHex}`;
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${alphaHex}`;
  return color;
}
