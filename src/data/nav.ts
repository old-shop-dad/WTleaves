// 导航配置：路由对账表（路径必须已在 app.tsx 注册；激活判断统一从这里读）
import { CalendarDays, CheckCircle2, LayoutGrid, ListTodo, MessageSquareText, NotebookText, Settings, Sun, Timer, Wallet, BookOpen, FileCog } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// EXPORTS: NavItem, NavGroup, NAV_GROUPS, MOBILE_TABS

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { label: '', items: [{ path: '/today', label: '今日', icon: Sun }] },
  {
    label: '学习',
    items: [
      { path: '/schedule', label: '课表', icon: CalendarDays },
      { path: '/tasks', label: '任务', icon: ListTodo },
      { path: '/notes', label: '笔记', icon: NotebookText },
      { path: '/quiz', label: '刷题', icon: BookOpen },
    ],
  },
  {
    label: '生活',
    items: [
      { path: '/habits', label: '习惯打卡', icon: CheckCircle2 },
      { path: '/focus', label: '专注', icon: Timer },
      { path: '/finance', label: '记账', icon: Wallet },
    ],
  },
  { label: '效率', items: [
    { path: '/chat', label: 'AI 助手', icon: MessageSquareText },
    { path: '/docs', label: '文档工具', icon: FileCog },
    { path: '/launcher', label: '启动台', icon: LayoutGrid },
  ] },
  { label: '数据', items: [{ path: '/settings', label: '设置', icon: Settings }] },
];

export const MOBILE_TABS: NavItem[] = [
  { path: '/today', label: '今日', icon: Sun },
  { path: '/schedule', label: '课表', icon: CalendarDays },
  { path: '/tasks', label: '任务', icon: ListTodo },
  { path: '/notes', label: '笔记', icon: NotebookText },
  { path: '/settings', label: '设置', icon: Settings },
];

export function isPathActive(pathname: string, path: string): boolean {
  return path === '/' ? pathname === '/' : pathname.startsWith(path);
}
