import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrendPoint } from './trend';

export default function LiveScoreChart({ points, keyboard = false }: { points: TrendPoint[]; keyboard?: boolean }) {
  const lines = keyboard ? [{ key: 'keyboard', name: '키보드', color: 'var(--color-mode-keyboard)' }]
    : [{ key: 'neck', name: '목', color: 'var(--color-mode-upper)' }, { key: 'shoulder', name: '어깨', color: 'var(--color-mode-shoulder)' }];
  const end = points.at(-1)?.at ?? 0;
  return <section aria-label={keyboard ? '키보드 점수 추이' : '목·어깨 점수 추이'} className="rounded-2xl border border-border bg-surface p-4">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold text-heading">{keyboard ? '키보드 점수 추이' : '목·어깨 점수 추이'}</h2><p className="mt-1 text-xs text-muted">최근 5분 · 점</p></div>
      <div className="flex gap-3 text-xs text-muted">{lines.map(line => <span key={line.key} className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />{line.name}</span>)}</div>
    </div>
    <div className="h-52 min-w-0">
      {!points.length ? <p className="flex h-full items-center justify-center text-sm text-muted">측정한 점수가 여기에 표시됩니다</p> : <ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-track)" />
        <XAxis dataKey="at" type="number" domain={[Math.max(points[0].at, end - 300_000), Math.max(end, points[0].at + 1000)]} tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} tickFormatter={(at: number) => `${Math.round((at - end) / 1000)}초`} />
        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} width={32} tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
        <Tooltip labelFormatter={at => `${Math.round((Number(at) - end) / 1000)}초`} contentStyle={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: 12 }} />
        {lines.map(line => <Line key={line.key} type="linear" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2.5} strokeDasharray={line.key === 'shoulder' ? '5 3' : undefined} dot={keyboard ? { r: 3 } : false} connectNulls={false} isAnimationActive={false} />)}
      </LineChart></ResponsiveContainer>}
    </div>
  </section>;
}
