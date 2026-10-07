import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LegendItem } from './parts';

/** Small hour-of-day chart: a dot on every value; hours without values stay gaps (statistics rule). */
export default function HourlyChart({ label, data, lines, domain, unit }: {
  label: string; data: Record<string, number | null>[]; lines: LegendItem[]; domain: [number, number]; unit: string;
}) {
  return (
    <div className="h-28" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <XAxis dataKey="hour" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }} tickFormatter={(hour: number) => `${hour}시`} />
          <YAxis hide domain={domain} />
          <Tooltip isAnimationActive={false} content={({ active, label: hour, payload }) => (active && payload?.length ? (
            <div className="rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow">
              <p className="font-semibold text-heading">{`${hour}시`}</p>
              {payload.map(item => (
                <p key={String(item.dataKey)} className="text-muted">
                  {`${item.name} ${typeof item.value === 'number' ? `${Math.round(item.value)}${unit}` : '—'}`}
                </p>
              ))}
            </div>
          ) : null)} />
          {lines.map(line => (
            <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={line.color} strokeWidth={2}
              connectNulls={false} isAnimationActive={false} dot={{ r: 2.5, fill: line.color, strokeWidth: 0 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
