// 移动端底部悬浮玻璃 Tab 栏：居中胶囊、距底 12px
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { MOBILE_TABS, isPathActive } from '@/data/nav';

export default function MobileTabBar() {
  const { pathname } = useLocation();
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-2xl border border-white/60 bg-white/55 px-2 py-1.5 shadow-[0_12px_32px_-12px_rgba(30,60,70,0.35)] backdrop-blur-2xl lg:hidden dark:border-white/10 dark:bg-white/[0.08]">
      {MOBILE_TABS.map((item) => {
        const Icon = item.icon;
        const active = isPathActive(pathname, item.path);
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/today'}
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[11px] transition-colors',
              active
                ? 'bg-primary/10 font-medium text-primary dark:bg-primary/20'
                : 'text-muted-foreground',
            )}
          >
            <Icon className="h-5 w-5" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
