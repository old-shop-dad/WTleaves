// 主题应用：亮 / 暗 / 跟随系统，localStorage 记忆
// EXPORTS: ThemeMode, initTheme, applyTheme

export type ThemeMode = 'light' | 'dark' | 'system';

const THEME_KEY = 'studydesk-theme';

export function getSavedTheme(): ThemeMode {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

export function applyTheme(mode: ThemeMode): void {
  const dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function saveTheme(mode: ThemeMode): void {
  localStorage.setItem(THEME_KEY, mode);
  applyTheme(mode);
}

export function watchSystemTheme(): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => {
    if (getSavedTheme() === 'system') applyTheme('system');
  };
  mq.addEventListener('change', listener);
  return () => mq.removeEventListener('change', listener);
}
