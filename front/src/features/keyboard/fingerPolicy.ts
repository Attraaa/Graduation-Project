import type { FingerId, FingerPolicy, KeyFingerRule } from './types';

const keyRule = (
  preferred: FingerId | readonly FingerId[],
  acceptable: readonly FingerId[] = [],
): KeyFingerRule => ({
  preferred: typeof preferred === 'string' ? [preferred] : preferred,
  acceptable,
});

/**
 * Teaching baseline for the ANSI QWERTY letter block.
 *
 * This is a versioned coaching policy, not a medical truth. Keys with disputed
 * or context-dependent fingering stay unsupported until a separate rule is
 * approved. Korean 2-set input shares these physical KeyboardEvent.code values.
 */
export const ANSI_QWERTY_TOUCH_POLICY_V1: FingerPolicy = {
  id: 'ansi-qwerty-touch',
  version: '1.0.0',
  layout: 'ANSI QWERTY letters and space / Korean 2-set physical positions',
  keys: {
    KeyQ: keyRule('left:pinky'),
    KeyA: keyRule('left:pinky'),
    KeyZ: keyRule('left:pinky'),

    KeyW: keyRule('left:ring'),
    KeyS: keyRule('left:ring'),
    KeyX: keyRule('left:ring'),

    KeyE: keyRule('left:middle'),
    KeyD: keyRule('left:middle'),
    KeyC: keyRule('left:middle'),

    KeyR: keyRule('left:index'),
    KeyF: keyRule('left:index'),
    KeyV: keyRule('left:index'),
    KeyT: keyRule('left:index'),
    KeyG: keyRule('left:index'),
    KeyB: keyRule('left:index', ['right:index']),

    KeyY: keyRule('right:index'),
    KeyH: keyRule('right:index'),
    KeyN: keyRule('right:index'),
    KeyU: keyRule('right:index'),
    KeyJ: keyRule('right:index'),
    KeyM: keyRule('right:index'),

    KeyI: keyRule('right:middle'),
    KeyK: keyRule('right:middle'),
    Comma: keyRule('right:middle'),

    KeyO: keyRule('right:ring'),
    KeyL: keyRule('right:ring'),
    Period: keyRule('right:ring'),

    KeyP: keyRule('right:pinky'),
    Semicolon: keyRule('right:pinky'),
    Slash: keyRule('right:pinky'),

    Space: keyRule(['left:thumb', 'right:thumb']),
  },
};
