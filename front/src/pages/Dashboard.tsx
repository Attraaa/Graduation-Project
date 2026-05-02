import { useState, useEffect } from 'react';
import { Activity, Keyboard, Eye, Maximize, Play, Square, AlertCircle, Camera } from 'lucide-react';

const Dashboard = () => {
  const [activeMode, setActiveMode] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (activeMode) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [activeMode]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

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

  const handleModeToggle = (id: string) => {
    if (activeMode === id) {
      setActiveMode(null);
    } else {
      setActiveMode(id);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-700">무엇을 모니터링 할까요?</h1>
          <p className="text-gray-500 font-bold mt-2">원하는 모드를 선택하고 백그라운드 모니터링을 시작하세요.</p>
        </div>
      </header>

      {/* Info Card */}
      <div className="card-duo flex items-start p-6 bg-blue-50 border-blue-200">
        <div className="mr-4 mt-1 text-blue-500">
          <AlertCircle size={24} />
        </div>
        <div>
          <h3 className="font-bold text-gray-700 text-lg">VDT 증후군 환자 수 급증!</h3>
          <p className="text-gray-600 font-medium mt-1">
            2024년 VDT 증후군 환자 수는 <strong>705만 명</strong>으로 5년간 12.2% 증가했습니다. 특히 10대 환자가 급증하고 있습니다. (출처: 건강보험심사평가원)
          </p>
        </div>
      </div>

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
                      <button onClick={() => handleModeToggle(mode.id)} className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-500 hover:bg-red-200 transition">
                        <Square size={20} fill="currentColor" />
                      </button>
                    ) : (
                      <button onClick={() => handleModeToggle(mode.id)} className={`flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 ${mode.textColor} hover:bg-gray-200 transition`}>
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
                <div className="bg-gray-50 px-6 py-4 border-t-2 border-gray-100 flex items-center justify-between">
                  <div className="flex items-center text-sm font-bold text-[#58cc02]">
                    <div className="relative flex h-3 w-3 mr-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#58cc02] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-[#58cc02]"></span>
                    </div>
                    <Camera size={16} className="mr-1 animate-pulse" /> AI 카메라 분석 중...
                  </div>
                  <div className="text-[#58cc02] font-black font-mono text-lg">
                    {formatTime(elapsedTime)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Dashboard;
