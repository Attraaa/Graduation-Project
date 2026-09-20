type Point = { x: number; y: number; z?: number };
type FaceResult = {
  faceLandmarks: Point[][];
  faceBlendshapes: { categories: { categoryName: string; score: number }[] }[];
};
export type EyeObservation = { left: number; right: number; faceWidth: number };
export type EyeReading = { observation: EyeObservation | null; reason: string | null };

/** Geometry is a coarse frontal-frame filter, not a gaze or occlusion detector. */
export function readEyes(result: FaceResult, width: number, height: number): EyeReading {
  const reject = (reason: string): EyeReading => ({ observation: null, reason });
  if (result.faceLandmarks.length !== 1) return reject('화면에 한 사람의 얼굴이 정면으로 보이게 해 주세요.');
  if (!(width > 0 && height > 0)) return reject('카메라 영상을 준비하고 있습니다.');
  const points = result.faceLandmarks[0];
  const ids = [33, 263, 1, 10, 152, 234, 454];
  if (ids.some(id => !points[id] || !Number.isFinite(points[id].x) || !Number.isFinite(points[id].y)
    || points[id].x < 0.02 || points[id].x > 0.98 || points[id].y < 0.02 || points[id].y > 0.98)) {
    return reject('얼굴 전체가 화면 안에 들어오도록 조절해 주세요.');
  }
  const [a, b, nose, top, chin, cheekA, cheekB] = ids.map(id => points[id]);
  const eyeSpan = Math.abs(b.x - a.x);
  const faceWidth = Math.hypot(cheekB.x - cheekA.x, (cheekB.y - cheekA.y) * height / width);
  const pitch = (nose.y - top.y) / (chin.y - top.y);
  if (faceWidth < 0.12 || eyeSpan < 0.055) return reject('얼굴이 너무 작게 보입니다. 카메라 구도를 조절해 주세요.');
  if (Math.abs(b.y - a.y) * height / (eyeSpan * width) > 0.25
    || Math.abs(nose.x - (a.x + b.x) / 2) / eyeSpan > 0.22
    || !Number.isFinite(pitch) || pitch < 0.3 || pitch > 0.75) {
    return reject('고개를 많이 돌리거나 기울이면 측정을 보류합니다. 정면을 봐 주세요.');
  }
  const categories = result.faceBlendshapes[0]?.categories ?? [];
  const left = categories.find(c => c.categoryName === 'eyeBlinkLeft')?.score;
  const right = categories.find(c => c.categoryName === 'eyeBlinkRight')?.score;
  if (left === undefined || right === undefined || ![left, right].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) {
    return reject('눈 특징을 읽을 수 없습니다. 조명과 안경 반사를 확인해 주세요.');
  }
  return { observation: { left, right, faceWidth }, reason: null };
}
