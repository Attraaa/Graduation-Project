import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { clockText } from '../dashboard/format';
import type { LegendItem } from '../statistics/parts';

type MinuteMetric = 'turtle' | 'balance' | 'rate';
export type MinuteChartRow = { minute: number } & Partial<Record<MinuteMetric, number | null>>;
export interface MinuteChartSpec {
  title: string;
  lines: (LegendItem & { key: MinuteMetric })[];
  domain: [number, number | 'auto'];
  unit: string;
}

const MINUTE_MS = 60_000;

/** A single empty row breaks the line without allocating a point for every missing minute. */
function plotMinutes(rows: MinuteChartRow[]) {
  const plot: MinuteChartRow[] = [];
  for (const row of rows) {
    const previous = plot.at(-1);
    if (previous && row.minute - previous.minute > MINUTE_MS) {
      plot.push({ minute: previous.minute + MINUTE_MS, turtle: null, balance: null, rate: null });
    }
    plot.push(row);
  }
  return plot;
}

export default function MinuteChart({ spec, rows, offsetMinutes, className = 'h-56' }: {
  spec: MinuteChartSpec; rows: MinuteChartRow[]; offsetMinutes: number; className?: string;
}) {
  if (!rows.some(row => spec.lines.some(line => typeof row[line.key] === 'number'))) {
    return <p className="py-6 text-center text-sm text-muted">표시할 분별 기록이 없어요</p>;
  }
  const formatTime = (minute: number) => clockText(minute, offsetMinutes);
  const onlyMinute = rows.length === 1 ? rows[0].minute : null;
  return (
    <div className={`min-w-0 ${className}`} role="img" aria-label={spec.title}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={plotMinutes(rows)} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-track)" />
          <XAxis dataKey="minute" type="number" scale="time"
            domain={onlyMinute === null ? ['dataMin', 'dataMax'] : [onlyMinute - MINUTE_MS / 2, onlyMinute + MINUTE_MS / 2]}
            ticks={onlyMinute === null ? undefined : [onlyMinute]} tickFormatter={formatTime}
            tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          <YAxis domain={spec.domain} allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          <Tooltip isAnimationActive={false} labelFormatter={minute => formatTime(Number(minute))}
            formatter={value => (typeof value === 'number' ? `${Math.round(value)}${spec.unit}` : value)} />
          {spec.lines.map(line => (
            <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={line.color} strokeWidth={2}
              strokeDasharray={line.dashed ? '5 4' : undefined} connectNulls={false} isAnimationActive={false}
              dot={{ r: 2.5, fill: line.color, strokeWidth: 0 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
