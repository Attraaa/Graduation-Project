import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SourceError, SourceLoading } from '../dashboard/SourceState';
import { clockText } from '../dashboard/format';
import KeyboardRecordDetail from '../keyboard/KeyboardRecordDetail';
import MetricTile from '../session/MetricTile';
import { ChartHeader } from '../statistics/parts';
import type { LegendItem } from '../statistics/parts';
import type { HistoryEntry } from './calendar';
import { detailStats, eyeMinutes, upperMinutes } from './detail';
import { MODE_NAME } from './labels';
import type { LoadedDetail } from './useRecordDetail';

interface MinuteChartSpec { title: string; lines: LegendItem[]; domain: [number, number | 'auto']; unit: string }
const CHARTS: Record<'upper' | 'eye', MinuteChartSpec> = {
  upper: {
    title: '분별 점수', domain: [0, 100], unit: '점',
    lines: [{ key: 'turtle', name: '목', color: 'var(--color-mode-upper)' }, { key: 'balance', name: '좌우 균형', color: 'var(--color-mode-shoulder)' }],
  },
  eye: { title: '분별 깜빡임 빈도', domain: [0, 'auto'], unit: '회/분', lines: [{ key: 'rate', name: '분당 깜빡임', color: 'var(--color-mode-eye)' }] },
};

function MinuteChart({ spec, rows }: { spec: MinuteChartSpec; rows: object[] }) {
  if (!rows.length) return <p className="text-sm text-muted">분별 기록이 없어요</p>;
  return (
    <div className="h-56" role="img" aria-label={spec.title}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-track)" />
          <XAxis dataKey="time" tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          <YAxis domain={spec.domain} allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          <Tooltip isAnimationActive={false} formatter={value => (typeof value === 'number' ? `${Math.round(value)}${spec.unit}` : value)} />
          {spec.lines.map(line => (
            <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={line.color} strokeWidth={2}
              connectNulls={false} isAnimationActive={false} dot={{ r: 2, fill: line.color, strokeWidth: 0 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Right panel, the same for every record: a few whole numbers without boxes, then one picture (per-minute chart or key heatmap). */
export default function RecordDetail({ entry, query }: {
  entry: HistoryEntry; query: { data: LoadedDetail | null; loading: boolean; error: string | null; retry: () => void };
}) {
  const stats = detailStats(entry);
  const chart = entry.mode === 'keyboard' ? null : CHARTS[entry.mode];
  const data = query.data;
  return (
    <section aria-label="기록 상세" className="@container space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-heading">
          {`${MODE_NAME[entry.mode]} · ${clockText(entry.startedAt, entry.offsetMinutes)} – ${clockText(entry.endedAt, entry.offsetMinutes)}`}
        </h2>
        <span className="text-xs text-muted">{entry.interrupted ? '중단됨' : entry.running ? '기록 중' : '정상 종료'}</span>
      </div>
      <div className={`grid gap-x-4 gap-y-3 border-b border-border pb-4 ${stats.length === 4 ? 'grid-cols-2 @xl:grid-cols-4' : 'grid-cols-3'}`}>
        {stats.map(stat => <MetricTile key={stat.label} label={stat.label} value={stat.value} unit={stat.unit} />)}
      </div>
      {chart && <ChartHeader title={chart.title} legend={chart.lines} />}
      {query.loading ? <SourceLoading className="h-56" />
        : query.error ? <SourceError onRetry={query.retry} />
        : data?.mode === 'upper' ? <MinuteChart spec={CHARTS.upper} rows={upperMinutes(data.details)} />
        : data?.mode === 'eye' ? <MinuteChart spec={CHARTS.eye} rows={eyeMinutes(data.detail)} />
        : data?.mode === 'keyboard' ? <KeyboardRecordDetail key={data.stored.record.id} detail={data.stored} />
        : null}
    </section>
  );
}
