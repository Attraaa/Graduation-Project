import type { MonitorSnapshot, NeckModelView } from './monitorTypes.ts';
import type { NeckFailure } from './e19/model.ts';
import type { GuidanceLine } from '../session/GuidanceBand.tsx';

/** 기준 자세 보정 실패 세 가지 안내. full은 카메라 화면 띠, short는 오버레이 미니 바에 씁니다. */
export const NECK_FAILURE_TEXT: Readonly<Record<NeckFailure, { full: string; short: string }>> = Object.freeze({
  too_few_frames: { full: '얼굴과 양쪽 어깨가 화면 안에 보이게 앉아 주세요.', short: '얼굴과 양쪽 어깨가 보이게 앉아 주세요' },
  unstable: { full: '5초 동안 움직임이 있었어요. 움직이지 말고 그대로 계세요.', short: '움직임이 있었어요. 그대로 앉아 계세요' },
  not_upright: { full: '고개를 들어 화면 가운데를 봐 주세요.', short: '고개를 들어 화면 가운데를 봐 주세요' },
});

/** 상체 카메라 화면 아래 띠의 안내. 관찰 중에는 비어 있고, 깜빡임 보정 안내는 EyeCalibrationGuide가 따로 그립니다. */
export function upperGuidance(snapshot: MonitorSnapshot, controls: { isRunning: boolean; isPaused: boolean; failed?: boolean }): GuidanceLine[] {
  if (!controls.isRunning) return controls.failed ? [{ tone: 'error', text: '카메라·분석 연결을 확인한 뒤 다시 시작해 주세요.' }] : [];
  if (controls.isPaused) return [];
  if (snapshot.phase === 'loading') return [{ tone: 'info', text: '카메라와 상체 분석을 준비하고 있습니다.' }];
  if (snapshot.phase === 'error') return [{ tone: 'error', text: '카메라·분석 연결을 확인한 뒤 중지하고 다시 시작해 주세요.' }];
  if (snapshot.phase === 'unavailable') return [{ tone: 'info', text: '얼굴과 양쪽 어깨가 화면에 보이도록 정면을 향해 주세요.' }];
  if (snapshot.phase === 'observing') return [];
  const { step, secondsLeft: left, failure } = snapshot.neckModel;
  if (step === 'prep') return [left === null ? { tone: 'info', text: '편하게 바르게 앉아 화면 가운데를 보세요.' }
    : { tone: 'info', badge: left, text: `편하게 바르게 앉아 화면 가운데를 보세요. ${left}초 뒤 기준 자세를 기록해요.` }];
  if (step === 'collect') return [{ tone: 'info', badge: left ?? undefined, progress: snapshot.progress, text: '그대로 유지해 주세요. 기준 자세를 기록하고 있어요.' }];
  if (step === 'failed' && failure) return [{ tone: 'warn', badge: 'alert', text: `${NECK_FAILURE_TEXT[failure].full}${left === null ? '' : ` ${left}초 뒤 다시 시작해요.`}` }];
  return [{ tone: 'info', text: '기준 자세를 확인하고 있어요.' }];
}

/** 오버레이 미니 바의 보정 중 한 줄. */
export function overlayCalibrationText({ step, secondsLeft: left, failure }: NeckModelView) {
  if (step === 'prep') return left === null ? '편하게 바르게 앉아 화면 가운데를 보세요' : `편하게 바르게 앉아 화면 가운데를 보세요 · ${left}초 뒤 기록`;
  if (step === 'collect') return left === null ? '그대로 유지해 주세요' : `그대로 유지해 주세요 · ${left}초 남음`;
  if (step === 'failed' && failure) return left === null ? NECK_FAILURE_TEXT[failure].short : `${NECK_FAILURE_TEXT[failure].short} · ${left}초 뒤 다시 시작`;
  return '기준 자세를 확인하고 있어요';
}
