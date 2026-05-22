import { useState } from 'react';
import Button from '../components/Button';
import { Bell, Moon, User, Shield, SlidersHorizontal, Trash2 } from 'lucide-react';
import { changePassword, clearStatistics, getCurrentUser, updateCurrentUser } from '../utils/authStore';
import { useDialog } from '../components/AppDialog';

const Settings = () => {
  const { notify, confirm } = useDialog();
  const currentUser = getCurrentUser();
  const [notificationsEnabled, setNotificationsEnabled] = useState(localStorage.getItem('postureAI.notifications') !== 'off');
  const [darkMode, setDarkMode] = useState(localStorage.getItem('postureAI.theme') === 'dark');
  const [nickname, setNickname] = useState(currentUser?.nickname ?? '예비 사용자');
  const [accountPassword, setAccountPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [alertFrequency, setAlertFrequency] = useState(localStorage.getItem('postureAI.alertFrequency') ?? '10');
  const [alertStrength, setAlertStrength] = useState(localStorage.getItem('postureAI.alertStrength') ?? 'normal');
  const [scoreThreshold, setScoreThreshold] = useState(Number(localStorage.getItem('postureAI.scoreThreshold') ?? 70));
  const [collapseSensitivity, setCollapseSensitivity] = useState(Number(localStorage.getItem('postureAI.collapseSensitivity') ?? 50));

  const handleSave = async () => {
    localStorage.setItem('postureAI.notifications', notificationsEnabled ? 'on' : 'off');
    localStorage.setItem('postureAI.alertFrequency', alertFrequency);
    localStorage.setItem('postureAI.alertStrength', alertStrength);
    localStorage.setItem('postureAI.scoreThreshold', String(scoreThreshold));
    localStorage.setItem('postureAI.collapseSensitivity', String(collapseSensitivity));
    await notify({ title: '저장 완료', message: '설정이 저장되었습니다.', tone: 'success' });
  };

  const handleThemeToggle = () => {
    setDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem('postureAI.theme', next ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark-theme', next);
      return next;
    });
  };

  const handleAccountSave = async () => {
    const result = updateCurrentUser(nickname, accountPassword);
    await notify({ title: result.ok ? '변경 완료' : '변경 실패', message: result.message, tone: result.ok ? 'success' : 'warning' });
    if (result.ok) setAccountPassword('');
  };

  const handlePasswordChange = async () => {
    if (!nextPassword || nextPassword.length < 6) {
      await notify({ title: '비밀번호 확인', message: '새 비밀번호는 6자 이상 입력해 주세요.', tone: 'warning' });
      return;
    }
    const result = changePassword(currentPassword, nextPassword);
    await notify({ title: result.ok ? '변경 완료' : '변경 실패', message: result.message, tone: result.ok ? 'success' : 'warning' });
    if (result.ok) {
      setCurrentPassword('');
      setNextPassword('');
    }
  };

  const handleClearStatistics = async () => {
    const confirmed = await confirm({
      title: '데이터 삭제',
      message: '통계와 학습이력 데이터를 삭제하시겠습니까?\n삭제한 데이터는 되돌릴 수 없습니다.',
      tone: 'danger',
      confirmLabel: '삭제하기',
      cancelLabel: '유지하기',
    });
    if (!confirmed) return;
    clearStatistics();
    await notify({ title: '삭제 완료', message: '통계 삭제 요청이 처리되었습니다.', tone: 'success' });
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
              <label className="block text-sm font-bold text-gray-500 mb-1">아이디</label>
              <input type="text" value={currentUser?.id ?? 'demo'} disabled className="w-full rounded-2xl border-2 border-gray-200 bg-gray-100 px-4 py-3 font-bold text-gray-600 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-500 mb-1">닉네임</label>
              <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-500 mb-1">정보 변경 인증 비밀번호</label>
              <input type="password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white" />
            </div>
            <Button type="button" variant="secondary" onClick={handleAccountSave}>
              계정정보 변경
            </Button>
          </div>
        </div>

        <div className="card-duo">
          <h2 className="text-xl font-black text-gray-700 mb-4 flex items-center">
            <User className="mr-2 text-[#ff4b4b]" /> 비밀번호 변경
          </h2>
          <div className="space-y-4">
            <input type="password" placeholder="현재 비밀번호" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white" />
            <input type="password" placeholder="새 비밀번호" value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3 font-bold text-gray-700 outline-none transition focus:border-[#1cb0f6] focus:bg-white" />
            <Button type="button" variant="danger" onClick={handlePasswordChange}>
              비밀번호 변경
            </Button>
          </div>
        </div>

        <div className="card-duo">
          <h2 className="text-xl font-black text-gray-700 mb-4 flex items-center">
            <Bell className="mr-2 text-[#58cc02]" /> 알림창 설정
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-bold text-gray-500 mb-1">알림 빈도</label>
              <select value={alertFrequency} onChange={(e) => setAlertFrequency(e.target.value)} className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3 font-bold text-gray-700 outline-none">
                <option value="0">즉시</option>
                <option value="5">5분</option>
                <option value="10">10분</option>
                <option value="30">30분</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-500 mb-1">알림 세기</label>
              <select value={alertStrength} onChange={(e) => setAlertStrength(e.target.value)} className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3 font-bold text-gray-700 outline-none">
                <option value="soft">약함</option>
                <option value="normal">보통</option>
                <option value="strong">강함</option>
              </select>
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
                <Bell className="mr-3 text-gray-500" />
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
                <Moon className="mr-3 text-gray-500" />
                <span className="font-bold text-gray-700">다크 모드</span>
              </div>
              <button 
                onClick={handleThemeToggle}
                className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 ${darkMode ? 'bg-[#1cb0f6]' : 'bg-gray-300'}`}
              >
                <div className={`w-6 h-6 rounded-full bg-white transition-transform ${darkMode ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="card-duo">
          <h2 className="text-xl font-black text-gray-700 mb-4 flex items-center">
            <SlidersHorizontal className="mr-2 text-[#1cb0f6]" /> 자세 교정 기준
          </h2>
          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-500">경고 점수 기준: {scoreThreshold}점 이하</span>
              <input type="range" min="40" max="95" value={scoreThreshold} onChange={(e) => setScoreThreshold(Number(e.target.value))} className="w-full" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-500">자세 무너짐 민감도: {collapseSensitivity}%</span>
              <input type="range" min="10" max="100" value={collapseSensitivity} onChange={(e) => setCollapseSensitivity(Number(e.target.value))} className="w-full" />
            </label>
          </div>
        </div>

        <div className="card-duo border-red-200 bg-red-50">
          <h2 className="text-xl font-black text-gray-700 mb-4 flex items-center">
            <Trash2 className="mr-2 text-[#ff4b4b]" /> 데이터 관리
          </h2>
          <Button type="button" variant="danger" onClick={handleClearStatistics}>
            통계 삭제
          </Button>
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
