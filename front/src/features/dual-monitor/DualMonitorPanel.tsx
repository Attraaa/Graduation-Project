import { Lightbulb, Monitor } from 'lucide-react';
import type { RegistrationIssue } from './layout';
import type { ScreenAdvice, ScreenSummary } from './tracker';
import type { DualMonitorView } from './useDualMonitor';

const SCREEN_COLORS = ['var(--color-mode-upper)', 'var(--color-mode-keyboard)', 'var(--color-mode-shoulder)', 'var(--color-mode-eye)'];
const AWAY_COLOR = 'var(--color-border-strong)';
const ISSUE_TEXT: Record<RegistrationIssue, string> = {
  'no-face': '얼굴이 보이지 않습니다. 카메라에 얼굴이 보이는지 확인해 주세요.',
  unstable: '고개를 움직이지 말고 잠시 유지해 주세요.',
  'too-close': '앞에서 등록한 화면과 방향이 거의 같습니다. 이번 화면 쪽으로 고개를 돌려 주세요.',
  timeout: '시간 안에 방향을 등록하지 못했습니다.',
};
const button = 'min-h-9 rounded-xl border border-border bg-surface px-3 py-1.5 text-sm font-bold text-heading disabled:opacity-50';
const primaryButton = 'min-h-10 rounded-xl border border-primary-border bg-primary px-4 py-2 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-50';

const duration = (ms: number) => {
  const minutes = Math.floor(ms / 60_000), hours = Math.floor(minutes / 60);
  if (minutes < 1) return `${Math.max(0, Math.floor(ms / 1000))}초`;
  return hours ? `${hours}시간 ${minutes % 60}분` : `${minutes}분`;
};
const percent = (share: number) => `${Math.round(share * 100)}%`;
const adviceText = (advice: ScreenAdvice) => advice.kind === 'side-heavy'
  ? `정면이 아닌 화면을 본 시간이 ${percent(advice.sideShare)}입니다. 가장 많이 보는 화면을 몸 정면에 두고 카메라도 그 화면 위로 옮기면 고개를 돌리는 시간이 줄고 목·어깨 측정도 덜 끊깁니다.`
  : advice.kind === 'long-side'
    ? `정면이 아닌 화면을 한 번에 최대 ${duration(advice.longestSideStreakMs)} 이어서 봤습니다. 오래 보는 작업 창은 정면 화면으로 옮겨 보세요.`
    : '정면 모니터를 중심으로 쓰고 있습니다. 지금 배치를 유지해도 좋습니다.';

/** Presentation only: registration, current screen and per-screen time come from useDualMonitor. */
export default function DualMonitorPanel({ view, isRunning, isPaused }: { view: DualMonitorView; isRunning: boolean; isPaused: boolean }) {
  const { layout, issue, registration } = view;
  const canRegister = isRunning && !isPaused;
  return <section aria-label="듀얼 모니터" className="space-y-3 rounded-2xl border border-border bg-surface p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="flex items-center gap-2 font-bold text-heading"><Monitor size={18} />듀얼 모니터</h2>
        <p className="mt-1 text-xs text-muted">얼굴 방향으로 지금 보는 화면을 구분합니다. 눈동자 시선 추적은 아닙니다.</p>
      </div>
      {layout && !issue && !registration && <div className="flex gap-2">
        <button type="button" className={button} disabled={!canRegister} onClick={view.register}>다시 등록</button>
        <button type="button" className={button} onClick={view.forget}>등록 해제</button>
      </div>}
    </div>
    {registration ? <Registration view={view} canRegister={canRegister} />
      : !layout || issue ? <Intro view={view} canRegister={canRegister} />
        : <Usage view={view} running={canRegister} />}
  </section>;
}

function Intro({ view, canRegister }: { view: DualMonitorView; canRegister: boolean }) {
  const count = view.displayCount;
  const how = count !== null && count >= 2 ? `모니터 ${count}대가 연결되어 있습니다. 화면마다 나타나는 초록 점을 차례로 바라보면 고개 방향을 등록합니다.`
    : count === 1 ? '연결된 모니터가 1대로 보입니다. 다른 컴퓨터의 화면처럼 연결되지 않은 보조 화면도 직접 바라보며 등록할 수 있습니다.'
      : '정면 모니터와 보조 모니터를 차례로 바라보며 고개 방향을 등록합니다.';
  return <div className="space-y-3">
    {view.issue && <p role="status" className="rounded-xl bg-surface-muted p-3 text-sm text-heading">
      {view.issue === 'camera' ? '카메라나 영상 설정이 바뀌어 등록한 방향을 쓸 수 없습니다.' : '모니터 연결이나 배치가 바뀌어 등록한 방향을 쓸 수 없습니다.'} 다시 등록해 주세요.
    </p>}
    <p className="text-sm text-muted">{how} 등록하면 옆 화면을 볼 때 경고 대신 보고 있는 화면을 표시하고, 화면별 사용 시간을 알려 드립니다.</p>
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className={primaryButton} disabled={!canRegister} onClick={view.register}>모니터 방향 등록</button>
      {view.issue && <button type="button" className={button} onClick={view.forget}>등록 해제</button>}
      {!canRegister && <span className="text-xs text-muted">상체 측정 중에 등록할 수 있습니다.</span>}
    </div>
  </div>;
}

function Registration({ view, canRegister }: { view: DualMonitorView; canRegister: boolean }) {
  const state = view.registration!;
  const failed = state.status === 'failed';
  const instruction = !state.manual ? '초록 점이 나타난 화면의 가운데를 바라봐 주세요.'
    : state.step === 0 ? '카메라가 있는 정면 모니터의 가운데를 바라봐 주세요.' : '보조 모니터의 가운데를 바라봐 주세요.';
  return <div aria-live="polite" className="space-y-2 rounded-xl bg-surface-muted p-3">
    <p className="text-sm font-bold text-heading">{failed ? '모니터 방향을 등록하지 못했습니다.' : `${state.step + 1}/${state.total} · ${instruction}`}</p>
    {!failed && <progress aria-label="모니터 방향 등록 진행률" value={state.progress} max={1} className="h-2 w-full accent-primary" />}
    {state.issue && <p className="text-xs text-muted">{ISSUE_TEXT[state.issue]}</p>}
    <div className="flex gap-2">
      {failed && <button type="button" className={button} disabled={!canRegister} onClick={view.register}>다시 시도</button>}
      <button type="button" className={button} onClick={view.cancelRegistration}>{failed ? '닫기' : '취소'}</button>
    </div>
  </div>;
}

function Usage({ view, running }: { view: DualMonitorView; running: boolean }) {
  const screens = view.layout!.screens;
  const summary: ScreenSummary | null = view.summary;
  const color = (id: string) => {
    const index = screens.findIndex(screen => screen.id === id);
    return index < 0 ? AWAY_COLOR : SCREEN_COLORS[index % SCREEN_COLORS.length];
  };
  const current = running ? summary?.current ?? null : null;
  const currentLabel = !running ? '측정 중이 아님' : current === null ? '확인 중' : current === 'away' ? '화면 밖' : current.label;
  const shares = summary?.shares.filter(share => share.ms > 0) ?? [];
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">지금 보는 화면</span>
      <span className="flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 font-bold text-heading">
        <i className="h-2 w-2 rounded-full" style={{ backgroundColor: current === null ? AWAY_COLOR : color(current === 'away' ? 'away' : current.id) }} />
        {currentLabel}{current !== null && summary ? ` · ${duration(summary.currentMs)}째` : ''}
      </span>
    </div>
    {!summary || summary.observedMs <= 0 ? <p className="text-sm text-muted">상체 측정 중 얼굴이 보이면 화면별 시간이 여기에 쌓입니다. 등록한 화면: {screens.map(screen => screen.label).join(', ')}</p> : <>
      <div role="img" aria-label={`화면별 시간 ${shares.map(share => `${share.label} ${percent(share.share)}`).join(', ')}`} className="flex h-3 overflow-hidden rounded-full bg-track">
        {shares.map(share => <span key={share.id} style={{ width: `${share.share * 100}%`, backgroundColor: color(share.id) }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {summary.shares.map(share => <li key={share.id} className="flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full" style={{ backgroundColor: color(share.id) }} />
          <span className="font-bold text-heading">{share.label}</span>{percent(share.share)} · {duration(share.ms)}
        </li>)}
      </ul>
      <p className="text-xs text-muted">화면 전환 {summary.switches}회 · 정면이 아닌 화면 최장 연속 {duration(summary.longestSideStreakMs)}</p>
      {summary.advice ? <p className="flex gap-2 rounded-xl bg-surface-muted p-3 text-sm text-heading"><Lightbulb size={18} className="shrink-0 text-warning" />{adviceText(summary.advice)}</p>
        : <p className="text-xs text-muted">5분 이상 관찰하면 화면 배치 안내를 보여 드립니다.</p>}
    </>}
  </div>;
}
