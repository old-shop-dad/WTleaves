// 空状态：行动邀请式（不渲染情绪文案）
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ title, description, icon, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon ? <div className="mb-1 text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-[260px] text-xs text-muted-foreground">{description}</p> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground shadow-md transition-transform hover:scale-[1.02]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
