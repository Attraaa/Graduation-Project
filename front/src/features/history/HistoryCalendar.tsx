import { ChevronLeft, ChevronRight } from 'lucide-react';
import { longDate, minutesText } from '../dashboard/format';
import { weekdayIndex } from './calendar';
import type { CalendarDay, CalendarView } from './calendar';
import { MODE_DOT, MODE_NAME } from './labels';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const LEGEND = ['upper', 'keyboard', 'eye'] as const;

function DayCell({ day, view, selected, onSelect }: {
  day: CalendarDay; view: CalendarView; selected: boolean; onSelect: (date: string) => void;
}) {
  const dayOfMonth = Number(day.date.slice(8));
  const recorded = day.modes.length > 0;
  const name = view === 'week' ? `${WEEKDAYS[weekdayIndex(day.date)]} ${dayOfMonth}` : String(dayOfMonth);
  const spoken = recorded
    ? `${longDate(day.date)}, ${day.modes.map(mode => MODE_NAME[mode]).join('·')} ${minutesText(day.totalMs)}`
    : `${longDate(day.date)}, 기록 없음`;
  return (
    <button type="button" disabled={day.isFuture} aria-pressed={selected} aria-label={spoken} onClick={() => onSelect(day.date)}
      className={`flex min-h-16 flex-col items-start gap-1 rounded-xl p-2 text-left ${
        selected ? 'border-2 border-heading' : day.isFuture ? 'border border-dashed border-border' : 'border border-border hover:bg-nav-active'
      } ${day.isFuture ? 'cursor-default opacity-40' : recorded ? 'bg-surface' : 'bg-surface-muted'}`}>
      <span className="flex items-center gap-1">
        <span className={`text-sm font-semibold ${recorded ? 'text-heading' : 'text-muted'}`}>{name}</span>
        {day.isToday && <span className="rounded bg-heading px-1 text-[10px] font-bold text-surface">오늘</span>}
      </span>
      {recorded && (
        <span className="flex gap-0.5">
          {day.modes.map(mode => <span key={mode} aria-hidden="true" className={`h-2 w-2 rounded-full ${MODE_DOT[mode]}`} />)}
        </span>
      )}
      {recorded && <span className="text-xs text-muted">{minutesText(day.totalMs)}</span>}
    </button>
  );
}

/** Week or month calendar: mode dots and measured time per day, faded empty days, disabled future days. */
export default function HistoryCalendar({ view, title, days, blanks, selected, canForward, onSelect, onMove }: {
  view: CalendarView; title: string; days: CalendarDay[]; blanks: number; selected: string; canForward: boolean;
  onSelect: (date: string) => void; onMove: (direction: -1 | 1) => void;
}) {
  return (
    <section aria-label="달력" className="rounded-2xl border border-border bg-surface p-4">
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
          {LEGEND.map(mode => (
            <li key={mode} className="flex items-center gap-1">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${MODE_DOT[mode]}`} />{MODE_NAME[mode]}
            </li>
          ))}
        </ul>
      </div>
      {view === 'month' && (
        <div className="mb-1 grid grid-cols-7 gap-2 text-center text-xs text-muted">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
      )}
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: blanks }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
        {days.map(day => <DayCell key={day.date} day={day} view={view} selected={day.date === selected} onSelect={onSelect} />)}
      </div>
    </section>
  );
}
