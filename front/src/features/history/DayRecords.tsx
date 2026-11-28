import { clockText, longDate } from '../dashboard/format';
import { entryKey } from './calendar';
import type { HistoryEntry } from './calendar';
import { entrySummary } from './detail';
import { MODE_DOT, MODE_NAME } from './labels';

/**
 * The selected day's rows, newest first: one line per 상체 camera run (neck, balance and eye together) and per keyboard
 * session. Under the name and time a short line repeats the main numbers (시안 H01, 2026-11-28); record status stays in
 * the detail panel.
 */
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
          const summary = entrySummary(entry);
          return (
            <li key={key}>
              <button type="button" aria-pressed={selected} onClick={() => onSelect(key)}
                className={`flex w-full flex-col gap-1.5 rounded-xl text-left text-sm ${selected ? 'border-2 border-heading p-[11px]' : 'border border-border p-3 hover:bg-nav-active'}`}>
                <span className="flex w-full items-center justify-between gap-2">
                  <b className="flex items-center gap-1.5 text-heading">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${MODE_DOT[entry.mode]}`} />{MODE_NAME[entry.mode]}
                  </b>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {`${clockText(entry.startedAt, entry.offsetMinutes)} – ${clockText(entry.endedAt, entry.offsetMinutes)}`}
                  </span>
                </span>
                {summary && <span className="text-xs tabular-nums text-muted">{summary}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
