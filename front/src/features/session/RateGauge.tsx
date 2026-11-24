const LENGTH = Math.PI * 56;

/**
 * 깜빡임처럼 점수가 아닌 분당 횟수를 반원 계기로 보여 줍니다(시안 27). 오른쪽 끝 `max`는 그림의 눈금일 뿐
 * 목표나 정상 기준이 아니어서 구간 색을 칠하지 않습니다. 높이는 `ScoreDial`과 같아 이름 줄이 나란히 섭니다.
 */
export default function RateGauge({ label, value, max = 30, unit = '회/분' }: { label: string; value: number | null; max?: number; unit?: string }) {
  const filled = value === null ? 0 : Math.max(0, Math.min(1, value / max)) * LENGTH;
  return <div className="flex min-w-0 flex-col items-center gap-2 text-center">
    <div className="relative flex h-[104px] w-[132px] shrink-0 flex-col justify-end">
      <svg viewBox="0 0 132 74" className="block h-[74px] w-[132px]" aria-hidden="true">
        <path d="M10 66A56 56 0 0 1 122 66" fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-track" />
        {value !== null && <path d="M10 66A56 56 0 0 1 122 66" fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-muted"
          strokeDasharray={`${filled} ${LENGTH}`} />}
      </svg>
      <div className="flex justify-between px-1.5 text-[11px] leading-[14px] text-muted" aria-hidden="true"><span>0</span><span>{max}</span></div>
      <p className="absolute inset-x-0 bottom-4 flex items-baseline justify-center gap-1 text-[26px] font-black leading-none tabular-nums text-heading">
        {value === null ? '—' : value.toFixed(1)}{value !== null && <small className="text-[11px] font-semibold text-muted">{unit}</small>}
      </p>
    </div>
    <p className="text-sm font-bold text-heading">{label}</p>
  </div>;
}
