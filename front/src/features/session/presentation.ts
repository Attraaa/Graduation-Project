import type { KeyboardMonitorSnapshot } from '../keyboard/monitorTypes';
import type { GuidanceLine } from './GuidanceBand';

export function sessionLabel(controls: { isRunning: boolean; isPaused: boolean; elapsedSeconds: number; failed?: boolean }, phase: string) {
  if (!controls.isRunning) return controls.failed ? '오류로 중지' : controls.elapsedSeconds ? '측정 종료' : '준비됨';
  if (controls.isPaused) return '일시정지';
  return ({ loading: '모델 준비 중', calibrating: '기준 자세 수집', observing: '관찰 중', unavailable: '관찰 일시 불가', error: '분석 오류', idle: '준비 중', starting: '분석기 준비 중', mapping: '키보드 위치 인식', ready: '관찰 중' } as Record<string, string>)[phase] ?? '상태 확인 필요';
}

/**
 * 키보드 카메라 화면 아래쪽 띠의 안내. 준비·키보드 위치 인식·자동 인식 실패(직접 맞추기 대기)·오류·미승인 앱을 알리고,
 * 판정이 시작되면 손과 키보드를 가리지 않도록 비웁니다(첫 판정 전까지는 '타이핑해 보세요' 안내를 둡니다).
 */
export function keyboardGuidance(snapshot: KeyboardMonitorSnapshot, controls: { isRunning: boolean; isPaused: boolean; failed?: boolean }): GuidanceLine[] {
  if (!controls.isRunning) return controls.failed ? [{ tone: 'error', text: snapshot.message || '키보드 분석 연결을 확인해 주세요.' }] : [];
  if (controls.isPaused) return [];
  if (snapshot.phase === 'error') return [{ tone: 'error', text: snapshot.message || '키보드 분석 연결을 확인해 주세요.' }];
  if (snapshot.recognition === 'waiting') return [{ tone: 'warn', badge: 'alert', text: snapshot.message || '카메라 설정에서 키보드 영역을 맞춰 주세요.' }];
  if (snapshot.phase !== 'ready') return [{ tone: 'info', text: snapshot.message || '손과 키보드가 보이도록 카메라를 맞춰 주세요.' }];
  if (snapshot.observationStatus === 'excluded') return [{ tone: 'warn', text: '미승인 앱 · 이 앱의 입력은 관찰하지 않습니다.' }];
  return !snapshot.latest && !snapshot.detectedPresses && snapshot.message ? [{ tone: 'info', text: snapshot.message }] : [];
}
