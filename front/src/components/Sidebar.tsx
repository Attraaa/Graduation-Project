import { useState } from 'react';
import type React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, BarChart2, Settings, LogOut, CalendarDays, Sparkles } from 'lucide-react';
import { useMonitoring } from '../features/session/monitoringContext';
import { logoutAfterSaving } from '../utils/authStore';
import { useDialog } from './dialog/useDialog';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { confirm } = useDialog();
  const { upper, keyboard } = useMonitoring();
  const [leaving, setLeaving] = useState(false);
  const measuring = upper.controls.isRunning || keyboard.controls.isRunning;

  const navItems = [
    { name: '학습', path: '/dashboard', icon: <Home size={22} /> },
    { name: '통계', path: '/statistics', icon: <BarChart2 size={22} /> },
    { name: '학습이력', path: '/history', icon: <CalendarDays size={22} /> },
    { name: 'AI 총평', path: '/ai-review', icon: <Sparkles size={22} /> },
    { name: '설정', path: '/settings', icon: <Settings size={22} /> },
  ];

  const handleLogout = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (leaving) return;
    const confirmed = await confirm({
      title: '로그아웃',
      message: measuring ? '측정 중이에요. 측정을 멈추고 지금까지의 기록을 저장한 뒤 로그아웃할까요?' : '현재 계정에서 로그아웃하시겠습니까?',
      tone: 'danger',
      confirmLabel: '로그아웃',
      cancelLabel: '취소',
    });
    if (!confirmed) return;
    // The last batches are sent with the current login, so the session is cleared only after they are saved.
    setLeaving(true);
    const left = await logoutAfterSaving(() => confirm({
      title: '기록 저장 실패',
      message: '마지막 측정 기록을 서버에 저장하지 못했어요. 로그아웃하면 저장하지 못한 기록은 사라져요. 그래도 로그아웃할까요?',
      tone: 'danger',
      confirmLabel: '그래도 로그아웃',
      cancelLabel: '취소',
    }));
    setLeaving(false);
    if (left) navigate('/login');
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-border bg-surface px-4 py-3 md:relative md:w-52 md:flex-col md:justify-start md:border-r md:border-t-0 md:px-3 md:py-6">
      {/* Logo Area (Hidden on mobile) */}
      <div className="mb-8 hidden w-full px-3 md:block">
        <h1 className="text-2xl font-extrabold tracking-tight text-heading">
          Moti<span className="text-brand">.</span>
        </h1>
      </div>

      {/* Nav Items */}
      <nav className="flex w-full flex-row justify-around md:flex-col md:space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.name}
              to={item.path}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center rounded-xl px-3 py-2.5 font-semibold transition-colors ${
                isActive ? 'bg-nav-active text-heading' : 'text-muted hover:bg-nav-active hover:text-heading'
              }`}
            >
              <div className="flex items-center justify-center md:mr-3">{item.icon}</div>
              <span className="hidden md:block">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Area */}
      <div className="mt-auto hidden w-full md:block">
        <Link
          to="/login"
          onClick={handleLogout}
          className="flex w-full items-center rounded-xl px-3 py-2.5 font-semibold text-[#d94b4b] transition-colors hover:bg-red-50 hover:text-[#c73737]"
        >
          <div className="flex items-center justify-center md:mr-3"><LogOut size={22} /></div>
          <span className="hidden md:block">{leaving ? '기록 저장 중…' : '로그아웃'}</span>
        </Link>
      </div>
    </div>
  );
};

export default Sidebar;
