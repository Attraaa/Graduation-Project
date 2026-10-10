const CIRCUMFERENCE = 2 * Math.PI * 16;

/** Ring for a 0–100 value. `unit` '%' is for shares such as properly measured time; scores keep '점'. */
export default function ScoreRing({ value, strokeClass, label, unit = '점' }: {
  value: number | null; strokeClass: string; label: string; unit?: '점' | '%';
}) {
  const filled = value === null ? 0 : (Math.max(0, Math.min(100, value)) / 100) * CIRCUMFERENCE;
  const spoken = value === null ? '기록 없음' : `${Math.round(value)}${unit}`;
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 40 40" className="h-16 w-16" role="img" aria-label={`${label} ${spoken}`}>
        <circle cx="20" cy="20" r="16" fill="none" strokeWidth="5" className="stroke-track" />
        {value !== null && (
          <circle cx="20" cy="20" r="16" fill="none" strokeWidth="5" strokeLinecap="round" className={strokeClass}
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`} transform="rotate(-90 20 20)" />
        )}
        <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize={unit === '%' ? 9 : 11} fontWeight="800"
          className="fill-heading">
          {value === null ? '—' : unit === '%' ? `${Math.round(value)}%` : Math.round(value)}
        </text>
      </svg>
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}
