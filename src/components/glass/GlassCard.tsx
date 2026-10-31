// 液态玻璃基础卡片：材质统一由 .glass-card 提供（token 见 tailwind-theme.css）
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type GlassCardProps = HTMLAttributes<HTMLDivElement>;

export default function GlassCard({ className, children, ...props }: GlassCardProps) {
  return (
    <div
      className={cn('glass-card transition-all duration-300 hover:-translate-y-0.5', className)}
      {...props}
    >
      {children}
    </div>
  );
}
