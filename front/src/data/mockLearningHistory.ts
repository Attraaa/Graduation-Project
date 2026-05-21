import type { ModeId } from './modes';

export type HistorySession = {
  id: string;
  date: string;
  mode: ModeId;
  title: string;
  startedAt: string;
  duration: string;
  score: number;
  warningCount: number;
  feedback: string;
  graph: Array<{ time: string; score: number }>;
};

export const historySessions: HistorySession[] = [
  {
    id: 's-0512-1',
    date: '2026-05-12',
    mode: 'turtle',
    title: '거북목 오전 교정',
    startedAt: '09:20',
    duration: '24분',
    score: 84,
    warningCount: 3,
    feedback: '초반에는 목이 앞으로 나왔지만 후반부에는 안정적으로 회복되었습니다.',
    graph: [
      { time: '09:20', score: 76 },
      { time: '09:30', score: 82 },
      { time: '09:40', score: 88 },
    ],
  },
  {
    id: 's-0513-1',
    date: '2026-05-13',
    mode: 'keyboard',
    title: '키보드 자세 점검',
    startedAt: '14:10',
    duration: '18분',
    score: 78,
    warningCount: 5,
    feedback: '손목이 위로 꺾이는 구간이 반복되었습니다. 키보드 높이를 낮춰보세요.',
    graph: [
      { time: '14:10', score: 81 },
      { time: '14:18', score: 75 },
      { time: '14:28', score: 78 },
    ],
  },
  {
    id: 's-0513-2',
    date: '2026-05-13',
    mode: 'shoulder',
    title: '어깨 균형 교정',
    startedAt: '16:40',
    duration: '20분',
    score: 72,
    warningCount: 7,
    feedback: '오른쪽 어깨가 상대적으로 높게 유지되었습니다. 의자 팔걸이 높이를 확인하세요.',
    graph: [
      { time: '16:40', score: 70 },
      { time: '16:50', score: 73 },
      { time: '17:00', score: 74 },
    ],
  },
  {
    id: 's-0514-1',
    date: '2026-05-14',
    mode: 'turtle',
    title: '거북목 오후 교정',
    startedAt: '15:00',
    duration: '32분',
    score: 69,
    warningCount: 9,
    feedback: '오후 피로 누적으로 고개 전방 이동이 잦았습니다. 모니터 상단을 눈높이에 맞춰보세요.',
    graph: [
      { time: '15:00', score: 78 },
      { time: '15:15', score: 68 },
      { time: '15:30', score: 61 },
    ],
  },
  {
    id: 's-0514-2',
    date: '2026-05-14',
    mode: 'eye',
    title: '안구 피로 점검',
    startedAt: '18:20',
    duration: '15분',
    score: 74,
    warningCount: 4,
    feedback: '눈 깜빡임 간격이 길어지는 구간이 있었습니다. 20분마다 먼 곳을 바라보는 휴식을 권장합니다.',
    graph: [
      { time: '18:20', score: 80 },
      { time: '18:27', score: 72 },
      { time: '18:35', score: 70 },
    ],
  },
  {
    id: 's-0515-1',
    date: '2026-05-15',
    mode: 'keyboard',
    title: '키보드 손목 교정',
    startedAt: '10:10',
    duration: '21분',
    score: 88,
    warningCount: 2,
    feedback: '손목 중립 자세가 안정적으로 유지되었습니다. 현재 키보드 위치가 적절합니다.',
    graph: [
      { time: '10:10', score: 84 },
      { time: '10:20', score: 89 },
      { time: '10:30', score: 91 },
    ],
  },
];

export const getSessionsByDate = (date: string) =>
  historySessions.filter((session) => session.date === date);
