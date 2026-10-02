import type { FingerId } from './types';
import type { KeyboardContext } from '../../../../database/keyboard';
export const fingerText: Record<FingerId, string> = {
  'left:thumb': '왼손 엄지', 'left:index': '왼손 검지', 'left:middle': '왼손 중지', 'left:ring': '왼손 약지', 'left:pinky': '왼손 새끼',
  'right:thumb': '오른손 엄지', 'right:index': '오른손 검지', 'right:middle': '오른손 중지', 'right:ring': '오른손 약지', 'right:pinky': '오른손 새끼',
};
export const contextText: Record<KeyboardContext, string> = { plain: '일반 입력', 'shift-left': '왼쪽 Shift', 'shift-right': '오른쪽 Shift', 'shift-both': '양쪽 Shift', shortcut: '단축키' };
export const statusText = { running: '관찰 중', finished: '종료', interrupted: '중단' };
export const reasonText: Record<string, string> = {
  'preferred-finger': '기본표 일치', 'acceptable-alternative': '허용 대안', 'neighboring-finger': '같은 손의 인접 손가락',
  'different-finger': '다른 손가락', 'unsupported-key': '정책 미지원 키', shortcut: '단축키 제외',
  'low-keyboard-confidence': '키보드 위치 불확실', 'invalid-frame-timing': '프레임 시간 차이 초과',
  'no-reliable-candidate': '손끝 관측 부족', 'candidate-too-far': '손끝이 키에서 멂', 'ambiguous-candidates': '후보 구분 어려움',
};
export const percentText = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;
export const scoreText = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}점`;
