import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SourceError, SourceLoading } from '../features/dashboard/SourceState';
import { pastDateOrNull } from '../features/dashboard/summary';
import { calendarDays, canMoveForward, entryKey, leadingBlanks, movePeriod, neighborDates, periodTitle, visibleDates } from '../features/history/calendar';
import type { CalendarView } from '../features/history/calendar';
import DayRecords from '../features/history/DayRecords';
import EmptyDay from '../features/history/EmptyDay';
import HistoryCalendar from '../features/history/HistoryCalendar';
import RecordDetail from '../features/history/RecordDetail';
import { useHistoryData } from '../features/history/useHistoryData';
import { useRecordDetail } from '../features/history/useRecordDetail';
import { todayDateKey } from '../features/records/views';

const VIEWS: { id: CalendarView; name: string }[] = [{ id: 'week', name: '주간' }, { id: 'month', name: '월간' }];

const LearningHistory = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const today = todayDateKey();
  const [date, setDate] = useState(() => pastDateOrNull(params.get('date'), today) ?? today);
  const [view, setView] = useState<CalendarView>('week');
  const [picked, setPicked] = useState<string | null>(null);
  const { byDate, status, retry, retryKeyboard } = useHistoryData(view, date, today);
  const loading = status.history === 'loading' || status.keyboard === 'loading';
  const dates = visibleDates(view, date);
  const entries = byDate.get(date) ?? [];
  const selected = entries.find(entry => entryKey(entry) === picked) ?? entries[0] ?? null;
  const detail = useRecordDetail(selected);
  const { previous, next } = neighborDates(byDate, date, today);
  const choose = (day: string) => { setDate(day); setPicked(null); };
  const statistics = `/statistics?end=${date}&days=7${selected ? `&mode=${selected.mode}` : ''}`;

  return (
    <div className="space-y-4 pb-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-heading">학습이력</h1>
          <p className="mt-1 text-sm text-muted">날짜를 고르면 그날 측정한 기록이 보여요</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(statistics)} className="text-sm font-semibold text-secondary hover:underline">
            이 날까지 7일 통계 →
          </button>
          <div role="group" aria-label="달력 보기" className="flex rounded-xl bg-track p-1">
            {VIEWS.map(item => (
              <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)}
                className={`rounded-lg px-3 py-1 text-sm font-semibold ${view === item.id ? 'bg-surface text-heading shadow-sm' : 'text-muted'}`}>
                {item.name}
              </button>
            ))}
          </div>
        </div>
      </header>
      {loading ? (
        <>
          <SourceLoading className="h-40" />
          <SourceLoading className="h-64" />
        </>
      ) : status.history === 'error' ? (
        <SourceError onRetry={retry} />
      ) : (
        <>
          <HistoryCalendar view={view} title={periodTitle(view, dates)} days={calendarDays(dates, byDate, today)}
            blanks={leadingBlanks(view, dates)} selected={date} canForward={canMoveForward(view, date, today)}
            onSelect={choose} onMove={direction => choose(movePeriod(view, date, direction, today))} />
          {status.keyboard === 'error' && (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>키보드 기록을 불러오지 못했어요</span>
              <button type="button" onClick={retryKeyboard}
                className="rounded-lg border border-border px-2 py-1 font-semibold text-heading hover:bg-nav-active">다시 시도</button>
            </div>
          )}
          {selected ? (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <DayRecords date={date} entries={entries} selectedKey={entryKey(selected)} onSelect={setPicked} />
              <RecordDetail entry={selected} query={detail} />
            </div>
          ) : (
            <EmptyDay date={date} isToday={date === today} previous={previous} next={next}
              onSelect={choose} onStart={mode => navigate(`/learn/${mode}`)} />
          )}
        </>
      )}
    </div>
  );
};

export default LearningHistory;
