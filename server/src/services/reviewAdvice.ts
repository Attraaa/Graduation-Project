import type { ReviewFocus } from './reviewFacts.js';

const actions: Record<ReviewFocus, readonly [string, ...string[]]> = {
  neck: [
    '화면을 오래 볼 때 턱이 앞으로 나오는지 확인하고 편한 위치로 가볍게 당겨 보세요.',
    '화면이 눈높이보다 낮은지 확인하고 목을 앞으로 내밀지 않아도 읽을 수 있게 맞춰 보세요.',
  ],
  balance: [
    '화면을 정면에 두고 고개와 양쪽 어깨선이 한쪽으로 기울었는지 확인해 보세요.',
    '작업 중 고개가 한쪽으로 기울지 않도록 정면을 보고 양 어깨를 편하게 내려 보세요.',
  ],
  shoulder: [
    '양쪽 어깨에 힘이 들어갔는지 확인하고 편하게 내려 보세요.',
    '팔을 편하게 받쳐 양쪽 어깨에 걸리는 힘을 덜어 보세요.',
  ],
  eye: ['다음에는 비슷한 화면 작업에서 깜빡임 기록을 다시 비교해 보세요.'],
  keyboard: ['속도를 낮춰 권장 손가락으로 같은 키를 눌러 보는 연습을 해 보세요.'],
};

export const reviewAdvice = (focus: ReviewFocus) => actions[focus];

/** Gemma selects a supported action. Reasons and measurements come from the plan. */
export function pickAdvice(text: string, options: readonly [string, ...string[]]) {
  const matched = options.find(option => text.includes(option));
  return { text: matched ?? options[0], source: matched ? 'model' as const : 'record' as const };
}
