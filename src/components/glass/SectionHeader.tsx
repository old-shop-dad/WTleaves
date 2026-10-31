// 分区标题：粗体标题 + 「更多」入口
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  title: string;
  moreText?: string;
  onMore?: () => void;
  className?: string;
}

export default function SectionHeader({ title, moreText = '更多', onMore, className }: SectionHeaderProps) {
  return (
    <div className={cn('mb-3 flex items-center justify-between', className)}>
      <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
      {onMore ? (
        <button
          type="button"
          onClick={onMore}
          className="text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          {moreText} ›
        </button>
      ) : null}
    </div>
  );
}
