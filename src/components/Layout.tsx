import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import GlassSidebar from './GlassSidebar';
import MobileTabBar from './MobileTabBar';
import CommandPalette from './CommandPalette';
import QuickAdd from './QuickAdd';
import { seedIfEmpty } from '@/data/seed';
import { requestPersist } from '@/lib/storage-persist';
import { applyTheme, getSavedTheme, watchSystemTheme } from '@/lib/theme';
import { useClassReminders } from '@/lib/schedule/reminders';

export const Layout = () => {
  useEffect(() => {
    void seedIfEmpty();
    void requestPersist();
    applyTheme(getSavedTheme());
    return watchSystemTheme();
  }, []);

  // 上课提醒（设置页开启后生效）
  useClassReminders();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <GlassSidebar />
      <main style={{ marginLeft: 'var(--sidebar-width)' }} className="px-4 pt-6 pb-28 sm:px-6 lg:pt-8 lg:pb-10">
        <div className="mx-auto w-full max-w-[1200px]">
          <Outlet />
        </div>
      </main>
      <MobileTabBar />
      <CommandPalette />
      <QuickAdd />
    </div>
  );
};
