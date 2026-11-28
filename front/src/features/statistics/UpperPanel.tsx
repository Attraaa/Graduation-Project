import type { ReactNode } from 'react';
import ScoreRing from '../dashboard/ScoreRing';
import { minutesText, scoreText } from '../dashboard/format';
import type { DashboardDay } from '../dashboard/summary';
import DailyChart from './DailyChart';
import DeviationHours from './DeviationHours';
import HourlyChart from './HourlyChart';
import StatTile from './StatTile';
import { CARD, CardTitle, ChartHeader, EmptyChart, HistoryLink, Waiting } from './parts';
import type { PeriodDays, UpperPeriod } from './period';
import { fullDayHours } from './period';
import { changeChip, percentLabel } from './text';

const LINES = [
  { key: 'turtle', name: '목', color: 'var(--color-mode-upper)' },
  { key: 'balance', name: '좌우 균형', color: 'var(--color-mode-shoulder)' },
];

/** Upper tab: four numbers, the daily neck/balance chart, then the two time-of-day cards, quality and records. */
export default function UpperPanel({ upper, days, periodDays, floor, today, detail, onSelectDate, onOpenHistory }: {
  upper: UpperPeriod; days: DashboardDay[]; periodDays: PeriodDays; floor: number; today: string;
  detail: (date: string) => ReactNode; onSelectDate: (date: string) => void; onOpenHistory: () => void;
}) {
  const empty = !upper.present;
  const dayView = periodDays === 1;
  const ticks = Array.from({ length: Math.round((100 - floor) / 10) + 1 }, (_, index) => floor + index * 10);
  const faded = new Set(days.filter(day => day.upper.sessions === 0).map(day => day.date));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="목 평균 점수" value={scoreText(upper.turtle.current)} unit="점" chip={changeChip(upper.turtle, periodDays)} />
        <StatTile label="좌우 균형 평균 점수" value={scoreText(upper.balance.current)} unit="점" chip={changeChip(upper.balance, periodDays)} />
        <StatTile label="측정 시간" value={empty ? '—' : minutesText(upper.runMs)} />
        <StatTile label="기준에서 벗어남" value={empty ? '—' : String(upper.deviations)} unit="회"
          detail={upper.deviationRate === null ? undefined : `벗어나 있던 시간 ${percentLabel(upper.deviationRate)}`} />
      </div>
      {dayView ? <section aria-label="시간대별 평균 점수" className={`${CARD} space-y-3`}>
        <ChartHeader title="시간대별 평균 점수" legend={LINES} />
        {upper.hourly.some(hour => hour.turtle !== null || hour.balance !== null)
          ? <HourlyChart expanded label="시간대별 목·좌우 균형 점수" data={fullDayHours(upper.hourly)} lines={LINES} domain={[0, 100]} unit="점" />
          : <EmptyChart />}
      </section> : <section aria-label="날짜별 점수" className={`${CARD} space-y-3`}>
        <ChartHeader title="날짜별 점수" legend={LINES} />
        {empty ? <EmptyChart /> : (
          <DailyChart label="날짜별 목·좌우 균형 점수" lines={LINES} today={today} domain={[floor, 100]} ticks={ticks} unit="점"
            faded={faded} detail={detail} onSelectDate={onSelectDate}
            data={days.map(day => ({ date: day.date, turtle: day.upper.turtle, balance: day.upper.balance }))} />
        )}
      </section>}
      <div className={`grid gap-4 ${dayView ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        {!dayView && <section aria-label="시간대별 평균 점수" className={CARD}>
          <CardTitle title="시간대별 평균 점수" />
          {empty ? <Waiting /> : (
            <HourlyChart label="시간대별 목·좌우 균형 점수" data={upper.hourly} lines={LINES} domain={[upper.hourlyFloor, 100]} unit="점" />
          )}
        </section>}
        <section aria-label="기준 이탈이 잦은 시간" className={CARD}>
          <CardTitle title="기준 이탈이 잦은 시간" />
          {empty ? <Waiting /> : <DeviationHours hours={upper.deviationHours} />}
        </section>
        <section aria-label="측정 품질" className={CARD}>
          <CardTitle title="측정 품질" />
          {empty ? <Waiting /> : (
            <div className="flex items-center gap-4">
              <ScoreRing value={upper.validRate} strokeClass="stroke-mode-upper" label="제대로 측정" unit="%" />
              <p className="text-sm text-muted">{`미측정 ${minutesText(upper.unmeasuredMs)}`}</p>
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
    </div>
  );
}
