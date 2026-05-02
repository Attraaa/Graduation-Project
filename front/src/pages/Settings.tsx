import { useState } from 'react';
import Button from '../components/Button';
import { Bell, Moon, User, Shield } from 'lucide-react';

const Settings = () => {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const handleSave = () => {
    alert('설정이 저장되었습니다!');
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8">
        <h1 className="text-3xl font-black text-gray-700">설정</h1>
        <p className="text-gray-500 font-bold mt-2">앱 환경 및 계정 정보를 관리하세요.</p>
      </header>

      <div className="space-y-6">
        {/* Account Section */}
        <div className="card-duo">
          <h2 className="text-xl font-black text-gray-700 mb-4 flex items-center">
            <User className="mr-2 text-[#1cb0f6]" /> 계정 정보
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-gray-500 mb-1">이름</label>
              <input type="text" defaultValue="예비군" className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-500 mb-1">이메일</label>
              <input type="email" defaultValue="user@example.com" disabled className="w-full rounded-2xl border-2 border-gray-200 bg-gray-100 px-4 py-3 font-bold text-gray-400 outline-none" />
            </div>
          </div>
        </div>

        {/* Preferences Section */}
        <div className="card-duo">
          <h2 className="text-xl font-black text-gray-700 mb-4 flex items-center">
            <Shield className="mr-2 text-[#ffc800]" /> 앱 설정
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-2">
              <div className="flex items-center">
                <Bell className="mr-3 text-gray-400" />
                <span className="font-bold text-gray-700">자세 경고 알림 (시스템 트레이)</span>
              </div>
              <button 
                onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 ${notificationsEnabled ? 'bg-[#58cc02]' : 'bg-gray-300'}`}
              >
                <div className={`w-6 h-6 rounded-full bg-white transition-transform ${notificationsEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>

            <div className="flex items-center justify-between p-2">
              <div className="flex items-center">
                <Moon className="mr-3 text-gray-400" />
                <span className="font-bold text-gray-700">다크 모드</span>
              </div>
              <button 
                onClick={() => setDarkMode(!darkMode)}
                className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 ${darkMode ? 'bg-[#1cb0f6]' : 'bg-gray-300'}`}
              >
                <div className={`w-6 h-6 rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>
        
        <div className="pt-4 flex justify-end">
          <Button onClick={handleSave} className="px-8">
            변경사항 저장
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
