import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { liveTimeAxis, liveTimeLabel, type TrendPoint } from './trend';

/** 홈 카드의 남은 높이를 채우는 최근 5분 점수 추이. */
export default function LiveScoreChart({ points, keyboard = false }: { points: TrendPoint[]; keyboard?: boolean }) {
  const lines = keyboard ? [{ key: 'keyboard', name: '키보드', color: 'var(--color-mode-keyboard)' }]
    : [{ key: 'neck', name: '목', color: 'var(--color-mode-upper)' }, { key: 'balance', name: '좌우 균형', color: 'var(--color-mode-shoulder)' }];
  const { end, domain, ticks } = liveTimeAxis(points);
  const hasScore = points.some(point => keyboard ? point.keyboard !== null : point.neck !== null || point.balance !== null);
  return <section aria-label={keyboard ? '키보드 점수 추이' : '목·좌우 균형 점수 추이'} className="flex min-h-0 flex-1 flex-col">
    <div className="mb-1 flex flex-wrap items-center justify-between gap-2"><h3 className="text-[13px] font-bold text-heading">최근 5분</h3>
      <div className="flex gap-3 text-xs text-muted">{lines.map(line => <span key={line.key} className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />{line.name}</span>)}</div>
    </div>
    <div className="relative min-h-0 min-w-0 flex-1">
      {!hasScore ? <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">측정한 점수가 여기에 표시됩니다</p> : <div className="absolute inset-0"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-track)" />
        <XAxis dataKey="at" type="number" domain={domain} ticks={ticks} allowDataOverflow interval="preserveStartEnd" minTickGap={14}
          tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} tickFormatter={at => liveTimeLabel(Number(at), end)} />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} width={28} tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
        <Tooltip labelFormatter={at => liveTimeLabel(Number(at), end)} contentStyle={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: 12 }} />
        {lines.map(line => <Line key={line.key} type="linear" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} strokeDasharray={line.key === 'balance' ? '5 3' : undefined} dot={keyboard ? { r: 2.5 } : false} connectNulls={false} isAnimationActive={false} />)}
      </LineChart></ResponsiveContainer></div>}
    </div>
  </section>;
}
