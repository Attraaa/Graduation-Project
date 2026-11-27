import type { MonitoringState } from '../session/monitoringContext';
import { sessionLabel } from '../session/presentation';
import { keyboardSummary } from '../../../../database/keyboard';
import { liveAverage } from '../keyboard/liveScore';
import { overlayCalibrationText } from '../posture/guidance';
import type { OverlayMetric, OverlaySession, OverlaySnapshot } from './contract';

const score = (n: number | null) => n === null ? '—' : `${Math.round(n)}점`;
/** Red when the number as shown is at or below the alert score ("70점 이하" in the settings). */
const metric = (label: string, value: number | null, threshold: number): OverlayMetric => {
  const shown = value === null ? null : Math.round(value);
  return { label, value: shown === null ? '—' : String(shown), low: shown !== null && shown <= threshold };
};

/**
 * The overlay's view of both runtimes, against the alert scores of the notification settings (upper body, keyboard).
 * Keyboard shows the same score as the home card, the average of the last 50 judged presses.
 * While guidance is needed the row shows it instead of numbers.
 */
export function overlaySnapshot(all: MonitoringState, owner: string, sequence: number, theme: 'light' | 'dark', savingFailed: boolean,
  thresholds: { posture: number; keyboard: number }): OverlaySnapshot {
  const session = (mode: 'upper' | 'keyboard', detail: string, metrics: OverlayMetric[], note: string): OverlaySession => {
    const { controls: c, snapshot: s } = all[mode];
    return { run: c.run, running: c.isRunning, paused: c.isPaused, seconds: c.elapsedSeconds, status: sessionLabel(c, s.phase),
      error: c.failed || (mode === 'upper' && all.upper.eye.phase === 'error'), detail: detail.slice(0, 120), metrics, note: note.slice(0, 30) };
  };
  const { upper, keyboard } = all;
  const neck = upper.controls.isRunning ? upper.snapshot.neck.currentScore : null;
  const balance = upper.controls.isRunning ? upper.snapshot.balance.currentScore : null;
  let detail = upper.controls.failed ? '카메라·분석 연결 확인 후 다시 시작해 주세요.' : `목 ${score(neck)} · 좌우 균형 ${score(balance)}`;
  let guidance = upper.controls.failed, note = '';
  if (upper.controls.isRunning) {
    const rate = upper.eye.measurement.recentBlinksPerMinute;
    if (upper.snapshot.phase === 'calibrating') { detail = overlayCalibrationText(upper.snapshot.neckModel); guidance = true; }
    else if (upper.snapshot.phase === 'unavailable') { detail = '얼굴과 양쪽 어깨가 보이도록 맞춰 주세요.'; guidance = true; }
    else if (upper.eye.phase === 'calibrating') {
      const eyes = upper.eye.measurement.calibrationPhase === 'eyes';
      detail += eyes ? ` · 눈 깜빡임 ${upper.eye.measurement.calibrationBlinks}/3` : ' · 눈을 편하게 뜨고 정면 유지';
      note = eyes ? `깜빡임 보정 ${upper.eye.measurement.calibrationBlinks}/3` : '깜빡임 보정 중';
    } else if (upper.eye.phase === 'error') { detail += ' · 깜빡임 분석 연결 확인'; note = '깜빡임 확인 필요'; }
    else if (rate !== null) detail += ` · 깜빡임 ${rate.toFixed(1)}회/분`;
  }
  const upperMetrics = guidance ? [] : [metric('목', neck, thresholds.posture), metric('균형', balance, thresholds.posture)];

  const counts = keyboardSummary(keyboard.snapshot.counts);
  const average = keyboard.controls.isRunning ? liveAverage(keyboard.snapshot.scores) : null;
  const excluded = keyboard.snapshot.observationStatus === 'excluded';
  const keyboardPreparing = keyboard.controls.isRunning && keyboard.snapshot.phase !== 'ready';
  const keyboardGuidance = keyboard.controls.failed || excluded || keyboardPreparing;
  const keyboardDetail = keyboard.controls.failed ? '카메라·분석기 확인 후 다시 시작해 주세요.' : excluded ? '미승인 앱 · 이 앱의 입력은 관찰하지 않습니다.'
    : keyboardPreparing ? keyboard.snapshot.message || '카메라와 분석기를 준비하고 있어요.' : `최근 평균 ${score(average)} · 판정한 입력 ${counts.valid}회`;
  return {
    owner, sequence, theme, savingFailed,
    upper_body: { ...session('upper', detail, upperMetrics, note), blinkRate: upper.controls.isRunning ? upper.eye.measurement.recentBlinksPerMinute : null },
    keyboard: session('keyboard', keyboardDetail, keyboardGuidance ? [] : [metric('키보드', average, thresholds.keyboard)],
      keyboardGuidance || !keyboard.controls.isRunning ? '' : `판정 ${counts.valid}회`),
  };
}
