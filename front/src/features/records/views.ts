import { localDateKey } from '../../../../database/contracts.ts';

export function todayDateKey() { return localDateKey(Date.now(), new Date().getTimezoneOffset()); }
