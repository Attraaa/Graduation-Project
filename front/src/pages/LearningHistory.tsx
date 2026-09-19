import { useCallback, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { getLearningMode } from '../data/modes';
import { historyView, historyGraph, todayDateKey } from '../features/records/views';
import type { HistorySession } from '../features/records/views';
import { useRecordQuery } from '../features/records/useRecordQuery';
import { recordsApi, recordValue } from '../features/records/api';
import { getCurrentUser } from '../utils/authStore';
import Button from '../components/Button';

const calendarViews = [
  { id: 'day', label: '일간' },
  { id: 'week', label: '주간' },
  { id: 'month', label: '월간' },
] as const;
type CalendarView = (typeof calendarViews)[number]['id'];

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const dateFormatter = new Intl.DateTimeFormat('en-CA');

const toDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const toDateKey = (date: Date) => dateFormatter.format(date);


const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const addMonths = (date: Date, months: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months, 1);
  return next;
};

const getWeekDates = (selectedDate: string) => {
  const selected = toDate(selectedDate);
  const start = addDays(selected, -selected.getDay());
  return Array.from({ length: 7 }, (_, index) => toDateKey(addDays(start, index)));
};

const getMonthDates = (selectedDate: string) => {
  const selected = toDate(selectedDate);
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const lastDate = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: lastDate }, (_, index) => toDateKey(new Date(year, month, index + 1)));
};

const getVisibleDates = (view: CalendarView, selectedDate: string) => {
  if (view === 'day') return [selectedDate];
  if (view === 'month') return getMonthDates(selectedDate);
  return getWeekDates(selectedDate);
};

const getCalendarTitle = (view: CalendarView, selectedDate: string) => {
  const date = toDate(selectedDate);
  if (view === 'day') return `${selectedDate} 일간`;
  if (view === 'week') {
    const weekDates = getWeekDates(selectedDate);
    return `${weekDates[0]} ~ ${weekDates[6]}`;
  }
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
};

const getDayColor = (date: string) => {
  const day = toDate(date).getDay();
  if (day === 0) return 'text-[#ff4b4b]';
  if (day === 6) return 'text-[#1cb0f6]';
  return 'text-gray-800';
};

const LearningHistory = () => {
  const [selectedDate, setSelectedDate] = useState(todayDateKey);
  const [calendarView, setCalendarView] = useState<CalendarView>('week');
  const [selectedSession, setSelectedSession] = useState<HistorySession | null>(null);

  const [page, setPage] = useState(0);
  const owner = getCurrentUser()?.id ?? '';
  const visibleDates = useMemo(() => getVisibleDates(calendarView, selectedDate), [calendarView, selectedDate]);
  const monthLeadingBlankCount = calendarView === 'month' && visibleDates.length > 0 ? toDate(visibleDates[0]).getDay() : 0;

  const from = visibleDates[0], to = visibleDates[visibleDates.length - 1];
  const load = useCallback(async () => {
    if (!owner) throw new Error('로그인하면 이 계정의 기록을 조회할 수 있습니다.');
    const [calendar, day] = await Promise.all([
      recordValue(recordsApi().list({ owner, from, to })),
      recordValue(recordsApi().list({ owner, from: selectedDate, to: selectedDate, offset: page * 100 })),
    ]);
    return { calendar, day };
  }, [owner, from, to, selectedDate, page]);
  const query = useRecordQuery([owner, from, to, selectedDate, page].join(':'), load);
  const sessionsByDate = query.data?.day.records.map(historyView) ?? [];
  const counts = query.data?.calendar.counts ?? {};
  const selectedId = selectedSession?.id ?? '';
  const loadDetail = useCallback(async () => selectedId ? recordValue(recordsApi().detail(owner, selectedId)) : null, [owner, selectedId]);
  const detail = useRecordQuery(owner + ':' + selectedId, loadDetail);
  const graph = historyGraph(detail.data);

  const handleDateClick = (date: string) => {
    setSelectedDate(date);
    setSelectedSession(null);
    setPage(0);
  };

  const handlePeriodMove = (direction: -1 | 1) => {
    const current = toDate(selectedDate);
    if (calendarView === 'day') {
      setSelectedDate(toDateKey(addDays(current, direction)));
    } else if (calendarView === 'week') {
      setSelectedDate(toDateKey(addDays(current, direction * 7)));
    } else {
      setSelectedDate(toDateKey(addMonths(current, direction)));
    }
    setSelectedSession(null);
    setPage(0);
  };

  const handleTodayClick = () => {
    setSelectedDate(todayDateKey());
    setSelectedSession(null);
    setPage(0);
  };

  if (selectedSession) {
    const mode = getLearningMode(selectedSession.mode);
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <button
          onClick={() => setSelectedSession(null)}
          className="flex items-center font-bold text-gray-500 transition hover:text-gray-700"
        >
          <ArrowLeft size={18} className="mr-1" /> 학습이력으로 돌아가기
        </button>

        <div className="card-duo">
          <div className="mb-6 flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${mode.bgClass} text-white`}>
              {mode.icon}
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-700">{selectedSession.title}</h1>
              <p className="font-bold text-gray-500">
                {selectedSession.date} · {selectedSession.startedAt} · {selectedSession.duration}
              </p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-gray-50 p-5">
              <p className="text-sm font-bold text-gray-500">점수</p>
              <p className={`text-3xl font-black ${mode.textClass}`}>{selectedSession.score === null ? '자료 없음' : selectedSession.score.toFixed(1) + '점'}</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-5">
              <p className="text-sm font-bold text-gray-500">지속된 기준 이탈</p>
              <p className="text-3xl font-black text-gray-700">{selectedSession.warningCount}회</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-5">
              <p className="text-sm font-bold text-gray-500">모드</p>
              <p className={`text-3xl font-black ${mode.textClass}`}>{mode.shortTitle}</p>
            </div>
          </div>

          <p className="mb-4 text-sm text-muted">상태: {selectedSession.status === 'interrupted' ? '중단된 기록' : selectedSession.status === 'running' ? '기록 중' : '종료'} · 관측률: {selectedSession.coverage === null ? '자료 없음' : selectedSession.coverage.toFixed(1) + '%'} · 정책: {selectedSession.policy}</p>
          {detail.loading && <p role="status">상세 기록을 불러오는 중입니다.</p>}
          {detail.error && <div role="alert"><p>{detail.error}</p><Button variant="outline" onClick={detail.retry}>다시 불러오기</Button></div>}
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={graph}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="linear" connectNulls={false} dataKey="score" stroke={mode.color} strokeWidth={4} dot={{ r: 6, fill: mode.color }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6 rounded-2xl bg-gray-50 p-5">
            <p className="mb-2 font-black text-gray-700">AI 피드백 (예시 · 실측 연동 안 됨)</p>
            <p className="font-bold text-gray-500">초반에는 목이 앞으로 나왔지만 후반부에는 안정적으로 회복되었습니다. (기존 예시 문장)</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-gray-700">학습이력</h1>
        <p className="mt-2 font-bold text-gray-600">캘린더에서 날짜를 선택하면 이 PC에 저장한 목·어깨 관찰 기록을 확인할 수 있습니다. 기록은 시작일에 표시됩니다.</p>
      </header>

      <div className="card-duo">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <CalendarDays className="text-[#1cb0f6]" />
            <button
              type="button"
              onClick={() => handlePeriodMove(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
              aria-label="이전 기간"
            >
              <ChevronLeft size={18} />
            </button>
            <h2 className="min-w-0 text-xl font-black text-gray-700">{getCalendarTitle(calendarView, selectedDate)}</h2>
            <button
              type="button"
              onClick={() => handlePeriodMove(1)}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
              aria-label="다음 기간"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTodayClick}
              className="rounded-2xl border-2 border-gray-200 bg-white px-4 py-2 text-sm font-black text-gray-700 transition hover:bg-gray-50"
            >
              오늘
            </button>
            <div className="grid grid-cols-3 rounded-2xl border-2 border-gray-200 bg-gray-50 p-1">
              {calendarViews.map((view) => {
                const isActive = calendarView === view.id;
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setCalendarView(view.id)}
                    className={`rounded-xl px-4 py-2 text-sm font-black transition ${
                      isActive ? 'bg-white text-[#1cb0f6] shadow-sm' : 'text-gray-600 hover:text-gray-800'
                    }`}
                  >
                    {view.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {calendarView !== 'day' && (
          <div className="mb-2 hidden grid-cols-7 gap-3 md:grid">
            {weekdays.map((weekday, index) => (
              <div
                key={weekday}
                className={`px-3 text-center text-sm font-black ${
                  index === 0 ? 'text-[#ff4b4b]' : index === 6 ? 'text-[#1cb0f6]' : 'text-gray-500'
                }`}
              >
                {weekday}
              </div>
            ))}
          </div>
        )}
        <div className={`grid grid-cols-2 gap-3 ${calendarView === 'month' ? 'md:grid-cols-7' : calendarView === 'week' ? 'md:grid-cols-7' : 'md:grid-cols-1'}`}>
          {calendarView === 'month' && Array.from({ length: monthLeadingBlankCount }, (_, index) => (
            <div key={`month-blank-${index}`} className="hidden min-h-24 md:block" />
          ))}
          {visibleDates.map((date) => {
            const count = counts[date] ?? 0;
            const isActive = selectedDate === date;
            return (
              <button
                key={date}
                onClick={() => handleDateClick(date)}
                className={`min-h-24 rounded-2xl border-2 p-3 text-left transition ${
                  isActive ? 'border-[#1cb0f6] bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`font-black ${getDayColor(date)}`}>{Number(date.slice(-2))}</span>
                  <span className={`text-xs font-black md:hidden ${getDayColor(date)}`}>{weekdays[toDate(date).getDay()]}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-gray-600">
                      {count}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-1">
                  {count > 0 && <span className="text-xs font-bold text-primary">저장 기록</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card-duo">
        <h2 className="mb-4 text-xl font-black text-gray-700">{selectedDate} 자세 관찰 기록</h2>
        {query.loading && <p role="status">기록을 불러오는 중입니다.</p>}
        {query.error && <div role="alert"><p>{query.error}</p><Button variant="outline" onClick={query.retry}>다시 불러오기</Button></div>}
        <div className="mb-4 flex gap-2">
          <Button variant="outline" onClick={query.retry}>새로고침</Button>
          {page > 0 && <Button variant="outline" onClick={() => setPage(value => value - 1)}>이전 기록</Button>}
          {query.data?.day.hasMore && <Button variant="outline" onClick={() => setPage(value => value + 1)}>다음 기록</Button>}
        </div>
        {!query.loading && !query.error && sessionsByDate.length === 0 ? (
          <p className="rounded-2xl bg-gray-50 p-5 font-bold text-gray-600">해당 날짜의 학습 내역이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {sessionsByDate.map((session) => {
              const mode = getLearningMode(session.mode);
              return (
                <button
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  className="flex w-full items-center justify-between rounded-2xl border-2 border-gray-100 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${mode.bgClass} text-white`}>
                      {mode.icon}
                    </div>
                    <div>
                      <p className="font-black text-gray-700">{session.title}</p>
                      <p className="text-sm font-bold text-gray-500">{session.startedAt} · {session.duration}</p>
                    </div>
                  </div>
                  <span className={`text-2xl font-black ${mode.textClass}`}>{session.score === null ? '자료 없음' : session.score.toFixed(1) + '점'}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LearningHistory;
