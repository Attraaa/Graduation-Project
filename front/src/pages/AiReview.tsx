import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { MAX_REVIEW_DAYS } from '../../../database/localReview';
import { requestAiReview } from '../features/ai-review/api';
import { inputRows } from '../features/ai-review/input';
import type { AiReview as Review } from '../features/ai-review/input';
import ReviewCards from '../features/ai-review/ReviewCards';
import { SourceError } from '../features/dashboard/SourceState';
import { longDate, monthDayText } from '../features/dashboard/format';
import { pastDateOrNull, shiftDate } from '../features/dashboard/summary';
import { calendarDays, canMoveForward, leadingBlanks, movePeriod, periodTitle, visibleDates } from '../features/history/calendar';
import HistoryCalendar from '../features/history/HistoryCalendar';
import { useHistoryData } from '../features/history/useHistoryData';
import { todayDateKey } from '../features/records/views';
import { BUTTON, BUTTON_STRONG } from '../features/settings/parts';
import { CARD } from '../features/statistics/parts';
import { useReviewInput } from '../features/ai-review/useReviewInput';
import NearbyHospitals from '../features/hospitals/NearbyHospitals';

const DOTS = { upper: 'bg-mode-upper', eye: 'bg-mode-eye', keyboard: 'bg-mode-keyboard' };
type Result = { key: string } & ({ status: 'loading' } | { status: 'done'; review: Review } | { status: 'error'; message: string });

export default function AiReview() {
  const today = todayDateKey();
  const [params, setParams] = useSearchParams();
  const from = pastDateOrNull(params.get('date'), today) ?? today;
  const end = pastDateOrNull(params.get('to'), today);
  const to = end && end >= from && end <= shiftDate(from, MAX_REVIEW_DAYS - 1) ? end : from;
  const [visibleMonth, setVisibleMonth] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState(false);
  const choosingEnd = rangeStart === from && from === to;
  const month = visibleMonth ?? to;
  const dates = visibleDates('month', month);
  const { byDate, status } = useHistoryData('month', month, today);
  const calendarStatus = status.history === 'loading' || status.keyboard === 'loading' ? 'loading'
    : status.history === 'ready' && status.keyboard === 'ready' ? 'ready' : 'error';
  const { owner, input, days, loading, failed, retry } = useReviewInput(from, to);
  const [result, setResult] = useState<Result | null>(null);
  const pending = useRef<AbortController | null>(null);
  const key = `${owner}:${from}:${to}`;
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [key]);
  const shown = result?.key === key ? result : null;
  const generating = shown?.status === 'loading';
  const loadingLabel = generating ? '총평 작성 중' : loading ? '기록 불러오는 중' : null;
  const selectedDates = from === to ? longDate(from) : `${monthDayText(from)} ~ ${monthDayText(to)}`;

  const chooseDate = (next: string) => {
    const [start, finish] = choosingEnd ? [from, next].sort() : [next, next];
    if (finish > shiftDate(start, MAX_REVIEW_DAYS - 1)) {
      setRangeError(true);
      return;
    }
    setRangeStart(choosingEnd ? null : next);
    setRangeError(false);
    setVisibleMonth(next);
    if (start !== from || finish !== to) {
      setParams(start === finish ? { date: start } : { date: start, to: finish }, { replace: true });
      setResult(null);
    }
  };

  const generate = async () => {
    if (!input || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setResult({ key, status: 'loading' });
    try {
      const review = await requestAiReview(input, controller.signal);
      if (!controller.signal.aborted) setResult({ key, status: 'done', review });
    } catch (error) {
      if (!controller.signal.aborted) setResult({ key, status: 'error', message: error instanceof Error ? error.message : 'AI 총평을 만들지 못했어요.' });
    } finally { if (pending.current === controller) pending.current = null; }
  };

  return (
    <div className="space-y-4 pb-4">
      <h1 className="text-2xl font-extrabold text-heading">AI 총평</h1>
      <HistoryCalendar title={periodTitle('month', dates)} days={calendarDays(dates, byDate, today)}
        blanks={leadingBlanks('month', dates)} selected={from} rangeEnd={to} recordsStatus={calendarStatus}
        canForward={canMoveForward('month', month, today)} onSelect={chooseDate}
        onMove={direction => setVisibleMonth(movePeriod('month', month, direction, today))} />
      <p role={rangeError ? 'alert' : undefined} className="text-sm text-muted">
        {rangeError ? '최대 7일까지 선택할 수 있어요.' : choosingEnd
          ? '종료일을 선택하거나 선택한 하루의 총평을 받아보세요.'
          : '두 날짜를 선택하면 최대 7일까지 함께 볼 수 있어요.'}
      </p>

      <section aria-label="선택한 날짜의 측정 기록" className={`${CARD} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-heading">{selectedDates} 측정 기록</h2>
          <button type="button" className={BUTTON_STRONG} disabled={!input || loading || generating} aria-busy={generating} onClick={() => void generate()}>
            <Sparkles aria-hidden="true" size={16} />{shown?.status === 'done' ? '다시 받기' : '총평 받기'}
          </button>
        </div>
        {!loading && (failed ? <SourceError onRetry={retry} />
          : input ? (
            <div className="space-y-3">
              {days.map(day => (
                <div key={day.date} className="space-y-1">
                  {from !== to && <h3 className="text-sm font-semibold text-heading">{longDate(day.date)}</h3>}
                  <ul className="space-y-1">
                    {inputRows(day).map(row => (
                      <li key={row.mode} className="flex gap-2 text-sm text-heading">
                        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOTS[row.mode]}`} />
                        <span><span className="font-semibold">{row.name}</span>{` · ${row.text}`}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-muted">{from === to ? '이 날짜에 측정한 기록이 없어요.' : '선택한 기간에 측정한 기록이 없어요.'}</p>)}
        {loadingLabel && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <LoaderCircle size={16} aria-hidden="true" className="motion-safe:animate-spin" />
            {loadingLabel}
          </p>
        )}
      </section>

      {shown?.status === 'error' && (
        <div role="alert" className={`${CARD} flex flex-wrap items-center justify-between gap-3 text-sm text-heading`}>
          <span>{shown.message}</span>
          <button type="button" className={BUTTON} disabled={!input} onClick={() => void generate()}>다시 시도</button>
        </div>
      )}
      {shown?.status === 'done' && <ReviewCards review={shown.review} />}
      {/* Always in the same place, whatever the scores: the list is never a reaction to the review. */}
      <NearbyHospitals />
    </div>
  );
}
