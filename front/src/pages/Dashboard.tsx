import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import ModeSelector from '../components/ModeSelector';

const Dashboard = () => {
  const [activeMode, setActiveMode] = useState<string | null>(null);

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

      <ModeSelector activeMode={activeMode} onModeToggle={handleModeToggle} />
    </div>
  );
};

export default Dashboard;
