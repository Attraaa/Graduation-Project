import { useMemo, useState } from 'react';
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
import { getSessionsByDate, historySessions, type HistorySession } from '../data/mockLearningHistory';

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
const todayKey = toDateKey(new Date());

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
  const [selectedDate, setSelectedDate] = useState('2026-05-14');
  const [calendarView, setCalendarView] = useState<CalendarView>('week');
  const [selectedSession, setSelectedSession] = useState<HistorySession | null>(null);

  const sessionsByDate = useMemo(() => getSessionsByDate(selectedDate), [selectedDate]);
  const visibleDates = useMemo(() => getVisibleDates(calendarView, selectedDate), [calendarView, selectedDate]);
  const monthLeadingBlankCount = calendarView === 'month' && visibleDates.length > 0 ? toDate(visibleDates[0]).getDay() : 0;

  const handleDateClick = (date: string) => {
    setSelectedDate(date);
    setSelectedSession(null);
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
  };

  const handleTodayClick = () => {
    setSelectedDate(todayKey);
    setSelectedSession(null);
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
              <p className={`text-3xl font-black ${mode.textClass}`}>{selectedSession.score}점</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-5">
              <p className="text-sm font-bold text-gray-500">경고 횟수</p>
              <p className="text-3xl font-black text-gray-700">{selectedSession.warningCount}회</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-5">
              <p className="text-sm font-bold text-gray-500">모드</p>
              <p className={`text-3xl font-black ${mode.textClass}`}>{mode.shortTitle}</p>
            </div>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={selectedSession.graph}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke={mode.color} strokeWidth={4} dot={{ r: 6, fill: mode.color }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-6 rounded-2xl bg-gray-50 p-5">
            <p className="mb-2 font-black text-gray-700">AI 피드백</p>
            <p className="font-bold text-gray-500">{selectedSession.feedback}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-gray-700">학습이력</h1>
        <p className="mt-2 font-bold text-gray-600">캘린더에서 날짜를 선택하면 해당 날짜의 자세 교정 내역이 아래에 표시됩니다.</p>
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
            const sessions = historySessions.filter((session) => session.date === date);
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
                  {sessions.length > 0 && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-gray-600">
                      {sessions.length}
                    </span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-1">
                  {sessions.slice(0, calendarView === 'month' ? 3 : sessions.length).map((session) => {
                    const mode = getLearningMode(session.mode);
                    return <span key={session.id} className="h-2 w-8 rounded-full" style={{ backgroundColor: mode.color }} />;
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card-duo">
        <h2 className="mb-4 text-xl font-black text-gray-700">{selectedDate} 자세 교정 내역</h2>
        {sessionsByDate.length === 0 ? (
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
                  <span className={`text-2xl font-black ${mode.textClass}`}>{session.score}점</span>
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
