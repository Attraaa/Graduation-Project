import type { SourceStatus } from './SourceState';

export const LOGIN_REQUIRED = '로그인하면 이 계정의 기록을 볼 수 있어요.';
export const statusOf = (query: { loading: boolean; error: string | null }): SourceStatus =>
  query.loading ? 'loading' : query.error ? 'error' : 'ready';
