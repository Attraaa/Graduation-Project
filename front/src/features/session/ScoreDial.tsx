const CIRCUMFERENCE = 2 * Math.PI * 52;

/**
 * 홈 카드의 0–100 점수 다이얼(시안 27). 고리는 점수 크기만 나타내며 점수 산식·임계값은 갖지 않습니다.
 * 값이 없으면 빈 고리와 `—`만 그립니다. 아래 줄은 비어 있어도 높이를 지켜 두 열의 카메라 위치를 맞춥니다.
 */
export default function ScoreDial({ label, value, digits = 0, strokeClass, detail }: {
  label: string; value: number | null; digits?: number; strokeClass: string;
  /** 이름 아래 작은 보조 값(예: 추정 CVA). value가 null이면 `—`. */
  detail?: { label: string; value: string | null };
}) {
  const filled = value === null ? 0 : (Math.max(0, Math.min(100, value)) / 100) * CIRCUMFERENCE;
  return <div className="flex min-w-0 flex-col items-center gap-2 text-center">
    <div className="relative size-[var(--monitor-meter-size,6.5rem)] shrink-0">
      <svg viewBox="0 0 120 120" className="size-full" aria-hidden="true">
        <circle cx="60" cy="60" r="52" fill="none" strokeWidth="9" className="stroke-track" />
        {value !== null && <circle cx="60" cy="60" r="52" fill="none" strokeWidth="9" strokeLinecap="round" className={strokeClass}
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`} transform="rotate(-90 60 60)" />}
      </svg>
      <p className="absolute inset-0 flex items-center justify-center text-[clamp(1.125rem,calc(var(--monitor-meter-size,6.5rem)*0.29),1.875rem)] font-black leading-none tabular-nums text-heading">
        {value === null ? '—' : value.toFixed(digits)}{value !== null && <small className="ml-0.5 mt-[0.35em] text-[11px] font-semibold text-muted">점</small>}
      </p>
    </div>
    <div className="min-w-0">
      <p className="text-sm font-bold text-heading">{label}</p>
      <p className="min-h-4 text-xs leading-4 text-muted">{detail && <>{detail.label} <span className="tabular-nums">{detail.value ?? '—'}</span></>}</p>
    </div>
  </div>;
}
