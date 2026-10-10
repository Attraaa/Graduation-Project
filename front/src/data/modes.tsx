import type React from 'react';
import { Activity, Keyboard } from 'lucide-react';

export type ModeId = 'upper_body' | 'keyboard' | 'eye';

export type LearningMode = {
  id: ModeId;
  title: string;
  shortTitle: string;
  desc: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  icon: React.ReactNode;
};

export const learningModes: LearningMode[] = [
  {
    id: 'upper_body',
    title: '상체 모니터링',
    shortTitle: '상체',
    desc: '목·어깨 점수와 분당 깜빡임을 함께 확인합니다.',
    color: '#58cc02',
    bgClass: 'bg-[#58cc02]',
    textClass: 'text-[#58cc02]',
    borderClass: 'border-[#46a302]',
    icon: <Activity size={32} />,
  },
  {
    id: 'keyboard',
    title: '키보드 모니터링',
    shortTitle: '키보드',
    desc: '카메라로 손가락 사용과 입력별 판정을 관찰합니다.',
    color: '#1cb0f6',
    bgClass: 'bg-[#1cb0f6]',
    textClass: 'text-[#1cb0f6]',
    borderClass: 'border-[#1899d6]',
    icon: <Keyboard size={32} />,
  },
];

export const getLearningMode = (id?: string) =>
  learningModes.find((mode) => mode.id === id) ?? learningModes[0];
