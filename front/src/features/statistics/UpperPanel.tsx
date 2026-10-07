import type { ReactNode } from 'react';
import ScoreRing from '../dashboard/ScoreRing';
import { minutesText, scoreText } from '../dashboard/format';
import type { DashboardDay } from '../dashboard/summary';
import DailyChart from './DailyChart';
import HourlyChart from './HourlyChart';
import StatTile from './StatTile';
import { CARD, CardTitle, ChartHeader, EmptyChart, HistoryLink, Waiting } from './parts';
import type { PeriodDays, UpperPeriod } from './period';
import { changeChip, percentLabel } from './text';

const LINES = [
  { key: 'turtle', name: '목', color: 'var(--color-mode-upper)' },
  { key: 'shoulder', name: '어깨', color: 'var(--color-mode-shoulder)' },
];

/** Upper tab: four numbers, the daily neck/shoulder chart, then hourly, quality and record cards. */
export default function UpperPanel({ upper, days, periodDays, floor, today, detail, onSelectDate, onOpenHistory }: {
  upper: UpperPeriod; days: DashboardDay[]; periodDays: PeriodDays; floor: number; today: string;
  detail: (date: string) => ReactNode; onSelectDate: (date: string) => void; onOpenHistory: () => void;
}) {
  const empty = !upper.present;
  const ticks = Array.from({ length: Math.round((100 - floor) / 10) + 1 }, (_, index) => floor + index * 10);
  const faded = new Set(days.filter(day => day.upper.sessions === 0).map(day => day.date));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="목 평균 점수" value={scoreText(upper.turtle.current)} unit="점" chip={changeChip(upper.turtle, periodDays)} />
        <StatTile label="어깨 평균 점수" value={scoreText(upper.shoulder.current)} unit="점" chip={changeChip(upper.shoulder, periodDays)} />
        <StatTile label="측정 시간" value={empty ? '—' : minutesText(upper.runMs)}
          detail={empty ? undefined : `${upper.sessions}회 측정 · 가장 길게 이어진 측정 ${minutesText(upper.longestMs)}`} />
        <StatTile label="기준에서 벗어남" value={empty ? '—' : String(upper.deviations)} unit="회"
          detail={upper.deviationRate === null ? undefined : `벗어나 있던 시간 ${percentLabel(upper.deviationRate)}`} />
      </div>
      <section aria-label="날짜별 점수" className={`${CARD} space-y-3`}>
        <ChartHeader title="날짜별 점수" legend={LINES} hint="날짜를 누르면 그날 학습이력으로 가요" />
        {empty ? <EmptyChart /> : (
          <DailyChart label="날짜별 목·어깨 점수" lines={LINES} today={today} domain={[floor, 100]} ticks={ticks}
            faded={faded} detail={detail} onSelectDate={onSelectDate}
            data={days.map(day => ({ date: day.date, turtle: day.upper.turtle, shoulder: day.upper.shoulder }))} />
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label="시간대별 점수" className={CARD}>
          <CardTitle title="시간대별 점수" note={`${periodDays}일 평균`} />
          {empty ? <Waiting /> : (
            <HourlyChart label="시간대별 목·어깨 점수" data={upper.hourly} lines={LINES} domain={[upper.hourlyFloor, 100]} unit="점" />
          )}
        </section>
        <section aria-label="측정 품질" className={CARD}>
          <CardTitle title="측정 품질" />
          {empty ? <Waiting /> : (
            <div className="flex items-center gap-4">
              <ScoreRing value={upper.validRate} strokeClass="stroke-mode-upper" label="제대로 측정" unit="%" />
              <div className="space-y-1 text-sm text-muted">
                <p>제대로 측정된 시간</p>
                <p>{`자리 비움 등으로 측정 못 한 시간 ${minutesText(upper.unmeasuredMs)}`}</p>
              </div>
            </div>
          )}
        </section>
        <section aria-label="측정 기록" className={CARD}>
          <CardTitle title="측정 기록" />
          {empty ? <Waiting /> : (
            <div className="space-y-1 text-sm text-muted">
              <p>{`${upper.sessions}회 · 평균 ${minutesText(upper.averageMs ?? 0)}`}</p>
              <p>{`가장 길게 이어진 측정 ${minutesText(upper.longestMs)}`}</p>
            </div>
          )}
          <HistoryLink onClick={onOpenHistory} />
        </section>
      </div>
      <p className="text-xs text-muted">점수는 기준 자세와의 화면상 유사도예요. 의학적 진단이 아니에요.</p>
    </div>
  );
}
