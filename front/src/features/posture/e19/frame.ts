import type { NeckFrame } from './model.ts';

/**
 * [역할: 같은 캔버스 프레임의 포즈와 얼굴 결과를 E19 입력 한 장으로 묶기]
 * 앱은 포즈(PostureMonitor)와 얼굴(EyeMonitor)을 서로 다른 주기로 돌리므로, 얼굴 결과를 캡처 시각과 함께 잠깐 보관했다가
 * 포즈가 본 것과 같은 영상 프레임(videoTime)의 얼굴을 고릅니다. 같은 프레임이 없으면 가장 가까운 시각(최대 70ms)의 얼굴을 씁니다.
 */
export interface Landmark { x: number; y: number; z?: number; visibility?: number }
export interface FaceSample {
  /** 얼굴 분석에 넘긴 캡처 시각(performance.now 기준). */
  t: number;
  /** 그때 캔버스에 그려져 있던 영상 시각(같은 프레임 판별용). */
  videoTime: number;
  generation?: number;
  faces: readonly (readonly Landmark[])[];
  matrices: readonly { data: ArrayLike<number> }[];
}

export const FACE_MATCH_MS = 70;

export function createFaceBuffer(size = 12) {
  let items: FaceSample[] = [];
  return {
    push(sample: FaceSample) { items = [...items.slice(1 - size), sample]; },
    clear() { items = []; },
    /** 같은 영상 프레임의 얼굴 결과, 없으면 maxGapMs 이내에서 캡처 시각이 가장 가까운 결과. */
    match(t: number, videoTime: number, maxGapMs = FACE_MATCH_MS, generation?: number): FaceSample | null {
      const current = generation === undefined ? items : items.filter(item => item.generation === generation);
      const same = current.findLast(item => item.videoTime === videoTime);
      if (same) return same;
      let best: FaceSample | null = null;
      for (const item of current) if (Math.abs(item.t - t) <= maxGapMs && (!best || Math.abs(item.t - t) < Math.abs(best.t - t))) best = item;
      return best;
    },
  };
}
export type FaceBuffer = ReturnType<typeof createFaceBuffer>;

/** 얼굴이 여럿이면 얼굴 1번 점(코끝)이 포즈 코(0번)와 가장 가까운 얼굴을 고릅니다(정규화 좌표 거리). */
export function neckFrame(t: number, pose: readonly Landmark[] | undefined, face: FaceSample | null, imageW: number, imageH: number): NeckFrame {
  const points = pose && pose.length >= 13 ? pose.slice(0, 13).map(p => [p.x, p.y, p.z ?? 0, p.visibility ?? 0]) : null;
  let best = -1;
  if (points && face) {
    let distance = Infinity;
    face.faces.forEach((mesh, index) => {
      const d = Math.hypot(mesh[1].x - points[0][0], mesh[1].y - points[0][1]);
      if (d < distance && face.matrices[index]) { distance = d; best = index; }
    });
  }
  return {
    t, pose: points, imageW, imageH,
    face: best < 0 ? null : face!.faces[best].map(p => [p.x, p.y, p.z ?? 0]),
    fmat: best < 0 ? null : Array.from(face!.matrices[best].data),
  };
}
