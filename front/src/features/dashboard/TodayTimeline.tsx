import { clockText, minutesText, rateText, scoreText } from './format';
import type { TimelineEntry } from './summary';

const NAME = { upper: '상체', keyboard: '키보드', eye: '안구' } as const;
const BAR = { upper: 'bg-mode-upper', keyboard: 'bg-mode-keyboard', eye: 'bg-mode-eye' } as const;

const valueText = (entry: TimelineEntry) => {
  if (entry.mode === 'upper') return `목 ${scoreText(entry.turtle)} · 어깨 ${scoreText(entry.shoulder)}`;
  if (entry.mode === 'keyboard') return entry.score === null ? '판정 자료 없음' : `${scoreText(entry.score)}점`;
  return rateText(entry.rate);
};

export default function TodayTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) return <p className="text-sm text-muted">오늘 측정한 기록이 없어요</p>;
  return (
    <ol className="space-y-3">
      {entries.map(entry => (
        <li key={`${entry.mode}:${entry.id}`} className="flex gap-3 text-sm">
          <span aria-hidden="true" className={`w-1 shrink-0 rounded-full ${BAR[entry.mode]}`} />
          <div>
            <p className="text-heading">
              <b>{NAME[entry.mode]}</b>{` · ${valueText(entry)}`}
              {entry.interrupted && <span className="ml-1 text-xs text-muted">(중단됨)</span>}
            </p>
            <p className="text-xs text-muted">
              {`${clockText(entry.startedAt, entry.offsetMinutes)} – ${clockText(entry.endedAt, entry.offsetMinutes)} (${minutesText(entry.endedAt - entry.startedAt)})`}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
