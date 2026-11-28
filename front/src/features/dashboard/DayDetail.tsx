import { longDate, minutesText, rateText, scoreText } from './format';
import type { DashboardDay } from './summary';

function Row({ dotClass, name, value, sub, extra }: { dotClass: string; name: string; value: string; sub?: string; extra: string }) {
  return (
    <li className="grid grid-cols-[0.75rem_2.75rem_1fr_auto] items-center gap-x-2">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span className="text-muted">{name}</span>
      <b className="text-heading">{value}</b>
      <span className="text-right text-muted">{extra}</span>
      {sub && <span className="col-start-3 col-end-5 text-muted">{sub}</span>}
    </li>
  );
}

const sessionText = (sessions: number, runMs: number) => (sessions > 0 ? `${sessions}회 · ${minutesText(runMs)}` : '');

/**
 * Hover box for one chart day: only modes recorded that day, plus total observation and an optional hint. The blink rate
 * is part of the 상체 line since 2026-11-28 (same camera), on its own second line.
 */
export default function DayDetail({ day, hint }: { day: DashboardDay; hint?: string }) {
  const posture = day.upper.sessions > 0;
  const blink = day.eye.present ? `깜빡임 ${rateText(day.eye.rate)}` : undefined;
  return (
    <div className="w-72 rounded-xl border border-border bg-surface p-3 text-sm shadow-lg">
      <p className="mb-2 font-bold text-heading">{longDate(day.date)}</p>
      <ul className="space-y-1">
        {(posture || day.eye.present) && (
          <Row dotClass="bg-mode-upper" name="상체"
            value={posture ? `목 ${scoreText(day.upper.turtle)} · 좌우 균형 ${scoreText(day.upper.balance)}` : blink ?? ''}
            sub={posture ? blink : undefined}
            extra={posture ? sessionText(day.upper.sessions, day.upper.runMs) : minutesText(day.eye.runMs)} />
        )}
        {day.keyboard.present && (
          <Row dotClass="bg-mode-keyboard" name="키보드"
            value={day.keyboard.score === null ? '판정 자료 없음' : `${scoreText(day.keyboard.score)}점`}
            extra={sessionText(day.keyboard.sessions, day.keyboard.runMs)} />
        )}
      </ul>
      <p className="mt-2 border-t border-border pt-2 text-muted">{`총 관찰 ${minutesText(day.totalMs)}`}</p>
      {hint && <p className="mt-1 text-xs font-semibold text-secondary">{hint}</p>}
    </div>
  );
}
