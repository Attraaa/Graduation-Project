import { SourceError, SourceLoading } from '../dashboard/SourceState';
import { clockText } from '../dashboard/format';
import KeyboardRecordDetail from '../keyboard/KeyboardRecordDetail';
import { isRecordingHere } from '../records/recording';
import MetricTile from '../session/MetricTile';
import { ChartHeader } from '../statistics/parts';
import type { HistoryEntry } from './calendar';
import { detailStats, eyeMinutes, upperMinutes } from './detail';
import { MODE_NAME } from './labels';
import MinuteChart from './MinuteChart';
import type { MinuteChartSpec } from './MinuteChart';
import type { LoadedDetail } from './useRecordDetail';

const CHARTS: Record<'upper' | 'eye', MinuteChartSpec> = {
  upper: {
    title: '분별 점수', domain: [0, 100], unit: '점',
    lines: [{ key: 'turtle', name: '목', color: 'var(--color-mode-upper)' }, { key: 'balance', name: '좌우 균형', color: 'var(--color-mode-shoulder)' }],
  },
  eye: { title: '분별 깜빡임 빈도', domain: [0, 'auto'], unit: '회/분', lines: [{ key: 'rate', name: '분당 깜빡임', color: 'var(--color-mode-eye)' }] },
};

/** Right panel, the same for every record: a few whole numbers without boxes, then one picture (per-minute chart or key heatmap). */
export default function RecordDetail({ entry, query }: {
  entry: HistoryEntry; query: { data: LoadedDetail | null; loading: boolean; error: string | null; retry: () => void };
}) {
  const stats = detailStats(entry);
  const chart = entry.mode === 'keyboard' ? null : CHARTS[entry.mode];
  const data = query.data;
  const source = entry.source;
  const records = source.mode === 'upper' ? source.records : [source.mode === 'eye' ? source.record : source.stored.record];
  const unclosed = records.filter(record => record.status === 'running');
  const running = unclosed.some(record => isRecordingHere(record.owner, record.id));
  const interrupted = records.some(record => record.status === 'interrupted');
  const unconfirmed = unclosed.filter(record => !isRecordingHere(record.owner, record.id));
  return (
    <section aria-label="기록 상세" className="@container space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-heading">
          {`${MODE_NAME[entry.mode]} · ${clockText(entry.startedAt, entry.offsetMinutes)} – ${clockText(entry.endedAt, entry.offsetMinutes)}`}
        </h2>
        {(interrupted || running || entry.legacy) && <span className="text-xs text-muted">
          {[interrupted && '중단됨', running && '기록 중', entry.legacy && '이전 기준'].filter(Boolean).join(' · ')}
        </span>}
      </div>
      {unconfirmed.length > 0 && <p className="text-xs text-muted">
        종료 미확인 · 마지막 저장 {clockText(Math.max(...unconfirmed.map(record => record.updatedAt)), entry.offsetMinutes)}
      </p>}
      <div className={`grid gap-x-4 gap-y-3 border-b border-border pb-4 ${stats.length === 4 ? 'grid-cols-2 @xl:grid-cols-4' : 'grid-cols-3'}`}>
        {stats.map(stat => <MetricTile key={stat.label} label={stat.label} value={stat.value} unit={stat.unit} />)}
      </div>
      {chart && <ChartHeader title={chart.title} legend={chart.lines} />}
      {query.loading ? <SourceLoading className="h-56" />
        : query.error ? <SourceError onRetry={query.retry} />
        : data?.mode === 'upper' ? <MinuteChart spec={CHARTS.upper} rows={upperMinutes(data.details)} offsetMinutes={entry.offsetMinutes} />
        : data?.mode === 'eye' ? <MinuteChart spec={CHARTS.eye} rows={eyeMinutes(data.detail)} offsetMinutes={entry.offsetMinutes} />
        : data?.mode === 'keyboard' ? <KeyboardRecordDetail key={data.stored.record.id} detail={data.stored} />
        : null}
    </section>
  );
}
