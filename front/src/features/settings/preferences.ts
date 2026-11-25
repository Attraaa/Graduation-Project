import type { EyeSensitivity } from '../eye/eyePolicy.ts';
import { normalizeBalanceSensitivity } from '../posture/modes/balance.ts';
import { BASE_CVA } from '../posture/modes/turtle.ts';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
// New key on purpose: neither the old `postureAI.collapseSensitivity` nor the removed posture-collapse slider
// (`moti.settings.postureSensitivity`, deviation counting until 2026-11-25) means a tilt sensitivity,
// so whatever was stored there must not silently change the balance score of the next session.
const BALANCE_KEY = 'moti.settings.balanceSensitivity';
const EYE_KEY = 'moti.settings.eyeSensitivity';
const BASE_CVA_KEY = 'moti.settings.baseCva';
const EYE_SENSITIVITIES: readonly EyeSensitivity[] = ['low', 'normal', 'high'];

/** Sensitivities chosen in Settings. Each measurement mode reads its own value when a session starts. */
export function readBalanceSensitivity(store: Store = localStorage) {
  try { return normalizeBalanceSensitivity(store.getItem(BALANCE_KEY)); }
  catch { return normalizeBalanceSensitivity(null); }
}
export function writeBalanceSensitivity(value: number, store: Store = localStorage) {
  store.setItem(BALANCE_KEY, String(normalizeBalanceSensitivity(value)));
}
export function readEyeSensitivity(store: Store = localStorage): EyeSensitivity {
  try {
    const value = store.getItem(EYE_KEY);
    return EYE_SENSITIVITIES.find(item => item === value) ?? 'normal';
  } catch { return 'normal'; }
}
export function writeEyeSensitivity(value: EyeSensitivity, store: Store = localStorage) {
  store.setItem(EYE_KEY, value);
}

/** 화면 추정 CVA의 기준값(°, 40–60의 정수, 기본 50). 표시에만 쓰며 바꾸면 바로 반영되고 저장된 점수는 바뀌지 않습니다. */
export function normalizeBaseCva(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.min(BASE_CVA.max, Math.max(BASE_CVA.min, Math.round(number))) : BASE_CVA.default;
}
export function readBaseCva(store?: Store) {
  try { return normalizeBaseCva((store ?? localStorage).getItem(BASE_CVA_KEY)); }
  catch { return BASE_CVA.default; }
}
export function writeBaseCva(value: number, store: Store = localStorage) {
  store.setItem(BASE_CVA_KEY, String(normalizeBaseCva(value)));
}
