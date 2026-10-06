import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import DayDetail from './DayDetail';
import { dayLabel } from './format';
import type { DashboardDay } from './summary';

const LINES = [
  { key: 'turtle', name: '목', color: 'var(--color-mode-upper)' },
  { key: 'shoulder', name: '어깨', color: 'var(--color-mode-shoulder)' },
  { key: 'keyboard', name: '키보드', color: 'var(--color-mode-keyboard)' },
] as const;

/** Dots only on recorded days; empty days are skipped and joined (user decision, unlike the hourly statistics chart). */
export default function WeeklyScoreChart({ days, today, floor }: { days: DashboardDay[]; today: string; floor: number }) {
  const data = days.map(day => ({ date: day.date, turtle: day.upper.turtle, shoulder: day.upper.shoulder, keyboard: day.keyboard.score }));
  const ticks = Array.from({ length: Math.round((100 - floor) / 10) + 1 }, (_, index) => floor + index * 10);
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-track)" />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted)', fontSize: 12 }}
            tickFormatter={(date: string) => dayLabel(date, today)} />
          <YAxis domain={[floor, 100]} ticks={ticks} tickLine={false} axisLine={false} width={36}
            tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          <Tooltip cursor={false} filterNull={false} isAnimationActive={false}
            content={({ active, label }) => {
              const day = active ? days.find(item => item.date === label) : undefined;
              return day?.hasRecords ? <DayDetail day={day} /> : null;
            }} />
          {LINES.map(line => (
            <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={line.color} strokeWidth={2.5}
              connectNulls isAnimationActive={false}
              dot={{ r: 4, fill: line.color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: line.color, stroke: 'var(--color-surface)', strokeWidth: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
