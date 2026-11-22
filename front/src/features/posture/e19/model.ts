/**
 * [역할: 거북목 모델 E19(20261117_ensemble_v1) 실행과 5초 기준 보정]
 * 연구 런타임 fhp-infer.mjs의 FhpEnsembleModel 중 E19가 쓰는 부분만 옮겼습니다(몸통 게이트·SynthPose·이미지 분기 없음).
 * 숫자(가시성 0.5, 고개 35°, 80 %, 3°, 12°, 40°, 150 %)는 모두 패키지 config.json에서 읽습니다.
 * ONNX Runtime은 밖에서 받습니다(앱: load.ts, 테스트: 가짜 런타임). 카메라·시간 필터·표시는 이 파일 밖에서 합니다.
 */

/** 한 프레임 입력: 레거시 Pose 0–12번 [x, y, z, visibility], 얼굴 478점 [x, y, z], 머리 행렬(열 우선 4×4). */
export interface NeckFrame {
  t: number;
  pose: readonly (readonly number[])[] | null;
  face: readonly (readonly number[])[] | null;
  fmat: readonly number[] | null;
  imageW: number;
  imageH: number;
}
export type NeckReason = 'no_pose' | 'low_visibility' | 'head_turned' | 'uncalibrated';
export type NeckFailure = 'too_few_frames' | 'unstable' | 'not_upright';
export type NeckResult = { measuring: false; reason: NeckReason } | {
  measuring: true; reason: null;
  /** 보정 오프셋을 빼기 전 값(보정 계산용). */
  raw: { delta: number; load: number; psi: number };
  /** 목 전진: 보정 자세보다 줄어든 목 각도(°). */
  deltaDeg: number;
  /** 목 부하: 머리 무게중심이 C7보다 앞으로 나간 거리가 보정 자세보다 늘어난 비율(%). */
  loadPct: number;
  psiRelDeg: number;
  scoreNeck: number;
  scoreLoad: number;
  faceUsed: boolean;
  yawDeg: number | null;
};
export type NeckCalibration = { ok: true; offsetDeg: number; offsetLoadPct: number; psiOffsetDeg: number; clipped: boolean }
  | { ok: false; reason: NeckFailure };

/** config.json 중 이 런타임이 쓰는 값. */
export interface NeckModelConfig {
  delta_ref_deg: number;
  load_ref_pct: number;
  qc: { min_visibility: number; max_face_pose_link: number; max_abs_yaw_deg: number };
  calibration: { window_sec: number; min_valid_frac: number; max_sd_deg: number; max_abs_offset_frac: number; max_abs_psi_deg: number };
}
export interface TensorFactory { Tensor: new (type: 'float32', data: Float32Array, dims: readonly number[]) => unknown }
export interface ModelSession { run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown }>> }

// 코·눈·귀·어깨(포즈 0, 2, 5, 7, 8, 11, 12)가 모두 보여야 측정합니다.
const REQUIRED = [0, 2, 5, 7, 8, 11, 12];
const FACE_SIZE = 478 * 3;
type Arrays = { pose: Float32Array; face: Float32Array; fmat: Float32Array };
type Reference = Arrays & { scale: Float32Array };

const median = (values: ArrayLike<number>) => {
  const sorted = Float64Array.from(values).sort(), n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};
function medianStack(arrays: Float32Array[]) {
  const n = arrays.length, size = arrays[0].length, out = new Float32Array(size), column = new Float64Array(n);
  for (let j = 0; j < size; j++) { for (let i = 0; i < n; i++) column[i] = arrays[i][j]; out[j] = median(column); }
  return out;
}
const clip01 = (value: number) => Math.min(1, Math.max(0, value));
// Every E19 output is a float32 tensor.
const values = (outputs: Record<string, { data: unknown }>, name: string) => outputs[name].data as ArrayLike<number>;

export function createNeckModel(ort: TensorFactory, session: ModelSession, cfg: NeckModelConfig) {
  let reference: Reference | null = null;
  let offset: { delta: number; load: number; psi: number } | null = null;

  const qc = (pose: NeckFrame['pose']): NeckReason | null => {
    if (!pose || pose.length !== 13) return 'no_pose';
    return REQUIRED.some(i => (pose[i][3] ?? 0) < cfg.qc.min_visibility) ? 'low_visibility' : null;
  };
  // 얼굴 1번 점(코끝)이 포즈 코와 어깨 너비의 절반 넘게 떨어지면 다른 사람 얼굴로 보고 쓰지 않습니다.
  const faceBelongs = (x: NeckFrame) => {
    const P = x.pose!, F = x.face!, W = x.imageW, H = x.imageH;
    const shoulders = Math.hypot((P[11][0] - P[12][0]) * W, (P[11][1] - P[12][1]) * H);
    return Math.hypot((F[1][0] - P[0][0]) * W, (F[1][1] - P[0][1]) * H) / Math.max(shoulders, 1e-6) <= cfg.qc.max_face_pose_link;
  };
  const arrays = (x: NeckFrame, faceOk: boolean): Arrays => ({
    pose: Float32Array.from(x.pose!.flat()),
    face: faceOk ? Float32Array.from(x.face!.flat()) : new Float32Array(FACE_SIZE),
    fmat: faceOk ? Float32Array.from(x.fmat!) : new Float32Array(16),
  });
  const feeds = (g: Arrays, x: NeckFrame, faceOk: boolean, ref: Reference) => {
    const T = ort.Tensor;
    return {
      pose: new T('float32', g.pose, [1, 13, 4]), face: new T('float32', g.face, [1, 478, 3]), fmat: new T('float32', g.fmat, [1, 16]),
      wh: new T('float32', Float32Array.from([x.imageW, x.imageH]), [1, 2]), face_ok: new T('float32', Float32Array.from([faceOk ? 1 : 0]), [1]),
      ref_scale: new T('float32', ref.scale, [1, 3]), ref_pose: new T('float32', ref.pose, [1, 13, 4]),
      ref_face: new T('float32', ref.face, [1, 478, 3]), ref_fmat: new T('float32', ref.fmat, [1, 16]),
    };
  };

  async function infer(x: NeckFrame): Promise<NeckResult> {
    const reason = qc(x.pose);
    if (reason) return { measuring: false, reason };
    if (!reference) return { measuring: false, reason: 'uncalibrated' };
    const faceOk = !!(x.face && x.fmat) && faceBelongs(x);
    const o = await session.run(feeds(arrays(x, faceOk), x, faceOk, reference));
    let delta = values(o, 'delta_deg')[0], load = values(o, 'load_pct')[0], psi = values(o, 'psi_deg')[0];
    let yawDeg: number | null = null;
    if (faceOk) {
      const f = x.fmat!; // column-major: R(r, c) = f[4c + r]
      yawDeg = Math.atan2(-f[2], Math.hypot(f[6], f[10])) * 180 / Math.PI;
      if (Math.abs(yawDeg) > cfg.qc.max_abs_yaw_deg) return { measuring: false, reason: 'head_turned' };
    }
    const raw = { delta, load, psi };
    if (offset) { delta -= offset.delta; load -= offset.load; psi -= offset.psi; }
    return { measuring: true, reason: null, raw, deltaDeg: delta, loadPct: load, psiRelDeg: psi,
      scoreNeck: 100 * clip01(delta / cfg.delta_ref_deg), scoreLoad: 100 * clip01(load / cfg.load_ref_pct), faceUsed: faceOk, yawDeg };
  }

  function clear() { reference = null; offset = null; }

  /**
   * 5초 동안 모은 프레임으로 보정합니다. 크기 단서 중앙값 + 원소별 중앙값 랜드마크를 기준으로 삼고,
   * 같은 프레임의 목 Δ·부하·고개 각도 중앙값을 오프셋으로 뺍니다(곱하는 보정은 없음).
   */
  async function calibrate(frames: readonly NeckFrame[]): Promise<NeckCalibration> {
    clear();
    const c = cfg.calibration;
    const fail = (why: NeckFailure): NeckCalibration => { clear(); return { ok: false, reason: why }; };
    const good = frames.filter(x => !qc(x.pose) && x.face && x.fmat && faceBelongs(x));
    if (!frames.length || good.length / frames.length < c.min_valid_frac) return fail('too_few_frames');
    const one = Float32Array.from([1, 1, 1]), scales: Float32Array[] = [], kept: Arrays[] = [];
    for (const x of good) {
      const g = arrays(x, true);
      const o = await session.run(feeds(g, x, true, { scale: one, ...g }));
      scales.push(Float32Array.from(values(o, 'scale'))); kept.push(g);
    }
    reference = { scale: medianStack(scales), pose: medianStack(kept.map(g => g.pose)), face: medianStack(kept.map(g => g.face)), fmat: medianStack(kept.map(g => g.fmat)) };
    const results: NeckResult[] = [];
    for (const x of frames) results.push(await infer(x));
    const valid = results.filter(r => r.measuring);
    if (valid.length / results.length < c.min_valid_frac) return fail('too_few_frames');
    const d = valid.map(r => r.raw.delta), l = valid.map(r => r.raw.load), p = valid.map(r => r.raw.psi);
    const mean = d.reduce((a, b) => a + b, 0) / d.length;
    if (Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length) > c.max_sd_deg) return fail('unstable');
    if (Math.abs(median(p)) > c.max_abs_psi_deg) return fail('not_upright');
    const limitD = c.max_abs_offset_frac * cfg.delta_ref_deg, limitL = c.max_abs_offset_frac * cfg.load_ref_pct;
    const od = median(d), ol = median(l);
    const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
    offset = { delta: clamp(od, limitD), load: clamp(ol, limitL), psi: median(p) };
    return { ok: true, offsetDeg: offset.delta, offsetLoadPct: offset.load, psiOffsetDeg: offset.psi, clipped: Math.abs(od) > limitD || Math.abs(ol) > limitL };
  }

  return { infer, calibrate, clear, config: cfg, calibrated: () => offset !== null };
}
export type NeckModel = ReturnType<typeof createNeckModel>;
