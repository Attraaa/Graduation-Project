export type MonitoringMode = 'upper_body' | 'keyboard';

export const modeName = (mode: MonitoringMode) => mode === 'upper_body' ? '상체' : '키보드';
export const otherMode = (mode: MonitoringMode): MonitoringMode => mode === 'upper_body' ? 'keyboard' : 'upper_body';
export const statisticsTarget = (mode: MonitoringMode) => `/statistics?mode=${mode === 'upper_body' ? 'upper' : 'keyboard'}`;
