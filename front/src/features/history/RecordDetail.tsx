import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SourceError, SourceLoading } from '../dashboard/SourceState';
import { clockText, scoreText } from '../dashboard/format';
import { EyeDetailData } from '../eye/EyeRecordData';
import KeyboardRecordDetail from '../keyboard/KeyboardRecordDetail';
import { ChartHeader } from '../statistics/parts';
import { percentLabel } from '../statistics/text';
import type { HistoryEntry } from './calendar';
import { upperMinutes, upperTotals } from './detail';
import type { MinuteRow } from './detail';
import { MODE_NAME } from './labels';
import type { LoadedDetail } from './useRecordDetail';

const LINES = [
  { key: 'turtle', name: '목', color: 'var(--color-mode-upper)' },
  { key: 'shoulder', name: '어깨', color: 'var(--color-mode-shoulder)' },
];

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-muted p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-extrabold text-heading">{value}</p>
    </div>
  );
}

function MinuteChart({ rows }: { rows: MinuteRow[] }) {
  if (!rows.length) return <p className="text-sm text-muted">분별 기록이 없어요</p>;
  return (
    <div className="h-56" role="img" aria-label="분별 목·어깨 점수">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-track)" />
          <XAxis dataKey="time" tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={32} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} />
          <Tooltip isAnimationActive={false} formatter={value => (typeof value === 'number' ? Math.round(value) : value)} />
          {LINES.map(line => (
            <Line key={line.key} dataKey={line.key} name={line.name} type="linear" stroke={line.color} strokeWidth={2}
              connectNulls={false} isAnimationActive={false} dot={{ r: 2, fill: line.color, strokeWidth: 0 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Right panel: tiles and a per-minute chart for upper; the existing eye table and keyboard per-key detail. */
export default function RecordDetail({ entry, query }: {
  entry: HistoryEntry; query: { data: LoadedDetail | null; loading: boolean; error: string | null; retry: () => void };
}) {
  const totals = entry.source.mode === 'upper' ? upperTotals(entry.source.records) : null;
  const data = query.data;
  return (
    <section aria-label="기록 상세" className="space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-heading">
          {`${MODE_NAME[entry.mode]} · ${clockText(entry.startedAt, entry.offsetMinutes)} – ${clockText(entry.endedAt, entry.offsetMinutes)}`}
        </h2>
        <span className="text-xs text-muted">{entry.interrupted ? '중단됨' : entry.running ? '기록 중' : '정상 종료'}</span>
      </div>
      {totals && (
        <>
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <Tile label="목" value={entry.turtle === null ? '—' : `${scoreText(entry.turtle)}점`} />
            <Tile label="어깨" value={entry.shoulder === null ? '—' : `${scoreText(entry.shoulder)}점`} />
            <Tile label="기준에서 벗어남" value={`${totals.deviations}회`} />
            <Tile label="제대로 측정" value={percentLabel(totals.validRate)} />
          </div>
          <ChartHeader title="분별 점수" legend={LINES} />
        </>
      )}
      {query.loading ? <SourceLoading className="h-56" />
        : query.error ? <SourceError onRetry={query.retry} />
        : data?.mode === 'upper' ? <MinuteChart rows={upperMinutes(data.details)} />
        : data?.mode === 'eye' ? <EyeDetailData detail={data.detail} />
        : data?.mode === 'keyboard' ? <KeyboardRecordDetail key={data.stored.record.id} detail={data.stored} />
        : null}
    </section>
  );
}
