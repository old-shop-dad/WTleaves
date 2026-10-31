// 常用入口分区：歌单封面式卡（首字封面 + 名称 + 打开次数）
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, LayoutGrid } from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';
import SectionHeader from '@/components/glass/SectionHeader';
import EmptyState from '@/components/glass/EmptyState';
import { isSafeUrl } from '@/lib/url-safety';
import type { ILauncherItem } from '@/db/types';

interface EntriesSectionProps {
  entries: ILauncherItem[];
  onOpen: (item: ILauncherItem) => void;
}

const PALETTE = ['#4A90D9', '#5BAE6F', '#F2903D', '#8B74C8', '#4FB3C4', '#E5B93E'];

export default function EntriesSection({ entries, onOpen }: EntriesSectionProps) {
  const navigate = useNavigate();
  return (
    <GlassCard className="p-4">
      <SectionHeader title="常用入口" moreText="更多 ›" onMore={() => navigate('/launcher')} />
      {entries.length === 0 ? (
        <EmptyState
          title="还没有常用入口"
          description="在启动台添加常用网站，一键直达"
          icon={<LayoutGrid className="h-6 w-6" />}
          actionLabel="去启动台"
          onAction={() => navigate('/launcher')}
        />
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {entries.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onOpen(item);
                if (isSafeUrl(item.url)) {
                  window.open(item.url, '_blank', 'noopener,noreferrer');
                }
              }}
              className="group flex flex-col items-center gap-2"
            >
              <span
                className="relative flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-[0_6px_16px_-8px_rgba(30,60,70,0.5)] transition-transform group-hover:scale-105"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              >
                <span className="text-lg font-bold">{item.name.charAt(0).toUpperCase()}</span>
                <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-white/85 text-[10px] text-foreground opacity-0 shadow transition-opacity group-hover:opacity-100 dark:bg-black/60 dark:text-white">
                  <ArrowUpRight className="h-2.5 w-2.5" />
                </span>
              </span>
              <span className="max-w-full truncate text-xs text-foreground">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
