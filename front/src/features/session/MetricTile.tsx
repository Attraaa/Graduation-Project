/** 홈 카드의 숫자 한 줄(이름·숫자·작은 단위). 키보드 열의 판정 가능 비율·판정한 입력에 씁니다. null은 `—`입니다. */
export default function MetricTile({ label, value, unit }: { label: string; value: string | null; unit?: string }) {
  return <div className="min-w-0">
    <p className="truncate text-xs font-bold text-muted" title={label}>{label}</p>
    <p className="whitespace-nowrap text-2xl font-black leading-8 tabular-nums text-heading">
      {value === null ? '—' : <>{value}{unit && <span className="ml-1 text-xs font-medium text-muted">{unit}</span>}</>}
    </p>
  </div>;
}
