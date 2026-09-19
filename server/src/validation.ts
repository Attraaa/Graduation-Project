import { HttpError } from './http.js';

export function bodyObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'JSON 객체가 필요합니다.');
  }
  return value as Record<string, unknown>;
}

export function text(value: unknown, name: string, maxLength: number, trim = true): string {
  if (typeof value !== 'string') throw new HttpError(400, `${name}을(를) 입력해 주세요.`);
  const result = trim ? value.trim() : value;
  if (!result.length || result.length > maxLength) {
    throw new HttpError(400, `${name}은(는) 1~${maxLength}자여야 합니다.`);
  }
  return result;
}

export function password(value: unknown, name = '비밀번호'): string {
  const result = text(value, name, 72, false);
  // bcrypt ignores bytes after 72; reject those inputs instead of silently truncating them.
  if (Buffer.byteLength(result, 'utf8') > 72) throw new HttpError(400, `${name}은(는) UTF-8 기준 72바이트 이하여야 합니다.`);
  return result;
}

export function integer(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(400, `${name}은(는) ${min}~${max} 사이의 정수여야 합니다.`);
  }
  return value;
}

export function numericParam(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new HttpError(400, `${name} 형식이 올바르지 않습니다.`);
  return integer(Number(value), name, min, max);
}

export function sessionId(value: unknown): number {
  return numericParam(value, '세션 ID', 1, 2147483647);
}

export function dateParam(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, '날짜 형식은 YYYY-MM-DD입니다.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '1000-01-01') {
    throw new HttpError(400, '유효한 날짜가 필요합니다.');
  }
  return value;
}

/** FLOAT 컬럼이 저장할 수 있는 최대 크기. 측정값의 상한이지 점수 범위가 아닙니다. */
export const FLOAT_MAX = 3.402823466e38;

export function decimal(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, `${name}은(는) ${min}~${max} 사이의 유한한 수여야 합니다.`);
  }
  return value;
}

export function choice<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new HttpError(400, `${name}은(는) ${allowed.join(', ')} 중 하나여야 합니다.`);
  }
  return value as T;
}

export function list(value: unknown, name: string, maxLength: number): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > maxLength) {
    throw new HttpError(400, `${name}은(는) 1~${maxLength}개의 항목이어야 합니다.`);
  }
  return value;
}

/** 보내지 않은 값과 null을 같게 다룹니다. 빈 값을 기본값으로 채우지 않기 위한 경계입니다. */
export function optional<T>(value: unknown, read: (value: unknown) => T): T | null {
  return value === undefined || value === null ? null : read(value);
}

/**
 * 사용자 설정 JSON. 서버는 항목 이름을 해석하지 않고 크기와 모양만 제한합니다.
 * 화면이 설정을 추가할 때 서버를 고치지 않아도 되지만, 무한히 커지지도 않습니다.
 */
export function settingsObject(value: unknown): Record<string, unknown> {
  const input = bodyObject(value);
  const entries = Object.entries(input);
  if (entries.length > 50) throw new HttpError(400, '설정 항목은 50개 이하여야 합니다.');
  for (const [key, item] of entries) {
    if (key.length > 64) throw new HttpError(400, '설정 이름은 64자 이하여야 합니다.');
    const allowed = item === null || typeof item === 'boolean'
      || (typeof item === 'string' && item.length <= 256)
      || (typeof item === 'number' && Number.isFinite(item));
    if (!allowed) throw new HttpError(400, `설정 ${key}의 값은 문자열, 숫자, 참/거짓, null만 가능합니다.`);
  }
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 4096) {
    throw new HttpError(400, '설정 전체 크기는 4KB 이하여야 합니다.');
  }
  return input;
}
