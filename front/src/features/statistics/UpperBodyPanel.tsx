import { useEffect, useRef, useState, type ReactNode } from 'react';
import ScoreRing from '../dashboard/ScoreRing';
import { SourceError, SourceLoading, type SourceStatus } from '../dashboard/SourceState';
import { minutesText, scoreText } from '../dashboard/format';
import EyePanel from './EyePanel';
import UpperPanel from './UpperPanel';
import { CARD, CardTitle, HistoryLink, Waiting } from './parts';
import type { PeriodDays, StatisticsSummary } from './period';

type SectionId = 'posture' | 'eye' | 'quality';
const SECTIONS: { id: SectionId; name: string; dot: string | null }[] = [
  { id: 'posture', name: '자세', dot: 'bg-mode-upper' },
  { id: 'eye', name: '눈', dot: 'bg-mode-blink' },
  { id: 'quality', name: '측정 품질·기록', dot: null },
];
const sectionId = (id: SectionId) => `stats-section-${id}`;
/** A section counts as the one being read once its top passes this far below the top of the scrolling area. */
const READ_LINE_PX = 120;

function SectionHeading({ id, name, dot, note }: { id: SectionId; name: string; dot: string | null; note: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <h2 id={`${sectionId(id)}-title`} className="flex items-center gap-2 text-xl font-extrabold text-heading">
        {dot && <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${dot}`} />}{name}
      </h2>
      <p className="text-sm text-muted">{note}</p>
    </div>
  );
}

function SourceBody({ status, onRetry, message, children }: { status: SourceStatus; onRetry: () => void; message: string; children: ReactNode }) {
  if (status === 'loading') return <SourceLoading className="h-64" />;
  if (status === 'error') return <SourceError onRetry={onRetry} message={message} />;
  return <>{children}</>;
}

const value = (text: string, unit: string) => (text === '—' ? text : `${text}${unit}`);

/**
 * 상체 tab (시안 S02, 2026-11-28): the 안구 tab joined it because both come from the same camera run. A bar that stays at
 * the top repeats the main numbers and jumps to the 자세, 눈 and 측정 품질·기록 sections below. Each section waits for and
 * retries its own source, so a failed eye request never hides the posture numbers.
 */
export default function UpperBodyPanel({ summary, periodDays, status, retry, focusEye = false, today, detail, onSelectDate, onOpenHistory }: {
  summary: StatisticsSummary; periodDays: PeriodDays;
  status: { posture: SourceStatus; eye: SourceStatus }; retry: { posture: () => void; eye: () => void };
  focusEye?: boolean; today: string;
  detail: (date: string) => ReactNode; onSelectDate: (date: string) => void; onOpenHistory: () => void;
}) {
  const { upper, eye } = summary;
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SectionId>(focusEye ? 'eye' : 'posture');
  const postureReady = status.posture === 'ready';

  useEffect(() => {
    const main = root.current?.closest('main');
    if (!main) return;
    const update = () => {
      const line = main.getBoundingClientRect().top + READ_LINE_PX;
      const atEnd = main.scrollTop + main.clientHeight >= main.scrollHeight - 2;
      let current: SectionId = 'posture';
      for (const section of SECTIONS) {
        const element = document.getElementById(sectionId(section.id));
        if (element && element.getBoundingClientRect().top <= line) current = section.id;
      }
      setActive(atEnd && main.scrollTop > 0 ? SECTIONS[SECTIONS.length - 1].id : current);
    };
    main.addEventListener('scroll', update, { passive: true });
    return () => main.removeEventListener('scroll', update);
  }, []);

  // An old `mode=eye` address (the former 안구 tab) opens the 눈 section; again once the posture numbers above it arrive.
  useEffect(() => {
    if (focusEye) document.getElementById(sectionId('eye'))?.scrollIntoView({ block: 'start' });
  }, [focusEye, postureReady]);

  const jump = (id: SectionId) => {
    setActive(id);
    document.getElementById(sectionId(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const anyPresent = upper.present || eye.present;
  const shared = { periodDays, today, detail, onSelectDate };

  return (
    <div ref={root} className="space-y-6">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm">
        <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted">
          <span>측정 <b className="text-lg font-black text-heading">{anyPresent ? minutesText(Math.max(upper.runMs, eye.runMs)) : '—'}</b></span>
          <span>목 <b className="text-lg font-black text-heading">{value(scoreText(upper.turtle.current), '점')}</b></span>
          <span>좌우 균형 <b className="text-lg font-black text-heading">{value(scoreText(upper.balance.current), '점')}</b></span>
          <span>깜빡임 <b className="text-lg font-black text-heading">{eye.rate === null ? '—' : `${Math.round(eye.rate)}회/분`}</b></span>
        </p>
        <nav aria-label="상체 통계 바로가기" className="flex flex-wrap gap-1.5">
          {SECTIONS.map(section => (
            <button key={section.id} type="button" aria-controls={sectionId(section.id)} aria-current={active === section.id ? 'true' : undefined}
              onClick={() => jump(section.id)}
              className={`flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold ${active === section.id ? 'bg-heading text-surface' : 'border border-border bg-surface text-heading hover:bg-nav-active'}`}>
              {section.dot && <span aria-hidden="true" className={`h-2 w-2 rounded-full ${section.dot}`} />}{section.name}
            </button>
          ))}
        </nav>
      </div>

      <section id={sectionId('posture')} aria-labelledby={`${sectionId('posture')}-title`} className="scroll-mt-24 space-y-3">
        <SectionHeading id="posture" name="자세" dot="bg-mode-upper" note="목·좌우 균형 점수와 기준 이탈" />
        <SourceBody status={status.posture} onRetry={retry.posture} message="자세 기록을 불러오지 못했어요">
          <UpperPanel upper={upper} days={summary.days} floor={summary.upperFloor} {...shared} />
        </SourceBody>
      </section>

      <section id={sectionId('eye')} aria-labelledby={`${sectionId('eye')}-title`} className="scroll-mt-24 space-y-3">
        <SectionHeading id="eye" name="눈" dot="bg-mode-blink" note="같은 카메라로 잰 깜빡임 · 점수가 아니라 횟수예요" />
        <SourceBody status={status.eye} onRetry={retry.eye} message="눈 기록을 불러오지 못했어요">
          <EyePanel eye={eye} days={summary.days} max={summary.eyeMax} {...shared} />
        </SourceBody>
      </section>

      <section id={sectionId('quality')} aria-labelledby={`${sectionId('quality')}-title`} className="scroll-mt-24 space-y-3">
        <SectionHeading id="quality" name="측정 품질·기록" dot={null} note="자세와 눈이 제대로 보였던 시간, 측정 횟수" />
        <div className="grid gap-4 md:grid-cols-3">
          <section aria-label="자세 제대로 측정" className={CARD}>
            <CardTitle title="자세 제대로 측정" />
            <SourceBody status={status.posture} onRetry={retry.posture} message="자세 기록을 불러오지 못했어요">
              {upper.present ? (
                <div className="flex items-center gap-4">
                  <ScoreRing value={upper.validRate} strokeClass="stroke-mode-upper" label="제대로 측정" unit="%" />
                  <p className="text-sm text-muted">{`미측정 ${minutesText(upper.unmeasuredMs)}`}</p>
                </div>
              ) : <Waiting />}
            </SourceBody>
          </section>
          <section aria-label="눈 유효 관찰" className={CARD}>
            <CardTitle title="눈 유효 관찰" />
            <SourceBody status={status.eye} onRetry={retry.eye} message="눈 기록을 불러오지 못했어요">
              {eye.present ? (
                <div className="flex items-center gap-4">
                  <ScoreRing value={eye.validRate} strokeClass="stroke-mode-blink" label="유효 관찰" unit="%" />
                  <p className="text-sm text-muted">얼굴이 안 보인 시간은 빼요</p>
                </div>
              ) : <Waiting />}
            </SourceBody>
          </section>
          <section aria-label="측정 기록" className={CARD}>
            <CardTitle title="측정 기록" />
            <SourceBody status={status.posture} onRetry={retry.posture} message="자세 기록을 불러오지 못했어요">
              {upper.present ? (
                <div className="space-y-1 text-sm text-muted">
                  <p>{`${upper.sessions}회 · 평균 ${minutesText(upper.averageMs ?? 0)}`}</p>
                  <p>{`가장 길게 이어진 측정 ${minutesText(upper.longestMs)}`}</p>
                </div>
              ) : <Waiting />}
            </SourceBody>
            <HistoryLink onClick={onOpenHistory} />
          </section>
        </div>
      </section>
    </div>
  );
}
