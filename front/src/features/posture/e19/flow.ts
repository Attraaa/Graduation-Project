import { DEFAULT_CALIBRATION_OPTIONS, type CalibrationReason } from '../calibration.ts';
import type { NeckCalibration, NeckFailure, NeckFrame } from './model.ts';

/**
 * [역할: 기준 자세 보정 순서와 시간 필터(순수 계산)]
 * 3초 준비 → 5초 기록(초당 약 10장) → 보정 계산 → 성공이면 관찰, 실패면 이유를 3초 보여 준 뒤 3초 준비부터 다시.
 * 연구의 실시간 비교 도구와 같은 순서·간격이며, 5초는 패키지 config.json의 calibration.window_sec에서 받습니다.
 */
export const NECK_FLOW = Object.freeze({ prepMs: 3000, failureMs: 3000, sampleMs: 100 });

export type NeckStep = 'prep' | 'collect' | 'computing' | 'failed' | 'ready';
export interface NeckFlow {
  step: NeckStep;
  /** 지금 단계가 시작된 시각(ms). */
  since: number;
  frames: readonly NeckFrame[];
  failure: NeckFailure | null;
}

export const startNeckFlow = (now: number): NeckFlow => ({ step: 'prep', since: now, frames: [], failure: null });

/** 프레임마다 호출합니다. frame은 포즈 결과가 있는 모든 프레임(없으면 null)이며 기록 단계에서 약 100ms 간격으로만 모읍니다. */
export function advanceNeckFlow(flow: NeckFlow, now: number, frame: NeckFrame | null, collectMs: number): NeckFlow {
  if (flow.step === 'prep' && now - flow.since >= NECK_FLOW.prepMs) flow = { ...flow, step: 'collect', since: flow.since + NECK_FLOW.prepMs };
  if (flow.step === 'collect') {
    if (now - flow.since >= collectMs) return { ...flow, step: 'computing' };
    const last = flow.frames.at(-1);
    // 30 fps에서 3장마다 1장(100ms)이 되도록 약간의 지터는 허용합니다.
    return frame && (!last || frame.t - last.t >= NECK_FLOW.sampleMs - 5) ? { ...flow, frames: [...flow.frames, frame] } : flow;
  }
  if (flow.step === 'failed' && now - flow.since >= NECK_FLOW.failureMs) return startNeckFlow(now);
  return flow;
}

/**
 * 같은 5초 동안 어깨 점수의 기준(calibration.ts, 3초 이상 안정 구간)이 잡히지 않았을 때 보여 줄 이유.
 * calibration.ts의 마지막 재수집 이유를 E19 보정 실패 세 가지 안내 중 하나로 옮깁니다.
 */
export function referenceFailure(reason: CalibrationReason | null): NeckFailure {
  if (reason === 'head-turned') return 'not_upright';
  return reason === 'moving' || reason === null ? 'unstable' : 'too_few_frames';
}

export const finishNeckFlow = (now: number, result: NeckCalibration): NeckFlow =>
  result.ok ? { step: 'ready', since: now, frames: [], failure: null } : { step: 'failed', since: now, frames: [], failure: result.reason };

/** 준비·기록·실패 안내에 보여 줄 남은 초(올림). 그 밖의 단계는 null. */
export function neckSecondsLeft(flow: NeckFlow, now: number, collectMs: number) {
  const total = flow.step === 'prep' ? NECK_FLOW.prepMs : flow.step === 'collect' ? collectMs : flow.step === 'failed' ? NECK_FLOW.failureMs : null;
  return total === null ? null : Math.max(1, Math.ceil((total - Math.max(0, now - flow.since)) / 1000));
}

/** One Euro 필터(연구 도구와 같은 식, 시간은 ms로 받아 초 단위로 계산). 보정할 때 reset합니다. */
export function createOneEuro(minCutoff: number, beta: number, dCutoff = 1.0) {
  let x: number | null = null, dx = 0, last: number | null = null;
  const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);
  return {
    filter(value: number, atMs: number) {
      if (x === null || last === null) { x = value; last = atMs; return value; }
      const dt = Math.max((atMs - last) / 1000, 1e-3); last = atMs;
      dx += alpha(dCutoff, dt) * ((value - x) / dt - dx);
      x += alpha(minCutoff + beta * Math.abs(dx), dt) * (value - x);
      return x;
    },
    reset() { x = null; dx = 0; last = null; },
  };
}

/**
 * 목 점수의 관찰 시간(초). 목은 어깨의 관측 조건과 따로 E19 자체 검사만 따르므로 시간도 따로 셉니다.
 * E19가 잰 결과끼리 간격이 500ms 이하일 때만 더합니다(어깨 관찰 시간과 같은 규칙).
 */
export interface NeckClock { seconds: number; lastAt: number | null }
export const startNeckClock = (): NeckClock => ({ seconds: 0, lastAt: null });
export function tickNeckClock(clock: NeckClock, at: number): NeckClock {
  const gap = clock.lastAt === null ? null : at - clock.lastAt;
  return { seconds: clock.seconds + (gap !== null && gap > 0 && gap <= DEFAULT_CALIBRATION_OPTIONS.maxGapMs ? gap / 1000 : 0), lastAt: at };
}
/** 측정이 끊기면 다음 결과와 잇지 않습니다. */
export const breakNeckClock = (clock: NeckClock): NeckClock => ({ ...clock, lastAt: null });
