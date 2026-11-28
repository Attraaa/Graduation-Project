import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { SourceError } from '../features/dashboard/SourceState';
import { pastDateOrNull } from '../features/dashboard/summary';
import { calendarDays, canMoveForward, entryKey, leadingBlanks, movePeriod, neighborDates, periodTitle, visibleDates } from '../features/history/calendar';
import type { CalendarView } from '../features/history/calendar';
import DayRecords from '../features/history/DayRecords';
import EmptyDay from '../features/history/EmptyDay';
import { useMonitoring } from '../features/session/monitoringContext';
import HistoryCalendar from '../features/history/HistoryCalendar';
import RecordDetail from '../features/history/RecordDetail';
import { useHistoryData } from '../features/history/useHistoryData';
import { useRecordDetail } from '../features/history/useRecordDetail';
import { todayDateKey } from '../features/records/views';

const VIEWS: { id: CalendarView; name: string }[] = [{ id: 'week', name: '주간' }, { id: 'month', name: '월간' }];

const LearningHistory = () => {
  const [params, setParams] = useSearchParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const monitoring = useMonitoring();
  const today = todayDateKey();
  const date = pastDateOrNull(params.get('date'), today) ?? today;
  const [view, setView] = useState<CalendarView>('week');
  const [picked, setPicked] = useState<string | null>(null);
  const { byDate, hasLoadedCameraRecords, status, retryHistory, retryKeyboard } = useHistoryData(view, date, today);
  const loading = status.history === 'loading' || status.keyboard === 'loading';
  const calendarStatus = loading ? 'loading' : status.history === 'ready' && status.keyboard === 'ready' ? 'ready' : 'error';
  const dates = visibleDates(view, date);
  const entries = byDate.get(date) ?? [];
  const selected = entries.find(entry => entryKey(entry) === picked) ?? entries[0] ?? null;
  const detail = useRecordDetail(selected);
  const { previous, next } = neighborDates(byDate, date, today);
  const choose = (day: string) => { setParams({ date: day }, { replace: true }); setPicked(null); };

  return (
    <div className="space-y-4 pb-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-heading">학습이력</h1>
        <div className="flex items-center gap-3">
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
      <HistoryCalendar title={periodTitle(view, dates)} days={calendarDays(dates, byDate, today)}
        blanks={leadingBlanks(view, dates)} selected={date} recordsStatus={calendarStatus} focusSelected={state?.focusHistoryDate === true}
        canForward={canMoveForward(view, date, today)}
        onSelect={choose} onMove={direction => choose(movePeriod(view, date, direction, today))} />
      {loading && <p role="status" className="text-sm text-muted">
        {[status.history === 'loading' && '상체·안구', status.keyboard === 'loading' && '키보드'].filter(Boolean).join(', ')} 기록을 불러오는 중이에요
      </p>}
      {status.history === 'error' && <SourceError onRetry={retryHistory}
        message={hasLoadedCameraRecords ? '상체·안구 기록 일부를 불러오지 못했어요' : '상체·안구 기록을 불러오지 못했어요'} />}
      {status.keyboard === 'error' && <SourceError onRetry={retryKeyboard} message="키보드 기록을 불러오지 못했어요" />}
      {selected ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <DayRecords date={date} entries={entries} selectedKey={entryKey(selected)} onSelect={setPicked} />
          <RecordDetail entry={selected} query={detail} />
        </div>
      ) : calendarStatus === 'ready' ? (
        <EmptyDay date={date} isToday={date === today} previous={previous} next={next}
          onSelect={choose} onStart={mode => { (mode === 'upper_body' ? monitoring.upper : monitoring.keyboard).start(); navigate('/dashboard'); }} />
      ) : null}
    </div>
  );
};

export default LearningHistory;
