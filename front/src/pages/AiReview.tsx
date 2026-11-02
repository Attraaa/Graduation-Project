import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { requestAiReview } from '../features/ai-review/api';
import { aiReviewInput, inputRows } from '../features/ai-review/input';
import type { AiReview as Review } from '../features/ai-review/input';
import ReviewCards from '../features/ai-review/ReviewCards';
import { SourceError, SourceLoading } from '../features/dashboard/SourceState';
import { todayDateKey } from '../features/records/views';
import { BUTTON, BUTTON_STRONG } from '../features/settings/parts';
import { CARD } from '../features/statistics/parts';
import type { PeriodDays } from '../features/statistics/period';
import { rangeText } from '../features/statistics/text';
import { useStatisticsData } from '../features/statistics/useStatisticsData';

const PERIODS: PeriodDays[] = [7, 30];
const DOTS = { upper: 'bg-mode-upper', eye: 'bg-mode-eye', keyboard: 'bg-mode-keyboard' };
type Result = { days: PeriodDays } & ({ status: 'loading' } | { status: 'done'; review: Review } | { status: 'error'; message: string });

/** AI 총평. Where it finally belongs is still open, so it has its own menu for now. */
export default function AiReview() {
  const today = todayDateKey();
  const [days, setDays] = useState<PeriodDays>(7);
  const { summary, keyboard, status, retry } = useStatisticsData(today, days);
  const [result, setResult] = useState<Result | null>(null);
  const sources = Object.values(status);
  const loading = sources.includes('loading'), failed = !loading && sources.includes('error');
  // Never send a partial picture: the request waits until all three sources have loaded.
  const input = loading || failed ? null : aiReviewInput(summary, keyboard, days);
  const shown = result?.days === days ? result : null;

  const generate = async () => {
    if (!input) return;
    setResult({ days, status: 'loading' });
    try {
      setResult({ days, status: 'done', review: await requestAiReview(input) });
    } catch (error) {
      setResult({ days, status: 'error', message: error instanceof Error ? error.message : 'AI 총평을 만들지 못했어요.' });
    }
  };

  return (
    <div className="space-y-4 pb-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-heading">AI 총평</h1>
          <p className="mt-1 text-sm text-muted">{`통계와 같은 기간의 기록으로 AI가 총평을 써요 · ${rangeText(summary.range.dates[0], today)}`}</p>
        </div>
        <div role="group" aria-label="기간" className="flex rounded-xl bg-track p-1">
          {PERIODS.map(value => (
            <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}
              className={`rounded-lg px-3 py-1 text-sm font-semibold ${days === value ? 'bg-surface text-heading shadow-sm' : 'text-muted'}`}>
              {`${value}일`}
            </button>
          ))}
        </div>
      </header>

      <section aria-label="AI에게 보내는 기록" className={`${CARD} space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-heading">AI에게 보내는 기록</h2>
          <button type="button" className={BUTTON_STRONG} disabled={!input || shown?.status === 'loading'} onClick={() => void generate()}>
            <Sparkles aria-hidden="true" size={16} />{shown?.status === 'done' ? '다시 받기' : '총평 받기'}
          </button>
        </div>
        {loading ? <SourceLoading className="h-16" />
          : failed ? <SourceError onRetry={retry} />
          : input ? (
            <ul className="space-y-2">
              {inputRows(input).map(row => (
                <li key={row.mode} className="flex gap-2 text-sm text-heading">
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOTS[row.mode]}`} />
                  <span><span className="font-semibold">{row.name}</span>{` · ${row.text}`}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">이 기간에 측정한 기록이 없어요. 측정을 시작하면 총평을 받을 수 있어요.</p>}
        <p className="text-xs text-muted">위 집계만 Anthropic의 Claude로 보내요. 영상·키 입력 원문·계정 정보는 보내지 않고, 만든 총평은 저장하지 않아요.</p>
      </section>

      {shown?.status === 'loading' && (
        <div aria-live="polite" className="space-y-4">
          <p className="text-sm text-muted">AI가 총평을 쓰고 있어요…</p>
          <SourceLoading className="h-28" />
          <div className="grid gap-4 md:grid-cols-2"><SourceLoading className="h-32" /><SourceLoading className="h-32" /></div>
        </div>
      )}
      {shown?.status === 'error' && (
        <div role="alert" className={`${CARD} flex flex-wrap items-center justify-between gap-3 text-sm text-heading`}>
          <span>{shown.message}</span>
          <button type="button" className={BUTTON} disabled={!input} onClick={() => void generate()}>다시 시도</button>
        </div>
      )}
      {shown?.status === 'done' && <ReviewCards review={shown.review} />}
      {!shown && input && <p className={`${CARD} text-sm text-muted`}>총평 받기를 누르면 이 기간 기록으로 AI 총평을 만들어요.</p>}
    </div>
  );
}
