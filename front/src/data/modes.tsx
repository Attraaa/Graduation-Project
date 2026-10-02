import type React from 'react';
import { Activity, Eye, Keyboard } from 'lucide-react';

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
    id: 'eye',
    title: '안구 모드',
    shortTitle: '안구',
    desc: '눈 깜빡임과 화면 거리 상태를 분석합니다.',
    color: '#ff4b4b',
    bgClass: 'bg-[#ff4b4b]',
    textClass: 'text-[#ff4b4b]',
    borderClass: 'border-[#ea2b2b]',
    icon: <Eye size={32} />,
  },
  {
    id: 'upper_body',
    title: '상체 자세 모니터링',
    shortTitle: '상체',
    desc: '목과 어깨를 함께 관찰하고 각각의 점수를 확인합니다.',
    color: '#58cc02',
    bgClass: 'bg-[#58cc02]',
    textClass: 'text-[#58cc02]',
    borderClass: 'border-[#46a302]',
    icon: <Activity size={32} />,
  },
  {
    id: 'keyboard',
    title: '키보드 모드',
    shortTitle: '키보드',
    desc: '손목과 팔 위치, 키보드 사용 자세를 분석합니다.',
    color: '#1cb0f6',
    bgClass: 'bg-[#1cb0f6]',
    textClass: 'text-[#1cb0f6]',
    borderClass: 'border-[#1899d6]',
    icon: <Keyboard size={32} />,
  },
];

export const getLearningMode = (id?: string) =>
  learningModes.find((mode) => mode.id === id) ?? learningModes[1];
