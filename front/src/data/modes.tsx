import type React from 'react';
import { Activity, Keyboard } from 'lucide-react';

type LearningMode = {
  id: 'upper_body' | 'keyboard';
  title: string;
  icon: React.ReactNode;
};

const learningModes: LearningMode[] = [
  {
    id: 'upper_body',
    title: '상체 모니터링',
    icon: <Activity size={32} />,
  },
  {
    id: 'keyboard',
    title: '키보드 모니터링',
    icon: <Keyboard size={32} />,
  },
];

export const getLearningMode = (id?: string) =>
  learningModes.find((mode) => mode.id === id) ?? learningModes[0];
