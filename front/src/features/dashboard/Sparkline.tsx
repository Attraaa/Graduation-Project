export interface SparkLine { values: (number | null)[]; strokeClass: string }

const WIDTH = 60, HEIGHT = 20;

/** Seven-day trend; missing days are skipped and their neighbours joined, like the main chart. */
export default function Sparkline({ lines, label }: { lines: SparkLine[]; label: string }) {
  const values = lines.flatMap(line => line.values).filter((value): value is number => value !== null);
  if (values.length < 2) return null;
  const min = Math.min(...values), span = Math.max(...values) - min || 1;
  const points = (series: (number | null)[]) => series.flatMap((value, index) => value === null ? [] : [
    `${((index / Math.max(1, series.length - 1)) * WIDTH).toFixed(1)},${(HEIGHT - 2 - ((value - min) / span) * (HEIGHT - 4)).toFixed(1)}`,
  ]).join(' ');
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-7 w-20" role="img" aria-label={label}>
      {lines.map(line => (
        <polyline key={line.strokeClass} points={points(line.values)} fill="none" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" className={line.strokeClass} />
      ))}
    </svg>
  );
}
