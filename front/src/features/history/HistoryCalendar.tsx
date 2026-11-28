import { useLayoutEffect, useRef, type Ref } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { longDate, minutesText } from '../dashboard/format';
import type { SourceStatus } from '../dashboard/SourceState';
import type { CalendarDay } from './calendar';
import { MODE_DOT, MODE_NAME } from './labels';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** 상체 includes the eye since 2026-11-28 (one camera run is one row), so the legend names both parts. */
const LEGEND = [{ mode: 'upper', name: '상체 (자세·눈)' }, { mode: 'keyboard', name: MODE_NAME.keyboard }] as const;
const EMPTY_LABEL = { loading: '기록 불러오는 중', error: '기록을 불러오지 못함', ready: '기록 없음' };

function DayCell({ day, selected, between, recordsStatus, buttonRef, onSelect }: {
  day: CalendarDay; selected: boolean; between: boolean; recordsStatus: SourceStatus; buttonRef?: Ref<HTMLButtonElement>;
  onSelect: (date: string) => void;
}) {
  const dayOfMonth = Number(day.date.slice(8));
  const recorded = day.modes.length > 0;
  const spoken = recorded
    ? `${longDate(day.date)}, ${day.modes.map(mode => MODE_NAME[mode]).join(', ')} ${minutesText(day.totalMs)}`
    : `${longDate(day.date)}, ${EMPTY_LABEL[day.isFuture ? 'ready' : recordsStatus]}`;
  return (
    <button ref={buttonRef} type="button" disabled={day.isFuture} aria-pressed={selected || between} aria-label={spoken} aria-current={day.isToday ? 'date' : undefined}
      onClick={() => onSelect(day.date)}
      className={`flex min-h-13 min-w-0 flex-col items-center gap-1 rounded-lg border px-0.5 py-1.5 text-center sm:min-h-16 sm:items-start sm:rounded-xl sm:p-2 sm:text-left ${
        selected ? 'border-heading bg-nav-active' : between ? 'border-border bg-nav-active'
          : day.isFuture ? 'border-dashed border-border bg-surface-muted' : 'border-border bg-surface hover:bg-nav-active'
      } ${day.isFuture ? 'cursor-default opacity-40' : ''}`}>
      <span className="flex max-w-full flex-wrap items-center gap-1">
        <span className={`text-sm font-semibold ${day.isToday || recorded ? 'text-heading' : 'text-muted'}`}>{dayOfMonth}</span>
        {day.isToday && <span className="hidden rounded bg-heading px-1 text-[10px] font-bold text-surface lg:inline">오늘</span>}
      </span>
      {recorded && (
        <span className="flex gap-0.5">
          {day.modes.map(mode => <span key={mode} aria-hidden="true" className={`h-2 w-2 rounded-full ${MODE_DOT[mode]}`} />)}
        </span>
      )}
      {recorded && <span className="hidden max-w-full text-xs text-muted sm:inline">{minutesText(day.totalMs)}</span>}
    </button>
  );
}

/** Week or month calendar: mode dots and measured time per day, faded empty days, disabled future days. */
export default function HistoryCalendar({ title, days, blanks, selected, rangeEnd = selected, recordsStatus, focusSelected, canForward, onSelect, onMove }: {
  title: string; days: CalendarDay[]; blanks: number; selected: string; rangeEnd?: string;
  recordsStatus: SourceStatus; focusSelected?: boolean; canForward: boolean;
  onSelect: (date: string) => void; onMove: (direction: -1 | 1) => void;
}) {
  const selectedDay = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (focusSelected) selectedDay.current?.focus({ preventScroll: true });
  }, [focusSelected, selected]);
  return (
    <section aria-label="달력" className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="이전 기간" onClick={() => onMove(-1)}
            className="rounded-lg p-1 text-heading hover:bg-nav-active"><ChevronLeft size={18} /></button>
          <h2 className="font-bold text-heading">{title}</h2>
          <button type="button" aria-label="다음 기간" disabled={!canForward} onClick={() => onMove(1)}
            className="rounded-lg p-1 text-heading hover:bg-nav-active disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent">
            <ChevronRight size={18} />
          </button>
        </div>
        <ul className="flex gap-3 text-xs text-muted">
          {LEGEND.map(item => (
            <li key={item.mode} className="flex items-center gap-1">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${MODE_DOT[item.mode]}`} />{item.name}
            </li>
          ))}
        </ul>
      </div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-muted sm:gap-2">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {Array.from({ length: blanks }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
        {days.map(day => <DayCell key={day.date} day={day} selected={day.date === selected || day.date === rangeEnd}
          between={day.date > selected && day.date < rangeEnd} recordsStatus={recordsStatus}
          buttonRef={day.date === selected ? selectedDay : undefined} onSelect={onSelect} />)}
      </div>
    </section>
  );
}
