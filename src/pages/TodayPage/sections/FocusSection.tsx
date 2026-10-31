// 今日页 · 专注卡：今日专注时长 + 开始专注（跳转 /focus）
import { useNavigate } from 'react-router-dom';
import { Play, Timer } from 'lucide-react';
import GlassCard from '@/components/glass/GlassCard';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/dates';

interface FocusSectionProps {
  focusMin: number;
}

export default function FocusSection({ focusMin }: FocusSectionProps) {
  const navigate = useNavigate();

  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2">
        <Timer className="h-4 w-4 text-primary" />
        <h2 className="text-[15px] font-semibold text-foreground">专注</h2>
        <span className="ml-auto text-sm text-muted-foreground">今日</span>
      </div>
      <div className="mt-3 flex items-end gap-1">
        <span className="text-4xl font-bold tracking-tight tabular-nums text-foreground">
          {formatDuration(focusMin)}
        </span>
        <span className="pb-1 text-sm text-muted-foreground">时长</span>
      </div>
      <Button className="mt-4 w-full gap-2 rounded-xl" onClick={() => navigate('/focus')}>
        <Play className="h-4 w-4" /> 开始专注
      </Button>
    </GlassCard>
  );
}
