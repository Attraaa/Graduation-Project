import type { MonitoringState } from '../session/monitoringContext';
import { sessionLabel } from '../session/presentation';
import { keyboardSummary } from '../../../../database/keyboard';
import { livePressScore } from '../keyboard/liveScore';
import type { OverlaySession, OverlaySnapshot } from './contract';

const score = (n: number | null) => n === null ? '—' : `${Math.round(n)}점`;
export function overlaySnapshot(all: MonitoringState, owner: string, sequence: number, theme: 'light' | 'dark', savingFailed: boolean): OverlaySnapshot {
  const session = (mode: 'upper' | 'keyboard', detail: string): OverlaySession => {
    const { controls: c, snapshot: s } = all[mode];
    return { run: c.run, running: c.isRunning, paused: c.isPaused, seconds: c.elapsedSeconds, status: sessionLabel(c, s.phase),
      error: c.failed || (mode === 'upper' && all.upper.eye.phase === 'error'), detail: detail.slice(0, 120) };
  };
  const { upper, keyboard } = all;
  let detail = upper.controls.failed ? '카메라·분석 연결 확인 후 다시 시작해 주세요.' : `목 ${score(upper.controls.isRunning ? upper.snapshot.neck.currentScore : null)} · 어깨 ${score(upper.controls.isRunning ? upper.snapshot.shoulder.currentScore : null)}`;
  if (upper.controls.isRunning) {
    if (upper.snapshot.phase === 'calibrating') detail = '정면을 보고 기준 자세를 유지해 주세요.';
    else if (upper.snapshot.phase === 'unavailable') detail = '얼굴과 양쪽 어깨가 보이도록 맞춰 주세요.';
    else if (upper.eye.phase === 'calibrating') detail += upper.eye.measurement.calibrationPhase === 'eyes' ? ` · 눈 깜빡임 ${upper.eye.measurement.calibrationBlinks}/3` : ' · 눈을 편하게 뜨고 정면 유지';
    else if (upper.eye.phase === 'error') detail += ' · 깜빡임 분석 연결 확인';
    else if (upper.eye.measurement.recentBlinksPerMinute !== null) detail += ` · 깜빡임 ${upper.eye.measurement.recentBlinksPerMinute.toFixed(1)}회/분`;
  }
  const counts = keyboardSummary(keyboard.snapshot.counts);
  const keyboardDetail = keyboard.controls.failed ? '카메라·분석기 확인 후 다시 시작해 주세요.' : keyboard.snapshot.observationStatus === 'excluded' ? '미승인 앱 · 이 앱의 입력은 관찰하지 않습니다.'
    : `현재 ${score(keyboard.controls.isRunning ? livePressScore(keyboard.snapshot.latest) : null)} · 판정한 입력 ${counts.valid}회`;
  return { owner, sequence, theme, savingFailed, upper_body: session('upper', detail), keyboard: session('keyboard', keyboardDetail) };
}
