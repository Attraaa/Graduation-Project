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
