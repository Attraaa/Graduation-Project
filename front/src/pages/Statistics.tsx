import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import DayDetail from '../features/dashboard/DayDetail';
import { SourceError, SourceLoading } from '../features/dashboard/SourceState';
import { pastDateOrNull } from '../features/dashboard/summary';
import KeyboardStatistics from '../features/keyboard/KeyboardStatistics';
import { todayDateKey } from '../features/records/views';
import UpperBodyPanel from '../features/statistics/UpperBodyPanel';
import type { PeriodDays } from '../features/statistics/period';
import { rangeText } from '../features/statistics/text';
import { useStatisticsData } from '../features/statistics/useStatisticsData';

/** Two tabs since 2026-11-28 (시안 S02): 상체 carries the eye, measured by the same camera, as its 눈 section. */
type StatMode = 'upper' | 'keyboard';
const MODES: { id: StatMode; name: string; dot: string }[] = [
  { id: 'upper', name: '상체', dot: 'bg-mode-upper' },
  { id: 'keyboard', name: '키보드', dot: 'bg-mode-keyboard' },
];
const PERIODS: PeriodDays[] = [1, 7, 30];

export default function Statistics() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { state } = useLocation();
  const today = todayDateKey();
  const end = pastDateOrNull(params.get('end'), today) ?? today;
  const requestedDays = Number(params.get('days'));
  const days = requestedDays === 7 || requestedDays === 30 ? requestedDays : 1;
  const requestedMode = params.get('mode');
  const mode: StatMode = requestedMode === 'keyboard' ? 'keyboard' : 'upper';
  // The former 안구 tab: an old `mode=eye` address opens 상체 at its 눈 section.
  const focusEye = requestedMode === 'eye';
  const update = (key: 'end' | 'days' | 'mode', next: string) => setParams(current => {
    const updated = new URLSearchParams(current);
    updated.set(key, next);
    return updated;
  }, { replace: true });
  const { summary, keyboard, status, retrySource } = useStatisticsData(end, days);
  const tabs = useRef<Partial<Record<StatMode, HTMLButtonElement | null>>>({});
  useLayoutEffect(() => {
    if (state?.focusStatisticsTab) tabs.current[mode]?.focus({ preventScroll: true });
  }, [mode, state]);
  const switchTab = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = MODES.findIndex(item => item.id === mode);
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = (index + MODES.length - 1) % MODES.length; break;
      case 'ArrowRight': next = (index + 1) % MODES.length; break;
      case 'Home': next = 0; break;
      case 'End': next = MODES.length - 1; break;
      default: return;
    }
    event.preventDefault();
    update('mode', MODES[next].id);
    tabs.current[MODES[next].id]?.focus();
  };
  const openHistory = (date: string) => navigate(`/history?date=${date}`, { state: { focusHistoryDate: true } });
  const detail = (date: string) => {
    const day = summary.days.find(item => item.date === date);
    return day?.hasRecords ? <DayDetail day={day} hint="눌러서 학습이력 보기 →" /> : null;
  };
  const shared = { today, detail, onSelectDate: openHistory, onOpenHistory: () => openHistory(end) };
  const panel = (id: StatMode) => {
    if (id === 'keyboard') {
      return status.keyboard === 'loading' ? <SourceLoading className="h-96" />
        : status.keyboard === 'error' ? <SourceError onRetry={retrySource.keyboard} />
        : <KeyboardStatistics data={keyboard} date={end} days={days} {...shared} />;
    }
    return status.posture === 'loading' && status.eye === 'loading' ? <SourceLoading className="h-96" />
      : <UpperBodyPanel summary={summary} periodDays={days} focusEye={focusEye}
        status={{ posture: status.posture, eye: status.eye }} retry={{ posture: retrySource.posture, eye: retrySource.eye }} {...shared} />;
  };

  return (
    <div className="space-y-4 pb-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-heading">통계</h1>
        <div className="flex flex-wrap items-center gap-3">
          {days === 1 ? <input type="date" aria-label="조회 날짜" value={end} max={today}
            onChange={event => { if (pastDateOrNull(event.target.value, today)) update('end', event.target.value); }}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-heading" />
            : <span className="text-sm text-muted">{rangeText(summary.range.dates[0], end)}</span>}
          {end !== today && (
            <button type="button" onClick={() => update('end', today)} className="text-sm font-semibold text-secondary-text hover:underline">{days === 1 ? '오늘 보기' : '오늘까지 보기'}</button>
          )}
          <div role="group" aria-label="기간" className="flex rounded-xl bg-track p-1">
            {PERIODS.map(value => (
              <button key={value} type="button" aria-pressed={days === value} onClick={() => update('days', String(value))}
                className={`rounded-lg px-3 py-1 text-sm font-semibold ${days === value ? 'bg-surface text-heading shadow-sm' : 'text-muted'}`}>
                {`${value}일`}
              </button>
            ))}
          </div>
        </div>
      </header>
      <div role="tablist" aria-label="모드" className="flex flex-wrap gap-2">
        {MODES.map(item => (
          <button key={item.id} ref={element => { tabs.current[item.id] = element; }} type="button" role="tab" aria-selected={mode === item.id}
            id={`stats-tab-${item.id}`} aria-controls={`stats-panel-${item.id}`} tabIndex={mode === item.id ? 0 : -1}
            onKeyDown={switchTab} onClick={() => update('mode', item.id)}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ${mode === item.id ? 'bg-heading text-surface' : 'border border-border bg-surface text-heading'}`}>
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${item.dot}`} />{item.name}
          </button>
        ))}
      </div>
      {MODES.map(item => <section key={item.id} role="tabpanel" id={`stats-panel-${item.id}`}
        aria-labelledby={`stats-tab-${item.id}`} hidden={mode !== item.id}>
        {mode === item.id && panel(item.id)}
      </section>)}
    </div>
  );
}
