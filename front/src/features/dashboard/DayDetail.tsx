import { longDate, minutesText, rateText, scoreText } from './format';
import type { DashboardDay } from './summary';

function Row({ dotClass, name, value, extra }: { dotClass: string; name: string; value: string; extra: string }) {
  return (
    <li className="grid grid-cols-[0.75rem_2.75rem_1fr_auto] items-center gap-2">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dotClass}`} />
      <span className="text-muted">{name}</span>
      <b className="text-heading">{value}</b>
      <span className="text-right text-muted">{extra}</span>
    </li>
  );
}

const sessionText = (sessions: number, runMs: number) => (sessions > 0 ? `${sessions}회 · ${minutesText(runMs)}` : '');

/** Hover box for one chart day: only modes recorded that day, plus total observation and an optional hint. */
export default function DayDetail({ day, hint }: { day: DashboardDay; hint?: string }) {
  return (
    <div className="w-72 rounded-xl border border-border bg-surface p-3 text-sm shadow-lg">
      <p className="mb-2 font-bold text-heading">{longDate(day.date)}</p>
      <ul className="space-y-1">
        {day.upper.sessions > 0 && (
          <Row dotClass="bg-mode-upper" name="상체" value={`목 ${scoreText(day.upper.turtle)} · 어깨 ${scoreText(day.upper.shoulder)}`}
            extra={sessionText(day.upper.sessions, day.upper.runMs)} />
        )}
        {day.keyboard.present && (
          <Row dotClass="bg-mode-keyboard" name="키보드"
            value={day.keyboard.score === null ? '판정 자료 없음' : `${scoreText(day.keyboard.score)}점`}
            extra={sessionText(day.keyboard.sessions, day.keyboard.runMs)} />
        )}
        {day.eye.present && (
          <Row dotClass="bg-mode-eye" name="안구" value={rateText(day.eye.rate)} extra={minutesText(day.eye.runMs)} />
        )}
      </ul>
      <p className="mt-2 border-t border-border pt-2 text-muted">{`총 관찰 ${minutesText(day.totalMs)}`}</p>
      {hint && <p className="mt-1 text-xs font-semibold text-secondary">{hint}</p>}
    </div>
  );
}
