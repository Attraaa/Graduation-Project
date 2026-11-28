import { useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dayLabel, longDate } from '../dashboard/format';
import TrendSelection from './TrendSelection';
import type { LegendItem } from './parts';

/**
 * Daily chart shared by the statistics tabs. Dots only on days with values and empty days are joined
 * (dashboard rule); days without this tab's records get a faded date. Clicking a day opens it in history.
 */
export default function DailyChart({ label, data, lines, today, domain, ticks, faded, detail, onSelectDate, selectedDate, unit }: {
  label: string; data: Record<string, string | number | null>[]; lines: LegendItem[]; today: string;
  domain: [number, number]; ticks?: number[]; faded: Set<string>;
  detail: (date: string) => ReactNode; onSelectDate: (date: string) => void; selectedDate?: string; unit?: string;
}) {
  const [picked, setPicked] = useState('');
  const dates = unit ? data.filter(row => typeof row.date === 'string') : [];
  const selection = dates.find(row => row.date === picked) ?? dates.findLast(row => !faded.has(String(row.date))) ?? dates.at(-1);
  const marker = selectedDate ?? (selection && String(selection.date));
  return (
    <>
    <div className="h-72 min-w-0 cursor-pointer" role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          onClick={state => { if (typeof state.activeLabel === 'string') onSelectDate(state.activeLabel); }}>
          <CartesianGrid vertical={false} stroke="var(--color-track)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} padding={{ left: 20, right: 20 }} minTickGap={12}
            tick={props => (
              <text x={props.x} y={props.y} dy={14} textAnchor="middle" fontSize={12}
                fill={faded.has(String(props.payload.value)) ? 'var(--color-border-strong)' : 'var(--color-muted)'}>
                {dayLabel(String(props.payload.value), today)}
              </text>
            )} />
          <YAxis domain={domain} ticks={ticks} tickLine={false} axisLine={false} width={36}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          {marker && <ReferenceLine x={marker} stroke="var(--color-border-strong)" strokeDasharray="3 4" />}
          <Tooltip cursor={{ stroke: 'var(--color-border-strong)' }} filterNull={false} isAnimationActive={false}
            content={({ active, label: date }) => (active && typeof date === 'string' ? detail(date) : null)} />
          {lines.map(line => (
            <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={line.color} strokeWidth={2.5}
              strokeDasharray={line.dashed ? '5 4' : undefined} connectNulls isAnimationActive={false}
              dot={{ r: 4, fill: line.color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: line.color, stroke: 'var(--color-surface)', strokeWidth: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
    {selection && <TrendSelection label="날짜" options={dates.map(row => ({ value: String(row.date), label: longDate(String(row.date)) }))}
      value={String(selection.date)} onChange={setPicked} date={String(selection.date)}>
      {lines.map(line => {
        const value = selection[line.key];
        return <span key={line.key}>{line.name} <b className="text-heading">{typeof value === 'number' ? `${Math.round(value)}${unit}` : '—'}</b></span>;
      })}
    </TrendSelection>}
    </>
  );
}
