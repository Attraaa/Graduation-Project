import type { ReactNode } from 'react';
import { minutesText } from '../dashboard/format';
import type { DashboardDay } from '../dashboard/summary';
import DailyChart from './DailyChart';
import HourlyChart from './HourlyChart';
import StatTile from './StatTile';
import { CARD, CardTitle, ChartHeader, EmptyChart, HistoryLink, Waiting } from './parts';
import type { EyePeriod, PeriodDays } from './period';
import { percentLabel, previousRateChip } from './text';

const LINES = [{ key: 'rate', name: '분당 깜빡임', color: 'var(--color-mode-eye)' }];

/** Eye tab with the eye mode's own terms. Blink rate is a habit guide, never a score. */
export default function EyePanel({ eye, days, periodDays, max, today, detail, onSelectDate, onOpenHistory }: {
  eye: EyePeriod; days: DashboardDay[]; periodDays: PeriodDays; max: number; today: string;
  detail: (date: string) => ReactNode; onSelectDate: (date: string) => void; onOpenHistory: () => void;
}) {
  const empty = !eye.present;
  const faded = new Set(days.filter(day => !day.eye.present).map(day => day.date));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile label="깜빡임 빈도" value={eye.rate === null ? '—' : String(Math.round(eye.rate))} unit="회/분"
          chip={previousRateChip(eye.previousRate, periodDays)}
          detail={!empty && eye.rate === null ? '유효 관찰 30초 이상일 때 표시' : undefined} />
        <StatTile label="유효 관찰 시간" value={empty ? '—' : minutesText(eye.validMs)}
          detail={empty ? undefined : `실행 시간 ${minutesText(eye.runMs)}`} />
        <StatTile label="눈 휴식 완료" value={empty ? '—' : String(eye.breaks)} unit="회" detail="20초 후 복귀 버튼으로 본인이 확인한 횟수" />
        <StatTile label="가까워짐 안내" value={empty ? '—' : String(eye.nearReminders)} unit="회"
          detail={empty ? undefined : `깜빡임 안내 ${eye.openReminders}회`} />
      </div>
      <section aria-label="날짜별 깜빡임 빈도" className={`${CARD} space-y-3`}>
        <ChartHeader title="날짜별 깜빡임 빈도" legend={LINES} hint="날짜를 누르면 그날 학습이력으로 가요" />
        {empty ? <EmptyChart /> : (
          <DailyChart label="날짜별 깜빡임 빈도" lines={LINES} today={today} domain={[0, max]}
            faded={faded} detail={detail} onSelectDate={onSelectDate}
            data={days.map(day => ({ date: day.date, rate: day.eye.rate }))} />
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <section aria-label="시간대별 깜빡임" className={CARD}>
          <CardTitle title="시간대별 깜빡임" note={`${periodDays}일 평균`} />
          {empty ? <Waiting /> : (
            <HourlyChart label="시간대별 깜빡임 빈도" data={eye.hourly} lines={LINES} domain={[0, eye.hourlyMax]} unit="회/분" />
          )}
        </section>
        <section aria-label="유효 관찰 비율" className={CARD}>
          <CardTitle title="유효 관찰 비율" />
          {empty ? <Waiting /> : (
            <p className="text-sm text-muted">
              <b className="text-2xl font-extrabold text-heading">{percentLabel(eye.validRate)}</b> · 얼굴 유실은 휴식으로 계산하지 않아요
            </p>
          )}
        </section>
        <section aria-label="측정 기록" className={CARD}>
          <CardTitle title="측정 기록" />
          {empty ? <Waiting /> : <p className="text-sm text-muted">{`실행 시간 ${minutesText(eye.runMs)}`}</p>}
          <HistoryLink onClick={onOpenHistory} />
        </section>
      </div>
      <p className="text-xs text-muted">깜빡임 빈도는 생활 습관 안내용이에요. 건강 점수나 진단이 아니에요.</p>
    </div>
  );
}
