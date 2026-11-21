import { KEYBOARD_ALERT_THRESHOLD, KEYBOARD_ALERT_WINDOW } from './activityPolicy.ts';
import { eyePolicy } from '../eye/eyePolicy.ts';

export interface PostureAlertPart { part: 'neck' | 'shoulder'; score: number; away: boolean }
export type IssueCode = 'upper-analysis' | 'keyboard-analysis' | 'eye-analysis' | 'tracking' | 'storage' | 'auth';
export type SystemNotificationRequest = { kind: 'test'; silent: boolean }
  | { kind: 'posture'; silent: boolean; parts: PostureAlertPart[] }
  | { kind: 'keyboard'; silent: boolean; score: number }
  | { kind: 'blink'; silent: boolean }
  | { kind: 'issue'; silent: boolean; code: IssueCode };
export interface SystemNotificationResult { ok: boolean; message: string; status?: 'shown' | 'suppressed' | 'failed' }

const issues: Record<IssueCode, { title: string; body: string; target: string }> = {
  'upper-analysis': { title: 'Moti · 상체 관찰이 중지되었습니다', body: '카메라·분석 연결을 확인한 뒤 다시 시작해 주세요.', target: '/dashboard?mode=upper_body' },
  'keyboard-analysis': { title: 'Moti · 키보드 관찰이 중지되었습니다', body: '키보드 카메라와 분석기 연결을 확인한 뒤 다시 시작해 주세요.', target: '/dashboard?mode=keyboard' },
  'eye-analysis': { title: 'Moti · 깜빡임 분석을 확인해 주세요', body: '깜빡임을 관찰하지 못하고 있습니다. 상체 화면에서 연결 상태를 확인해 주세요.', target: '/dashboard?mode=upper_body' },
  tracking: { title: 'Moti · 상체가 보이지 않습니다', body: '얼굴과 양쪽 어깨가 카메라에 보이는지 확인해 주세요.', target: '/dashboard?mode=upper_body' },
  storage: { title: 'Moti · 기록 저장을 확인해 주세요', body: '기록을 서버에 저장하지 못했습니다. 앱을 닫기 전에 저장을 재시도해 주세요.', target: '/dashboard' },
  auth: { title: 'Moti · 다시 로그인해 주세요', body: '로그인이 만료되어 요청을 처리하지 못했습니다. 로그인 상태를 확인해 주세요.', target: '/login' },
};
export function notificationTarget(input: SystemNotificationRequest) {
  return input.kind === 'issue' ? issues[input.code].target : input.kind === 'keyboard' ? '/dashboard?mode=keyboard'
    : input.kind === 'posture' || input.kind === 'blink' ? '/dashboard?mode=upper_body' : null;
}

/** Main owns all notification text; renderer input is restricted to measured values. */
export function notificationContent(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('잘못된 알림 요청입니다.');
  const value = input as Record<string, unknown>;
  if (typeof value.silent !== 'boolean') throw new Error('잘못된 알림 소리 설정입니다.');
  if (value.kind === 'test') return {
    title: 'Moti · 알림 테스트', body: 'Windows 시스템 알림이 연결되었습니다. 자세·키보드·깜빡임 안내도 이곳에 표시됩니다.', silent: value.silent,
  };
  if (value.kind === 'keyboard') {
    if (typeof value.score !== 'number' || !Number.isFinite(value.score) || value.score < 0 || value.score > KEYBOARD_ALERT_THRESHOLD) throw Error('잘못된 키보드 알림입니다.');
    return { title: 'Moti · 손가락 사용을 확인해 주세요', body: `최근 ${KEYBOARD_ALERT_WINDOW}회 유효 판정의 평균 훈련 점수가 ${Math.round(value.score)}점이에요. 권장 손가락을 확인해 주세요.`, silent: value.silent };
  }
  if (value.kind === 'blink') return {
    title: 'Moti · 편안하게 깜빡여 주세요', body: `눈을 뜬 채 유효 관찰 ${eyePolicy.openReminderMs / 1000}초 동안 깜빡임이 관찰되지 않았어요. 편안하게 눈을 깜빡여 주세요.`, silent: value.silent,
  };
  if (value.kind === 'issue') {
    if (typeof value.code !== 'string' || !Object.hasOwn(issues, value.code)) throw Error('잘못된 문제 알림입니다.');
    const { title, body } = issues[value.code as IssueCode];
    return { title, body, silent: value.silent };
  }
  if (value.kind !== 'posture' || !Array.isArray(value.parts) || value.parts.length < 1 || value.parts.length > 2) {
    throw new Error('잘못된 자세 알림입니다.');
  }
  const names = new Set<string>();
  const lines = value.parts.map((part: unknown) => {
    if (!part || typeof part !== 'object') throw new Error('잘못된 자세 알림입니다.');
    const p = part as Record<string, unknown>;
    if ((p.part !== 'neck' && p.part !== 'shoulder') || names.has(p.part) || typeof p.score !== 'number'
      || !Number.isFinite(p.score) || p.score < 0 || p.score > 100 || typeof p.away !== 'boolean') {
      throw new Error('잘못된 자세 알림입니다.');
    }
    names.add(p.part);
    return `${p.part === 'neck' ? '목' : '어깨'} ${Math.round(p.score)}점 · ${p.away ? '기준 자세에서 벗어남' : '점수 저하'}`;
  });
  return { title: 'Moti · 자세를 확인해 주세요', body: `${lines.join('\n')}\n처음 잡은 기준 자세를 확인해 주세요.`, silent: value.silent };
}
