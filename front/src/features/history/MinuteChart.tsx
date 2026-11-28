import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { clockText } from '../dashboard/format';
import type { MinuteRow } from './detail';
import { MINUTE_LINES } from './labels';

const MINUTE_MS = 60_000;

type PlotRow = Omit<MinuteRow, 'time'>;

/** A single empty row breaks the lines without allocating a point for every missing minute. */
function plotMinutes(rows: MinuteRow[]) {
  const plot: PlotRow[] = [];
  for (const { minute, turtle, balance, rate } of rows) {
    const previous = plot.at(-1);
    if (previous && minute - previous.minute > MINUTE_MS) {
      plot.push({ minute: previous.minute + MINUTE_MS, turtle: null, balance: null, rate: null });
    }
    plot.push({ minute, turtle, balance, rate });
  }
  return plot;
}

/** Blink axis top: at least 20, otherwise the highest rate rounded up to five (the statistics rule). */
const rateTop = (plot: PlotRow[]) => Math.max(20, Math.ceil(Math.max(0, ...plot.map(row => row.rate ?? 0)) / 5) * 5);
const scoreText = (value: number | null) => (value === null ? '—' : `${Math.round(value)}점`);

/**
 * Per-minute picture of one 상체 row (시안 H01): neck and balance scores on top and, under them on the same minute axis,
 * the blink rate. Hovering either part shows one box with every value of that minute.
 */
export default function MinuteChart({ rows, offsetMinutes }: { rows: MinuteRow[]; offsetMinutes: number }) {
  const syncId = useId();
  const hasScores = rows.some(row => row.turtle !== null || row.balance !== null);
  const hasRate = rows.some(row => row.rate !== null);
  if (!hasScores && !hasRate) return <p className="py-6 text-center text-sm text-muted">표시할 분별 기록이 없어요</p>;
  const plot = plotMinutes(rows);
  const formatTime = (minute: number) => clockText(minute, offsetMinutes);
  // Half a minute on each side keeps the first and last minute inside the picture, and both parts share it.
  const domain: [number, number] = [plot[0].minute - MINUTE_MS / 2, plot[plot.length - 1].minute + MINUTE_MS / 2];
  const ticks = rows.length === 1 ? [rows[0].minute] : undefined;
  const top = rateTop(plot);
  const axis = { tickLine: false, axisLine: false, tick: { fill: 'var(--color-muted)', fontSize: 11 } };
  const box = ({ active, payload }: { active?: boolean; payload?: readonly { payload?: unknown }[] }) => {
    const row = active ? payload?.[0]?.payload as PlotRow | undefined : undefined;
    if (!row) return null;
    return (
      <div className="rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow">
        <p className="font-semibold text-heading">{formatTime(row.minute)}</p>
        {hasScores && <p className="text-muted">목 <b className="text-heading">{scoreText(row.turtle)}</b></p>}
        {hasScores && <p className="text-muted">좌우 균형 <b className="text-heading">{scoreText(row.balance)}</b></p>}
        {hasRate && <p className="text-muted">깜빡임 <b className="text-heading">{row.rate === null ? '—' : `${Math.round(row.rate)}회/분`}</b></p>}
      </div>
    );
  };
  return (
    <div className="min-w-0 space-y-1">
      {hasScores && (
        <div className={hasRate ? 'h-44' : 'h-56'} role="img" aria-label="분별 목·좌우 균형 점수">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={plot} syncId={syncId} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-track)" />
              <XAxis dataKey="minute" type="number" scale="time" domain={domain} ticks={ticks} tickFormatter={formatTime}
                hide={hasRate} minTickGap={24} {...axis} />
              <YAxis domain={[0, 100]} allowDecimals={false} width={36} {...axis} />
              <Tooltip isAnimationActive={false} filterNull={false} cursor={{ stroke: 'var(--color-border-strong)' }} content={box} />
              {[MINUTE_LINES.turtle, MINUTE_LINES.balance].map(line => (
                <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={line.color} strokeWidth={2}
                  connectNulls={false} isAnimationActive={false} dot={{ r: 2.5, fill: line.color, strokeWidth: 0 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {hasRate && (
        <div className={hasScores ? 'h-20' : 'h-44'} role="img" aria-label="분별 깜빡임 빈도">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={plot} syncId={syncId} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--color-track)" />
              <XAxis dataKey="minute" type="number" scale="time" domain={domain} ticks={ticks} tickFormatter={formatTime}
                minTickGap={24} {...axis} />
              <YAxis domain={[0, top]} ticks={[0, top]} allowDecimals={false} width={36} {...axis} />
              <Tooltip isAnimationActive={false} filterNull={false} cursor={{ stroke: 'var(--color-border-strong)' }} content={hasScores ? () => null : box} />
              <Area dataKey="rate" name={MINUTE_LINES.rate.name} type="step" stroke={MINUTE_LINES.rate.color} strokeWidth={1.5}
                fill={MINUTE_LINES.rate.color} fillOpacity={0.35} connectNulls={false} isAnimationActive={false}
                dot={{ r: 2.5, fill: MINUTE_LINES.rate.color, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
