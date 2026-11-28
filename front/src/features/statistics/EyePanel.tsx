import type { ReactNode } from 'react';
import { minutesText } from '../dashboard/format';
import type { DashboardDay } from '../dashboard/summary';
import DailyChart from './DailyChart';
import HourlyChart from './HourlyChart';
import StatTile from './StatTile';
import { CARD, CardTitle, ChartHeader, EmptyChart, HistoryLink, Waiting } from './parts';
import type { EyePeriod, PeriodDays } from './period';
import { fullDayHours } from './period';
import { percentLabel, previousRateChip } from './text';

const LINES = [{ key: 'rate', name: '분당 깜빡임', color: 'var(--color-mode-eye)' }];

/** Eye tab with the eye mode's own terms. Blink rate is a habit guide, never a score. */
export default function EyePanel({ eye, days, periodDays, max, today, detail, onSelectDate, onOpenHistory }: {
  eye: EyePeriod; days: DashboardDay[]; periodDays: PeriodDays; max: number; today: string;
  detail: (date: string) => ReactNode; onSelectDate: (date: string) => void; onOpenHistory: () => void;
}) {
  const empty = !eye.present;
  const dayView = periodDays === 1;
  const faded = new Set(days.filter(day => !day.eye.present).map(day => day.date));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="깜빡임 빈도" value={eye.rate === null ? '—' : String(Math.round(eye.rate))} unit="회/분"
          chip={previousRateChip(eye.previousRate, periodDays)}
          detail={!empty && eye.rate === null ? '유효 관찰 30초 미만' : undefined} />
        <StatTile label="유효 관찰 시간" value={empty ? '—' : minutesText(eye.validMs)} />
        <StatTile label="눈 휴식 완료" value={empty ? '—' : String(eye.breaks)} unit="회" />
        <StatTile label="가까워짐 안내" value={empty ? '—' : String(eye.nearReminders)} unit="회"
          detail={empty ? undefined : `깜빡임 안내 ${eye.openReminders}회`} />
      </div>
      {dayView ? <section aria-label="시간대별 깜빡임 빈도" className={`${CARD} space-y-3`}>
        <ChartHeader title="시간대별 깜빡임 빈도" legend={LINES} />
        {eye.hourly.some(hour => hour.rate !== null)
          ? <HourlyChart expanded label="시간대별 깜빡임 빈도" data={fullDayHours(eye.hourly)} lines={LINES} domain={[0, eye.hourlyMax]} unit="회/분" />
          : <EmptyChart text={empty ? undefined : '시간대별 빈도를 표시하려면 한 시간대에 유효 관찰 30초 이상이 필요해요'} />}
      </section> : <section aria-label="날짜별 깜빡임 빈도" className={`${CARD} space-y-3`}>
        <ChartHeader title="날짜별 깜빡임 빈도" legend={LINES} />
        {empty ? <EmptyChart /> : (
          <DailyChart label="날짜별 깜빡임 빈도" lines={LINES} today={today} domain={[0, max]} unit="회/분"
            faded={faded} detail={detail} onSelectDate={onSelectDate}
            data={days.map(day => ({ date: day.date, rate: day.eye.rate }))} />
        )}
      </section>}
      <div className={`grid gap-4 ${dayView ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
        {!dayView && <section aria-label="시간대별 평균 깜빡임 빈도" className={CARD}>
          <CardTitle title="시간대별 평균 깜빡임 빈도" />
          {empty ? <Waiting /> : (
            <HourlyChart label="시간대별 깜빡임 빈도" data={eye.hourly} lines={LINES} domain={[0, eye.hourlyMax]} unit="회/분" />
          )}
        </section>}
        <section aria-label="유효 관찰 비율" className={CARD}>
          <CardTitle title="유효 관찰 비율" />
          {empty ? <Waiting /> : (
            <p className="text-2xl font-extrabold text-heading">{percentLabel(eye.validRate)}</p>
          )}
        </section>
        <section aria-label="측정 기록" className={CARD}>
          <CardTitle title="측정 기록" />
          {empty ? <Waiting /> : <p className="text-sm text-muted">{`실행 시간 ${minutesText(eye.runMs)}`}</p>}
          <HistoryLink onClick={onOpenHistory} />
        </section>
      </div>
    </div>
  );
}
