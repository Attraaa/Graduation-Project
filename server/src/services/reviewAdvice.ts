import type { ReviewInput } from './aiReview.js';

interface Advice { text: string; topic: RegExp }
const neck: Advice = { text: '화면을 볼 때 턱이 앞으로 나오는지 가끔 확인해 보세요.', topic: /목|턱|머리/ };
const shoulder: Advice = { text: '화면을 정면에 두고 양쪽 어깨에 힘을 빼 보세요.', topic: /어깨|균형/ };
const eye: Advice = { text: '화면에서 잠시 시선을 떼고 눈을 편하게 깜빡여 보세요.', topic: /눈|깜빡|시선/ };
const keyboard: Advice = { text: '다음 타자 연습은 속도를 낮추고 손가락을 기본 자리에 놓고 시작해 보세요.', topic: /손가락|타자|키보드/ };

export function reviewAdvice(input: ReviewInput): Advice[] {
  const n = input.localPosture?.neck.current ?? input.upper?.neck.current;
  const s = input.localPosture?.side.current ?? input.upper?.balance.current;
  const options: Advice[] = [];
  if (n != null && s != null) options.push(...(n <= s ? [neck, shoulder] : [shoulder, neck]));
  else if (n != null) options.push(neck);
  else if (s != null) options.push(shoulder);
  if (input.eye) options.push(eye);
  if (input.keyboard) options.push(keyboard);
  if (!options.length) options.push({ text: '다음 측정 전에 카메라에 얼굴과 양쪽 어깨가 보이는지 확인해 보세요.', topic: /카메라|얼굴|어깨/ });
  return options;
}

/** Keep the model's actionable sentence. The app itself renders every measurement and change in units. */
export function pickAdvice(text: string, options: Advice[]) {
  const sentences = text.split(/(?<=[.!?。])\s*|\n+/u).map(s => s.trim()).filter(Boolean);
  const found = sentences.find(s => s.length <= 180 && !/[0-9%~]|점수|평균|감소|증가|분당|도수|진단|질환|치료|통증|질병|증후군|디스크|거북목|예방/u.test(s)
    && /(?:보세요|주세요|해봐요|해 보아요|좋겠어요|해도 좋아요|해 보시는 게 좋아요)[.!。]?$/u.test(s)
    && options.some(option => option.topic.test(s)));
  return { text: found ?? options[0].text, source: found ? 'model' as const : 'record' as const };
}
