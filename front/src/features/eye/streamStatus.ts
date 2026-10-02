export type EyeCameraSignature = { deviceId: string; width: number; height: number };

export function eyeCameraChanged(previous: EyeCameraSignature | null, next: EyeCameraSignature): boolean {
  return previous !== null && (previous.deviceId !== next.deviceId || previous.width !== next.width || previous.height !== next.height);
}

/** Begins at model readiness, so a camera that never delivers its first frame is covered. */
export function eyeStreamIssue(now: number, readyAt: number | null, lastFrameAt: number | null, hidden: boolean): string | null {
  if (readyAt === null) return null;
  if (hidden) return '다른 탭에서는 영상 관찰을 보류합니다.';
  const lastAt = lastFrameAt ?? readyAt;
  if (now - lastAt <= 1000) return null;
  return lastFrameAt === null
    ? '카메라 영상이 도착하지 않습니다. 카메라 연결을 확인한 뒤 다시 시작해 주세요.'
    : '영상이 멈췄습니다. 카메라 연결을 확인해 주세요. 계속되면 다시 시작해 주세요.';
}
