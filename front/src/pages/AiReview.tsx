import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { requestAiReview } from '../features/ai-review/api';
import { inputRows } from '../features/ai-review/input';
import type { AiReview as Review } from '../features/ai-review/input';
import ReviewCards from '../features/ai-review/ReviewCards';
import { SourceError } from '../features/dashboard/SourceState';
import { todayDateKey } from '../features/records/views';
import { BUTTON, BUTTON_STRONG } from '../features/settings/parts';
import { CARD } from '../features/statistics/parts';
import type { PeriodDays } from '../features/statistics/period';
import { useReviewInput } from '../features/ai-review/useReviewInput';
import NearbyHospitals from '../features/hospitals/NearbyHospitals';

const PERIODS: PeriodDays[] = [7, 30];
const DOTS = { upper: 'bg-mode-upper', eye: 'bg-mode-eye', keyboard: 'bg-mode-keyboard' };
type Result = { key: string } & ({ status: 'loading' } | { status: 'done'; review: Review } | { status: 'error'; message: string });

/** AI 총평. Where it finally belongs is still open, so it has its own menu for now. */
export default function AiReview() {
  const today = todayDateKey();
  const [days, setDays] = useState<PeriodDays>(7);
  const { owner, input, loading, failed, retry } = useReviewInput(today, days);
  const [result, setResult] = useState<Result | null>(null);
  const pending = useRef<AbortController | null>(null);
  const key = `${owner}:${days}:${today}`;
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, [key]);
  const shown = result?.key === key ? result : null;
  const generating = shown?.status === 'loading';
  const loadingLabel = generating ? '총평 작성 중' : loading ? '기록 불러오는 중' : null;

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold text-heading">AI 총평</h1>
        <div role="group" aria-label="기간" className="flex rounded-xl bg-track p-1">
          {PERIODS.map(value => (
            <button key={value} type="button" aria-pressed={days === value} onClick={() => { if (value !== days) { setResult(null); setDays(value); } }}
              className={`rounded-lg px-3 py-1 text-sm font-semibold ${days === value ? 'bg-surface text-heading shadow-sm' : 'text-muted'}`}>
              {`${value}일`}
            </button>
          ))}
        </div>
      </header>

      <section aria-label="AI에게 보내는 기록" className={`${CARD} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-heading">AI에게 보내는 기록</h2>
          <button type="button" className={BUTTON_STRONG} disabled={!input || generating} aria-busy={generating} onClick={() => void generate()}>
            <Sparkles aria-hidden="true" size={16} />{shown?.status === 'done' ? '다시 받기' : '총평 받기'}
          </button>
        </div>
        {!loading && (failed ? <SourceError onRetry={retry} />
          : input ? (
            <ul className="space-y-2">
              {inputRows(input).map(row => (
                <li key={row.mode} className="flex gap-2 text-sm text-heading">
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOTS[row.mode]}`} />
                  <span><span className="font-semibold">{row.name}</span>{` · ${row.text}`}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">이 기간에 측정한 기록이 없어요. 측정을 시작하면 총평을 받을 수 있어요.</p>)}
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
