import { DEFAULT_CALIBRATION_OPTIONS, advanceCalibration, createCalibration, extractFrontalMeasurement } from './calibration.ts';
import type { CalibrationFrame, CalibrationReason, CalibrationReference, CalibrationState, FrontalMeasurement } from './calibration.ts';
import { YAW_LIMIT } from './scoreSettings.ts';

/**
 * [역할: 듀얼 모니터의 옆 모니터 기준 자세]
 * 정면(카메라 쪽) 기준을 모은 뒤, 등록된 옆 모니터마다 그 화면을 볼 때의 기준을 한 번씩 모읍니다.
 * 이후 각 프레임은 고개 방향이 가장 가까운 기준과만 비교합니다. 기준은 세션마다 새로 모읍니다.
 */
export type ViewTarget = { id: string; label: string };
export type ViewResult = ViewTarget & { status: 'ready' | 'failed' | 'skipped'; reason: CalibrationReason | 'timeout' | null };
export type ViewCalibrationState = {
  targets: readonly ViewTarget[];
  index: number;
  startedAtMs: number | null;
  calibration: CalibrationState;
  references: readonly CalibrationReference[];
  results: readonly ViewResult[];
};

/** Acquisition setting, not a scoring limit: give up on one monitor after this long. */
export const VIEW_CALIBRATION = Object.freeze({ timeoutMs: 20_000 });
// Same stability and visibility rules as the front reference, without the frontal-yaw requirement.
const VIEW_OPTIONS = Object.freeze({ ...DEFAULT_CALIBRATION_OPTIONS, maxReferenceYawRatio: Number.POSITIVE_INFINITY });

export function createViewCalibration(targets: readonly ViewTarget[]): ViewCalibrationState {
  return { targets, index: 0, startedAtMs: null, calibration: createCalibration(), references: [], results: [] };
}

export const currentViewTarget = (state: ViewCalibrationState): ViewTarget | null => state.targets[state.index] ?? null;

function finishTarget(state: ViewCalibrationState, result: ViewResult, reference?: CalibrationReference): ViewCalibrationState {
  return { ...state, index: state.index + 1, startedAtMs: null, calibration: createCalibration(),
    references: reference ? [...state.references, reference] : state.references, results: [...state.results, result] };
}

/**
 * Collects the reference of the current side monitor. Frames still facing the front reference never count,
 * so looking late at the new monitor cannot copy the front posture. Fails after VIEW_CALIBRATION.timeoutMs.
 */
export function advanceViewCalibration(state: ViewCalibrationState, frame: CalibrationFrame, front: CalibrationReference): ViewCalibrationState {
  const target = currentViewTarget(state);
  if (!target || !Number.isFinite(frame.timestampMs)) return state;
  const startedAtMs = state.startedAtMs ?? frame.timestampMs;
  if (frame.timestampMs - startedAtMs > VIEW_CALIBRATION.timeoutMs) {
    return finishTarget(state, { ...target, status: 'failed', reason: state.calibration.reason ?? 'timeout' });
  }
  const current = extractFrontalMeasurement(frame, VIEW_OPTIONS);
  if (current.valid && Math.abs(current.measurement.yawSigned - (front.yawSigned ?? 0)) <= YAW_LIMIT) {
    return { ...state, startedAtMs, calibration: { ...createCalibration(), reason: 'facing-front' } };
  }
  const calibration = advanceCalibration(state.calibration, frame, VIEW_OPTIONS);
  if (!calibration.reference) return { ...state, startedAtMs, calibration };
  return finishTarget(state, { ...target, status: 'ready', reason: null }, { ...calibration.reference, view: { id: target.id, label: target.label } });
}

/** Pause or stream loss: restart the current monitor's samples and timeout, keeping finished monitors. */
export function interruptViewCalibration(state: ViewCalibrationState): ViewCalibrationState {
  return currentViewTarget(state) ? { ...state, startedAtMs: null, calibration: createCalibration() } : state;
}

/** The user chose not to collect the current monitor; its frames stay on hold as before. */
export function skipViewTarget(state: ViewCalibrationState): ViewCalibrationState {
  const target = currentViewTarget(state);
  return target ? finishTarget(state, { ...target, status: 'skipped', reason: null }) : state;
}

/** The reference whose head direction is closest to this frame; ties keep the front reference. */
export function chooseReference(front: CalibrationReference, views: readonly CalibrationReference[],
  measurement: Pick<FrontalMeasurement, 'yawSigned'>): CalibrationReference {
  let best = front, distance = Math.abs(measurement.yawSigned - (front.yawSigned ?? 0));
  for (const view of views) {
    const next = Math.abs(measurement.yawSigned - (view.yawSigned ?? 0));
    if (next < distance) { best = view; distance = next; }
  }
  return best;
}
