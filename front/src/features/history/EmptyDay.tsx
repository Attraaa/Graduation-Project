import { Play } from 'lucide-react';
import { longDate } from '../dashboard/format';

export type StartMode = 'upper_body' | 'keyboard';
const STARTS: { id: StartMode; name: string; color: string }[] = [
  { id: 'upper_body', name: '상체', color: 'bg-mode-upper' },
  { id: 'keyboard', name: '키보드', color: 'bg-mode-keyboard' },
];
const LINK = 'text-sm font-semibold text-secondary hover:underline';
const OUTLINE = 'rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-heading hover:bg-nav-active';

/** Today offers the two monitoring starts; a past day offers its closest recorded days. */
export default function EmptyDay({ date, isToday, previous, next, onSelect, onStart }: {
  date: string; isToday: boolean; previous: string | null; next: string | null;
  onSelect: (date: string) => void; onStart: (mode: StartMode) => void;
}) {
  return (
    <section aria-label={`${longDate(date)} 기록`} className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-heading">{`${longDate(date)} 기록`}</h2>
        <span className="text-xs text-muted">0회</span>
      </div>
      {isToday ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-bold text-heading">오늘은 아직 측정하지 않았어요</p>
          <p className="text-sm text-muted">측정을 시작하면 여기에 오늘 기록이 쌓여요.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {STARTS.map(mode => (
              <button key={mode.id} type="button" onClick={() => onStart(mode.id)} className={`flex items-center gap-2 ${OUTLINE}`}>
                <span aria-hidden="true" className={`flex h-6 w-6 items-center justify-center rounded-full text-white ${mode.color}`}>
                  <Play size={12} fill="currentColor" className="ml-0.5" />
                </span>
                {mode.name}
              </button>
            ))}
          </div>
          {previous && (
            <button type="button" onClick={() => onSelect(previous)} className={LINK}>{`← 가장 최근 기록: ${longDate(previous)} 보기`}</button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="font-bold text-heading">이 날은 측정 기록이 없어요</p>
          <div className="flex flex-wrap justify-center gap-2">
            {previous && <button type="button" onClick={() => onSelect(previous)} className={OUTLINE}>{`← ${longDate(previous)} 기록 보기`}</button>}
            {next && <button type="button" onClick={() => onSelect(next)} className={OUTLINE}>{`${longDate(next)} 기록 보기 →`}</button>}
          </div>
        </div>
      )}
    </section>
  );
}
