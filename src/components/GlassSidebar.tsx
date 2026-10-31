// 桌面端悬浮玻璃侧导航：距边 12px、通栏高、可折叠 72px 纯图标态
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { GraduationCap, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_GROUPS, isPathActive } from '@/data/nav';

const NS = 'studydesk:nav-collapsed';

export default function GlassSidebar() {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(NS) === '1';
    } catch {
      return false;
    }
  });

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(NS, next ? '1' : '0');
    } catch {
      /* 隐私模式静默 */
    }
  };

  return (
    <aside
      className={cn(
        'fixed left-3 top-3 bottom-3 z-40 flex flex-col rounded-3xl border border-white/70 bg-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_12px_32px_-16px_rgba(30,60,70,0.35)] backdrop-blur-2xl backdrop-saturate-150 transition-[width] duration-300',
        'dark:border-white/10 dark:bg-slate-900/80',
        collapsed ? 'w-[72px]' : 'w-[216px]',
      )}
    >
      {/* 品牌标识 */}
      <div className={cn('flex items-center gap-2.5 px-4 pt-5 pb-4', collapsed && 'justify-center px-0')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_rgba(62,126,140,0.6)]">
          <GraduationCap className="h-5 w-5" />
        </div>
        {!collapsed ? <span className="text-[15px] font-bold tracking-tight text-foreground">StudyDesk</span> : null}
      </div>

      {/* 导航 */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {group.label && !collapsed ? (
              <p className="mb-1.5 px-2 text-[11px] font-medium text-muted-foreground">{group.label}</p>
            ) : null}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isPathActive(pathname, item.path);
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/today'}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-all',
                        collapsed && 'justify-center px-0',
                        active
                          ? 'bg-primary font-medium text-primary-foreground shadow-[0_6px_16px_-6px_rgba(62,126,140,0.55)]'
                          : 'text-muted-foreground hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10',
                      )}
                    >
                      <Icon className={cn('h-[18px] w-[18px] shrink-0', collapsed && 'h-5 w-5')} />
                      {!collapsed ? <span className="truncate">{item.label}</span> : null}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 折叠开关 */}
      <div className={cn('border-t border-white/40 px-3 py-3 dark:border-white/10', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? '展开导航' : '折叠导航'}
          className={cn(
            'flex h-9 items-center gap-2 rounded-xl px-3 text-xs text-muted-foreground transition-colors hover:bg-white/50 hover:text-foreground dark:hover:bg-white/10',
            collapsed && 'w-9 justify-center px-0',
          )}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {!collapsed ? <span>收起</span> : null}
        </button>
      </div>
    </aside>
  );
}
