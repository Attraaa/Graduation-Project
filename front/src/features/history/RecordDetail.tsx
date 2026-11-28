import { SourceError, SourceLoading } from '../dashboard/SourceState';
import { clockText, minutesText } from '../dashboard/format';
import KeyboardRecordDetail from '../keyboard/KeyboardRecordDetail';
import { isRecordingHere } from '../records/recording';
import MetricTile from '../session/MetricTile';
import { ChartHeader } from '../statistics/parts';
import { entryMs } from './calendar';
import type { HistoryEntry } from './calendar';
import { detailStats, upperMinutes } from './detail';
import { MINUTE_LINES, MODE_NAME } from './labels';
import MinuteChart from './MinuteChart';
import type { LoadedDetail } from './useRecordDetail';

const GROUP_DOT = { 자세: 'bg-mode-upper', 눈: 'bg-mode-blink' } as const;

/**
 * Right panel, the same frame for every record (시안 H01, 2026-11-28): a header, whole numbers without boxes (a 상체 row
 * in two named rows, 자세 and 눈), then one picture (상체: per-minute scores over the blink rate; keyboard: key heatmap).
 */
export default function RecordDetail({ entry, query }: {
  entry: HistoryEntry; query: { data: LoadedDetail | null; loading: boolean; error: string | null; retry: () => void };
}) {
  const groups = detailStats(entry);
  const data = query.data;
  const source = entry.source;
  const records = source.mode === 'upper' ? [...source.records, ...(source.eye ? [source.eye] : [])] : [source.stored.record];
  const unclosed = records.filter(record => record.status === 'running');
  const running = unclosed.some(record => isRecordingHere(record.owner, record.id));
  const interrupted = records.some(record => record.status === 'interrupted');
  const unconfirmed = unclosed.filter(record => !isRecordingHere(record.owner, record.id));
  const lines = source.mode === 'upper'
    ? [...(source.records.length ? [MINUTE_LINES.turtle, MINUTE_LINES.balance] : []), ...(source.eye ? [MINUTE_LINES.rate] : [])] : [];
  const tags = [minutesText(entryMs(entry)), interrupted && '중단됨', running && '기록 중', entry.legacy && '이전 기준'];
  return (
    <section aria-label="기록 상세" className="@container space-y-4 rounded-2xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-heading">
          {`${MODE_NAME[entry.mode]} · ${clockText(entry.startedAt, entry.offsetMinutes)} – ${clockText(entry.endedAt, entry.offsetMinutes)}`}
        </h2>
        <span className="text-xs text-muted">{tags.filter(Boolean).join(' · ')}</span>
      </div>
      {unconfirmed.length > 0 && <p className="text-xs text-muted">
        종료 미확인 · 마지막 저장 {clockText(Math.max(...unconfirmed.map(record => record.updatedAt)), entry.offsetMinutes)}
      </p>}
      <div className="space-y-3 border-b border-border pb-4">
        {groups.map(group => group.name ? (
          <div key={group.name} className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <p className="flex w-12 shrink-0 items-center gap-1.5 text-xs font-extrabold text-heading">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${GROUP_DOT[group.name]}`} />{group.name}
            </p>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 @xl:grid-cols-4">
              {group.stats.map(stat => <MetricTile key={stat.label} label={stat.label} value={stat.value} unit={stat.unit} />)}
            </div>
          </div>
        ) : (
          <div key="numbers" className="grid grid-cols-3 gap-x-4 gap-y-3">
            {group.stats.map(stat => <MetricTile key={stat.label} label={stat.label} value={stat.value} unit={stat.unit} />)}
          </div>
        ))}
      </div>
      {lines.length > 0 && <ChartHeader title="분별 기록" legend={lines} />}
      {query.loading ? <SourceLoading className="h-56" />
        : query.error ? <SourceError onRetry={query.retry} />
        : data?.mode === 'upper' ? <MinuteChart rows={upperMinutes(data.details, data.eye)} offsetMinutes={entry.offsetMinutes} />
        : data?.mode === 'keyboard' ? <KeyboardRecordDetail key={data.stored.record.id} detail={data.stored} />
        : null}
    </section>
  );
}
