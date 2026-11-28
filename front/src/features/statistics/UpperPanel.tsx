import type { ReactNode } from 'react';
import { minutesText, scoreText } from '../dashboard/format';
import type { DashboardDay } from '../dashboard/summary';
import DailyChart from './DailyChart';
import DeviationHours from './DeviationHours';
import HourlyChart from './HourlyChart';
import StatTile from './StatTile';
import { CARD, CardTitle, ChartHeader, EmptyChart, Waiting } from './parts';
import type { PeriodDays, UpperPeriod } from './period';
import { fullDayHours } from './period';
import { changeChip, percentLabel } from './text';

const LINES = [
  { key: 'turtle', name: '목', color: 'var(--color-mode-upper)' },
  { key: 'balance', name: '좌우 균형', color: 'var(--color-mode-shoulder)' },
];

/**
 * 자세 section of the 상체 tab (시안 S02, 2026-11-28): four numbers, then the score chart (1 day: by hour, 7/30 days: by
 * date and by hour) beside the hours with the most deviations. Measurement quality and records sit in the shared
 * section at the end of the tab (`UpperBodyPanel`).
 */
export default function UpperPanel({ upper, days, periodDays, floor, today, detail, onSelectDate }: {
  upper: UpperPeriod; days: DashboardDay[]; periodDays: PeriodDays; floor: number; today: string;
  detail: (date: string) => ReactNode; onSelectDate: (date: string) => void;
}) {
  const empty = !upper.present;
  const dayView = periodDays === 1;
  const ticks = Array.from({ length: Math.round((100 - floor) / 10) + 1 }, (_, index) => floor + index * 10);
  const faded = new Set(days.filter(day => day.upper.sessions === 0).map(day => day.date));
  const deviation = (
    <section aria-label="기준 이탈이 잦은 시간" className={CARD}>
      <CardTitle title="기준 이탈이 잦은 시간" />
      {empty ? <Waiting /> : <DeviationHours hours={upper.deviationHours} />}
    </section>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="목 평균 점수" value={scoreText(upper.turtle.current)} unit="점" chip={changeChip(upper.turtle, periodDays)} />
        <StatTile label="좌우 균형 평균 점수" value={scoreText(upper.balance.current)} unit="점" chip={changeChip(upper.balance, periodDays)} />
        <StatTile label="기준에서 벗어남" value={empty ? '—' : String(upper.deviations)} unit="회"
          detail={upper.deviationRate === null ? undefined : `벗어나 있던 시간 ${percentLabel(upper.deviationRate)}`} />
        <StatTile label="측정 시간" value={empty ? '—' : minutesText(upper.runMs)} detail={empty ? undefined : `${upper.sessions}회 측정`} />
      </div>
      {dayView ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <section aria-label="시간대별 평균 점수" className={`${CARD} space-y-3 lg:col-span-2`}>
            <ChartHeader title="시간대별 평균 점수" legend={LINES} />
            {upper.hourly.some(hour => hour.turtle !== null || hour.balance !== null)
              ? <HourlyChart expanded label="시간대별 목·좌우 균형 점수" data={fullDayHours(upper.hourly)} lines={LINES} domain={[0, 100]} unit="점" />
              : <EmptyChart />}
          </section>
          {deviation}
        </div>
      ) : (
        <>
          <section aria-label="날짜별 점수" className={`${CARD} space-y-3`}>
            <ChartHeader title="날짜별 점수" legend={LINES} />
            {empty ? <EmptyChart /> : (
              <DailyChart label="날짜별 목·좌우 균형 점수" lines={LINES} today={today} domain={[floor, 100]} ticks={ticks} unit="점"
                faded={faded} detail={detail} onSelectDate={onSelectDate}
                data={days.map(day => ({ date: day.date, turtle: day.upper.turtle, balance: day.upper.balance }))} />
            )}
          </section>
          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-label="시간대별 평균 점수" className={CARD}>
              <CardTitle title="시간대별 평균 점수" />
              {empty ? <Waiting /> : (
                <HourlyChart label="시간대별 목·좌우 균형 점수" data={upper.hourly} lines={LINES} domain={[upper.hourlyFloor, 100]} unit="점" />
              )}
            </section>
            {deviation}
          </div>
        </>
      )}
    </div>
  );
}
