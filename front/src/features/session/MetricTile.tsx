/** 홈 카드의 지금 값 한 칸(이름·숫자·작은 단위). 상체와 키보드 카드가 같은 크기로 씁니다. null은 `—`입니다. */
export default function MetricTile({ label, value, unit }: { label: string; value: string | null; unit?: string }) {
  return <div className="min-w-0 rounded-xl border border-border bg-surface-muted px-3 py-2">
    <p className="truncate text-xs font-bold text-muted" title={label}>{label}</p>
    <p className="whitespace-nowrap text-[clamp(1.125rem,2vw,1.5rem)] font-black leading-8 tabular-nums text-heading">
      {value === null ? '—' : <>{value}{unit && <span className="ml-1 text-xs font-medium">{unit}</span>}</>}
    </p>
  </div>;
}
