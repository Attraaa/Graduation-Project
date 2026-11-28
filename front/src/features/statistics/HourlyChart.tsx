import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { LegendItem } from './parts';

/** The main 1-day chart uses the same lines and measured points as the date charts. */
export default function HourlyChart({ label, data, lines, domain, unit, expanded = false, labelFor = hour => `${hour}시`, selectedHour, className }: {
  label: string; data: Record<string, number | null>[]; lines: LegendItem[]; domain: [number, number]; unit: string;
  expanded?: boolean; labelFor?: (slot: number) => string; selectedHour?: number; className?: string;
}) {
  return (
    <div className={className ?? (expanded ? 'h-72' : 'h-28')} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: expanded ? 8 : 4, right: expanded ? 16 : 8, bottom: 0, left: expanded ? 0 : 8 }}>
          {expanded && <CartesianGrid vertical={false} stroke="var(--color-track)" />}
          <XAxis dataKey="hour" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} padding={expanded ? { left: 16, right: 16 } : undefined}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }} tickFormatter={labelFor} />
          <YAxis hide={!expanded} domain={domain} width={30} allowDecimals={false} tickLine={false} axisLine={false}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          {selectedHour !== undefined && <ReferenceLine x={selectedHour} stroke="var(--color-border-strong)" strokeDasharray="3 4" />}
          <Tooltip isAnimationActive={false} content={({ active, label: hour, payload }) => (active && payload?.length ? (
            <div className="rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow">
              <p className="font-semibold text-heading">{labelFor(Number(hour))}</p>
              {payload.map(item => (
                <p key={String(item.dataKey)} className="text-muted">
                  {`${item.name} ${typeof item.value === 'number' ? `${Math.round(item.value)}${item.dataKey === 'coverage' ? '%' : unit}` : '—'}`}
                </p>
              ))}
            </div>
          ) : null)} />
          {lines.map(line => (
            <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={line.color} strokeWidth={expanded ? 2.5 : 2}
              strokeDasharray={line.dashed ? '5 4' : undefined} connectNulls={expanded} isAnimationActive={false}
              dot={expanded ? { r: 4, fill: line.color, stroke: 'var(--color-surface)', strokeWidth: 2 } : { r: 2.5, fill: line.color, strokeWidth: 0 }}
              activeDot={expanded ? { r: 6, fill: line.color, stroke: 'var(--color-surface)', strokeWidth: 2 } : undefined} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
