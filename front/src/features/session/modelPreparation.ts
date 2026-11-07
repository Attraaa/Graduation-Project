export type PreparationStage = 'camera' | 'pose' | 'face' | 'frame';

/** Elapsed time is feedback, never an initialization deadline or a progress estimate. */
export function preparationMessage(stage: PreparationStage, elapsedMs: number): string {
  const seconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const label = { camera: '카메라 연결 중', pose: '자세 분석 모델 준비 중', face: '깜빡임 분석 모델 준비 중', frame: '모델 준비 완료 · 첫 영상 분석 대기 중' }[stage];
  const hint = stage === 'camera' ? '카메라 권한 요청이 있으면 허용해 주세요.'
    : '첫 실행은 모델 초기화에 1분 이상 걸릴 수 있습니다. 준비가 끝나면 자동으로 관찰을 시작합니다.';
  return `${label} · ${seconds}초 경과. ${hint}${seconds >= 60 ? ' 아직 준비를 기다리고 있습니다. 원하면 중지할 수 있습니다.' : ''}`;
}

export function watchPreparation(stage: PreparationStage, publish: (message: string) => void): () => void {
  const started = performance.now();
  const update = () => publish(preparationMessage(stage, performance.now() - started));
  update();
  const timer = setInterval(update, 1000);
  return () => clearInterval(timer);
}
