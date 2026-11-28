import type { ReviewInput } from './aiReview.js';
import type { PostureMetric } from './reviewFacts.js';

interface Advice { text: string; topic: RegExp }
const posture: Record<PostureMetric, Advice> = {
  neck: { text: '화면을 오래 볼 때 중간에 턱이 앞으로 나왔는지 확인하고 가볍게 당겨 보세요.', topic: /목|턱|머리/ },
  balance: { text: '화면을 오래 볼 때 중간에 체중이 한쪽으로 쏠렸는지 확인하고 앉은 자세를 바로잡아 보세요.', topic: /균형|체중|한쪽/ },
  shoulder: { text: '화면을 오래 볼 때 중간에 양쪽 어깨의 힘을 빼고 자세를 확인해 보세요.', topic: /어깨/ },
};
const eye: Advice = { text: '화면에서 잠시 시선을 떼고 눈을 편하게 깜빡여 보세요.', topic: /눈|깜빡|시선/ };
const keyboard: Advice = { text: '다음 타자 연습은 속도를 낮추고 손가락을 기본 자리에 놓고 시작해 보세요.', topic: /손가락|타자|키보드/ };

export function reviewAdvice(input: ReviewInput, focus: PostureMetric | null): Advice[] {
  if (focus) return [posture[focus]];
  const scores = (input.posture?.scores ?? []).slice().sort((a, b) => a.mean - b.mean);
  const options = scores.map(score => posture[score.metric]);
  if (input.eye) options.push(eye);
  if (input.keyboard) options.push(keyboard);
  return options;
}

// The factual part of the review is set by the records. Keep only the model's matching habit suggestion.
export function pickAdvice(text: string, options: Advice[]) {
  const sentences = text.split(/(?<=[.!?。])\s*|\n+/u).map(s => s.trim()).filter(Boolean);
  const found = sentences.find(s => s.length <= 180 && !/[0-9%~]|점수|평균|감소|증가|분당|도수|진단|질환|치료|통증|질병|증후군|디스크|거북목|예방/u.test(s)
    && /(?:보세요|주세요|해봐요|해 보아요|좋겠어요|해도 좋아요|해 보시는 게 좋아요)[.!。]?$/u.test(s)
    && options.some(option => option.topic.test(s)));
  return { text: found ?? options[0].text, source: found ? 'model' as const : 'record' as const };
}
