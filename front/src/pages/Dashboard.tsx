import DeviationHours from '../features/dashboard/DeviationHours';
import { EyeCard, KeyboardCard, UpperCard } from '../features/dashboard/ModeCards';
import { SourceError, SourceLoading } from '../features/dashboard/SourceState';
import TodayTimeline from '../features/dashboard/TodayTimeline';
import WeeklyScoreChart from '../features/dashboard/WeeklyScoreChart';
import { headerDate, minutesText } from '../features/dashboard/format';
import { useDashboardData } from '../features/dashboard/useDashboardData';

const CARD = 'rounded-2xl border border-border bg-surface p-4';
const LEGEND = [
  { name: '목', dot: 'bg-mode-upper' },
  { name: '어깨', dot: 'bg-mode-shoulder' },
  { name: '키보드', dot: 'bg-mode-keyboard' },
];

const Dashboard = () => {
  const { today, summary, status, retry } = useDashboardData();
  const scoresLoading = status.posture === 'loading' || status.keyboard === 'loading';
  const scoresFailed = status.posture === 'error' && status.keyboard === 'error';
  const scoresPartial = !scoresFailed && (status.posture === 'error' || status.keyboard === 'error');
  const observedReady = status.posture === 'ready' && status.keyboard === 'ready' && status.eye === 'ready';
  const timelineLoading = status.history === 'loading' || status.keyboard === 'loading';
  const timelineFailed = status.history === 'error' || status.keyboard === 'error';

  return (
    <div className="space-y-4 pb-4">
      <header>
        <h1 className="text-2xl font-extrabold text-heading">무엇을 모니터링 할까요?</h1>
        <p className="mt-1 text-sm text-muted">
          {observedReady ? `${headerDate(today)} · 오늘 관찰 ${minutesText(summary.today.totalMs)}` : headerDate(today)}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <UpperCard className="col-span-2" summary={summary} status={status.posture} onRetry={retry} />
        <KeyboardCard summary={summary} status={status.keyboard} onRetry={retry} />
        <EyeCard summary={summary} status={status.eye} onRetry={retry} />

        <section aria-label="최근 7일 점수" className={`${CARD} col-span-2 flex flex-col gap-3 lg:col-span-4 xl:col-span-3 xl:row-span-2`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-heading">최근 7일 점수</h2>
            <ul className="flex flex-wrap items-center gap-3 text-xs text-muted">
              {LEGEND.map(item => (
                <li key={item.name} className="flex items-center gap-1">
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${item.dot}`} />{item.name}
                </li>
              ))}
              <li>안구는 점수가 없어 빠져요</li>
            </ul>
          </div>
          {scoresLoading ? <SourceLoading className="h-72" />
            : scoresFailed ? <SourceError onRetry={retry} />
            : summary.hasScores ? (
              <div className="min-h-72 flex-1"><WeeklyScoreChart days={summary.days} today={today} floor={summary.chartFloor} /></div>
            )
            : <p className="flex h-72 items-center justify-center text-sm text-muted">측정을 시작하면 최근 7일 점수가 여기에 보여요</p>}
          {scoresPartial && <SourceError onRetry={retry} />}
          <p className="text-xs text-muted">점수는 기준 자세와의 화면상 유사도와 손가락 사용 점수예요. 의학적 진단이 아니에요.</p>
        </section>

        <section aria-label="오늘 타임라인" className={`${CARD} col-span-1 space-y-3 lg:col-span-2 xl:col-span-1`}>
          <h2 className="font-bold text-heading">오늘 타임라인</h2>
          {timelineLoading ? <SourceLoading className="h-24" />
            : timelineFailed && !summary.timeline.length ? <SourceError onRetry={retry} />
            : <TodayTimeline entries={summary.timeline} />}
          {!timelineLoading && timelineFailed && summary.timeline.length > 0 && <SourceError onRetry={retry} />}
        </section>

        <section aria-label="기준 이탈이 잦은 시간" className={`${CARD} col-span-1 space-y-3 lg:col-span-2 xl:col-span-1`}>
          <div>
            <h2 className="font-bold text-heading">기준 이탈이 잦은 시간</h2>
            <p className="text-xs text-muted">최근 7일 · 상체</p>
          </div>
          {status.posture === 'loading' ? <SourceLoading className="h-24" />
            : status.posture === 'error' ? <SourceError onRetry={retry} />
            : <DeviationHours hours={summary.deviationHours} />}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
