export function sessionLabel(controls: { isRunning: boolean; isPaused: boolean; elapsedSeconds: number; failed?: boolean }, phase: string) {
  if (!controls.isRunning) return controls.failed ? '오류로 중지' : controls.elapsedSeconds ? '측정 종료' : '준비됨';
  if (controls.isPaused) return '일시정지';
  return ({ loading: '모델 준비 중', calibrating: '기준 자세 수집', observing: '관찰 중', unavailable: '관찰 일시 불가', error: '분석 오류', idle: '준비 중', starting: '분석기 준비 중', mapping: '키보드 위치 인식', ready: '관찰 중' } as Record<string, string>)[phase] ?? '상태 확인 필요';
}
