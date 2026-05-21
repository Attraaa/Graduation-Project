import type React from 'react';
import { Activity, Eye, Keyboard, Maximize } from 'lucide-react';

export type ModeId = 'turtle' | 'keyboard' | 'shoulder' | 'eye';

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
    id: 'turtle',
    title: '거북목 모드',
    shortTitle: '거북목',
    desc: '목 각도와 고개 전방 이동을 분석합니다.',
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
  {
    id: 'shoulder',
    title: '어깨 모드',
    shortTitle: '어깨',
    desc: '좌우 어깨 높이와 상체 기울기를 분석합니다.',
    color: '#ffc800',
    bgClass: 'bg-[#ffc800]',
    textClass: 'text-[#b38300]',
    borderClass: 'border-[#c69b00]',
    icon: <Maximize size={32} />,
  },
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
];

export const getLearningMode = (id?: string) =>
  learningModes.find((mode) => mode.id === id) ?? learningModes[0];
