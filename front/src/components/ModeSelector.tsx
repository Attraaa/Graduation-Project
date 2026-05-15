import { Activity, Keyboard, Eye, Maximize, Play, Square } from 'lucide-react';
import PostureMonitor from './PostureMonitor';

interface ModeSelectorProps {
  activeMode: string | null;
  onModeToggle: (id: string) => void;
}

const modes = [
  {
    id: 'turtle',
    title: '거북목 모드',
    desc: '얼굴-어깨 각도를 측정하여 거북목 자세를 예방합니다.',
    icon: <Activity size={32} />,
    color: 'bg-[#58cc02]',
    borderColor: 'border-[#46a302]',
    textColor: 'text-[#58cc02]'
  },
  {
    id: 'wrist',
    title: '손목 모드',
    desc: '타이핑 시 손목-팔꿈치 각도를 분석합니다.',
    icon: <Keyboard size={32} />,
    color: 'bg-[#1cb0f6]',
    borderColor: 'border-[#1899d6]',
    textColor: 'text-[#1cb0f6]'
  },
  {
    id: 'shoulder',
    title: '어깨 비대칭 모드',
    desc: '좌우 어깨 높이를 측정하여 비대칭을 교정합니다.',
    icon: <Maximize size={32} />,
    color: 'bg-[#ffc800]',
    borderColor: 'border-[#c69b00]',
    textColor: 'text-[#ffc800]'
  },
  {
    id: 'eye',
    title: '안구 모드',
    desc: '눈 깜박임과 모니터 거리를 측정하여 안구 건조를 예방합니다.',
    icon: <Eye size={32} />,
    color: 'bg-[#ff4b4b]',
    borderColor: 'border-[#ea2b2b]',
    textColor: 'text-[#ff4b4b]'
  }
];

const ModeSelector = ({ activeMode, onModeToggle }: ModeSelectorProps) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {modes.map((mode) => {
        const isActive = activeMode === mode.id;
        return (
          <div 
            key={mode.id}
            className={`relative overflow-hidden rounded-3xl border-2 transition-all duration-300 ${isActive ? `border-gray-200 bg-white ring-4 ring-offset-2 ring-[${mode.borderColor.replace('border-[', '').replace(']', '')}]` : 'border-gray-200 bg-white hover:-translate-y-1 hover:shadow-md'}`}
            style={{ borderBottomWidth: '4px' }}
          >
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${mode.color} text-white shadow-sm`} style={{ borderBottom: `4px solid ${mode.borderColor.replace('border-', '')}` }}>
                  {mode.icon}
                </div>
                <div>
                  {isActive ? (
                    <button onClick={() => onModeToggle(mode.id)} className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-500 hover:bg-red-200 transition">
                      <Square size={20} fill="currentColor" />
                    </button>
                  ) : (
                    <button onClick={() => onModeToggle(mode.id)} className={`flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 ${mode.textColor} hover:bg-gray-200 transition`}>
                      <Play size={20} fill="currentColor" className="ml-1" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-4">
                <h2 className="text-xl font-black text-gray-700">{mode.title}</h2>
                <p className="mt-2 font-bold text-gray-500">{mode.desc}</p>
              </div>
            </div>
            
            {isActive && (
              <PostureMonitor mode={mode.id} />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ModeSelector;
