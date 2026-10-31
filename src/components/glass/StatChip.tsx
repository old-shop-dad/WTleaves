// 统计小玻璃卡：数字 + 单位 + 标签（今日页顶部三统计）
interface StatChipProps {
  label: string;
  value: string;
  unit?: string;
}

export default function StatChip({ label, value, unit }: StatChipProps) {
  return (
    <div className="glass-chip flex min-w-[88px] flex-col items-center gap-1 px-3 py-2">
      <span className="text-[15px] font-semibold tabular-nums text-foreground">
        {value}
        {unit ? <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">{unit}</span> : null}
      </span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
