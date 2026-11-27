import { clockText, longDate } from '../dashboard/format';
import { entryKey } from './calendar';
import type { HistoryEntry } from './calendar';
import { MODE_DOT, MODE_NAME } from './labels';

/** The selected day's rows: one line per upper session, keyboard and eye, newest first. */
export default function DayRecords({ date, entries, selectedKey, onSelect }: {
  date: string; entries: HistoryEntry[]; selectedKey: string | null; onSelect: (key: string) => void;
}) {
  return (
    <section aria-label={`${longDate(date)} 기록`} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-heading">{`${longDate(date)} 기록`}</h2>
        <span className="shrink-0 text-xs text-muted">{entries.length}회</span>
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
                  <b className="block text-heading">{MODE_NAME[entry.mode]}</b>
                  <span className="block text-xs tabular-nums text-muted">
                    {`${clockText(entry.startedAt, entry.offsetMinutes)} – ${clockText(entry.endedAt, entry.offsetMinutes)}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
