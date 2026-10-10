import type { ReactNode } from 'react';
import { clockText, longDate, minutesText, rateText, scoreText } from '../dashboard/format';
import { entryKey, entryMs } from './calendar';
import type { HistoryEntry } from './calendar';
import { LEGACY_NOTE, MODE_DOT, MODE_NAME } from './labels';

const valueText = (entry: HistoryEntry) => {
  if (entry.mode === 'upper') return `목 ${scoreText(entry.turtle)} · 어깨 ${scoreText(entry.shoulder)}`;
  if (entry.mode === 'keyboard') return entry.score === null ? '판정 자료 없음' : `${scoreText(entry.score)}점`;
  return rateText(entry.rate);
};

function Tag({ children }: { children: ReactNode }) {
  return <span className="ml-1 rounded bg-track px-1 text-xs font-normal text-muted">{children}</span>;
}

/** The selected day's rows: one line per upper session, keyboard and eye, in start order. */
export default function DayRecords({ date, entries, selectedKey, onSelect }: {
  date: string; entries: HistoryEntry[]; selectedKey: string | null; onSelect: (key: string) => void;
}) {
  const total = entries.reduce((sum, entry) => sum + entryMs(entry), 0);
  return (
    <section aria-label={`${longDate(date)} 기록`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-heading">{`${longDate(date)} 기록`}</h2>
        <span className="text-xs text-muted">{`${entries.length}회 · ${minutesText(total)}`}</span>
      </div>
      <ol className="space-y-2">
        {entries.map(entry => {
          const key = entryKey(entry);
          const selected = key === selectedKey;
          return (
            <li key={key}>
              <button type="button" aria-pressed={selected} onClick={() => onSelect(key)}
                className={`flex w-full gap-3 rounded-xl p-3 text-left text-sm ${selected ? 'border-2 border-heading' : 'border border-border hover:bg-nav-active'}`}>
                <span aria-hidden="true" className={`w-1 shrink-0 rounded-full ${MODE_DOT[entry.mode]}`} />
                <span className="min-w-0">
                  <span className="block text-heading">
                    <b>{MODE_NAME[entry.mode]}</b>{` · ${valueText(entry)}`}
                    {entry.interrupted && <Tag>중단됨</Tag>}
                    {entry.running && <Tag>기록 중</Tag>}
                    {entry.legacy && <Tag>이전 기준</Tag>}
                  </span>
                  <span className="block text-xs text-muted">
                    {`${clockText(entry.startedAt, entry.offsetMinutes)} – ${clockText(entry.endedAt, entry.offsetMinutes)} (${minutesText(entryMs(entry))})${entry.coverage === null ? '' : ` · 판정 가능 ${Math.round(entry.coverage)}%`}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {entries.some(entry => entry.legacy) && <p className="mt-auto text-xs text-muted">{LEGACY_NOTE}</p>}
    </section>
  );
}
