import type { EyeSensitivity } from '../eye/eyePolicy.ts';
import { normalizePostureSensitivity } from '../posture/evaluation.ts';

type Store = Pick<Storage, 'getItem' | 'setItem'>;
// New key on purpose: the old `postureAI.collapseSensitivity` value was never applied to a measurement,
// so whatever was stored there must not silently change the rule of the next session.
const POSTURE_KEY = 'moti.settings.postureSensitivity';
const EYE_KEY = 'moti.settings.eyeSensitivity';
const EYE_SENSITIVITIES: readonly EyeSensitivity[] = ['low', 'normal', 'high'];

/** Sensitivities chosen in Settings. Each measurement mode reads its own value when a session starts. */
export function readPostureSensitivity(store: Store = localStorage) {
  try { return normalizePostureSensitivity(store.getItem(POSTURE_KEY)); }
  catch { return normalizePostureSensitivity(null); }
}
export function writePostureSensitivity(value: number, store: Store = localStorage) {
  store.setItem(POSTURE_KEY, String(normalizePostureSensitivity(value)));
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
